export type SocketState = "connecting" | "connected" | "offline";

export interface JarbasIntent {
  name: string;
  action?: string | null;
  entities?: Record<string, unknown>;
  confidence?: number;
  requires_response?: boolean;
}

export interface InteractionResponse {
  input: string;
  intent: JarbasIntent;
  output: string | null;
}

interface PieSocketEnvelope {
  event: string;
  data?: Record<string, unknown>;
}

interface PendingInteraction {
  resolve: (response: InteractionResponse) => void;
  reject: (error: Error) => void;
  timeout: number;
}

const DEFAULT_PIESOCKET_URL =
  "wss://ws.core.sandre.dev/v3/chatroom?api_key=jarbas-devel&notify_self=1";
const CONNECT_TIMEOUT_MS = 10_000;
const INTERACTION_TIMEOUT_MS = 120_000;
const MAX_RECONNECT_MS = 15_000;
const CLIENT_ID_KEY = "jarbas-client-id";

export function pieSocketUrl(): string {
  return import.meta.env.VITE_PIESOCKET_URL?.trim() || DEFAULT_PIESOCKET_URL;
}

function clientId(): string {
  const stored = window.localStorage.getItem(CLIENT_ID_KEY);
  if (stored) return stored;
  const created = crypto.randomUUID();
  window.localStorage.setItem(CLIENT_ID_KEY, created);
  return created;
}

function isInteractionResponse(value: unknown): value is InteractionResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Partial<InteractionResponse>;
  return (
    typeof response.input === "string" &&
    typeof response.intent === "object" &&
    response.intent !== null &&
    typeof response.intent.name === "string" &&
    (typeof response.output === "string" || response.output === null)
  );
}

export function toConversation(response: InteractionResponse): { input: string; reply: string } {
  const reply = response.output?.trim()
    || response.intent.action?.trim()
    || response.intent.name.trim();
  return { input: response.input, reply };
}

export class JarbasSocket {
  private readonly clientId = clientId();
  private socket: WebSocket | null = null;
  private state: SocketState = "connecting";
  private stateListeners = new Set<(state: SocketState) => void>();
  private recoveredListeners = new Set<(response: InteractionResponse) => void>();
  private pending = new Map<string, PendingInteraction>();
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private stopped = false;
  private connecting: Promise<void> | null = null;

  constructor(private readonly url = pieSocketUrl()) {}

  subscribeState(listener: (state: SocketState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  subscribeRecovered(listener: (response: InteractionResponse) => void): () => void {
    this.recoveredListeners.add(listener);
    return () => this.recoveredListeners.delete(listener);
  }

  connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connecting) return this.connecting;

    this.stopped = false;
    this.setState("connecting");
    this.connecting = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      let opened = false;
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error("Tempo esgotado ao conectar com o Jarbas"));
      }, CONNECT_TIMEOUT_MS);

      socket.addEventListener("open", () => {
        opened = true;
        window.clearTimeout(timeout);
        this.connecting = null;
        this.reconnectAttempt = 0;
        this.setState("connected");
        this.publish("jarbas:recover", { client_id: this.clientId });
        resolve();
      }, { once: true });

      socket.addEventListener("message", (event) => this.handleMessage(event));
      socket.addEventListener("close", () => {
        window.clearTimeout(timeout);
        this.connecting = null;
        if (!opened) reject(new Error("Não foi possível conectar com o Jarbas"));
        if (!this.stopped) {
          this.setState("offline");
          this.scheduleReconnect();
        }
      });
      socket.addEventListener("error", () => socket.close());
    });

    return this.connecting;
  }

  async sendInteraction(text: string): Promise<InteractionResponse> {
    await this.connect();
    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("O Jarbas demorou demais para responder"));
      }, INTERACTION_TIMEOUT_MS);

      this.pending.set(requestId, { resolve, reject, timeout });
      try {
        this.publish("jarbas:input", {
          request_id: requestId,
          client_id: this.clientId,
          text,
        });
      } catch (error) {
        window.clearTimeout(timeout);
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error("Falha ao enviar mensagem"));
      }
    });
  }

  close(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close(1000, "PWA encerrado");
    this.socket = null;
    for (const item of this.pending.values()) {
      window.clearTimeout(item.timeout);
      item.reject(new Error("Conexão encerrada"));
    }
    this.pending.clear();
  }

  private publish(event: string, data: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Jarbas desconectado");
    }
    this.socket.send(JSON.stringify({ event, data }));
  }

  private handleMessage(message: MessageEvent): void {
    let envelope: PieSocketEnvelope;
    try {
      envelope = JSON.parse(String(message.data)) as PieSocketEnvelope;
    } catch {
      return;
    }
    if (!envelope.data || envelope.data.client_id !== this.clientId) return;

    const requestId = envelope.data.request_id;
    if (typeof requestId !== "string") return;

    if (envelope.event === "jarbas:error") {
      const item = this.pending.get(requestId);
      if (!item) return;
      window.clearTimeout(item.timeout);
      this.pending.delete(requestId);
      item.reject(new Error(String(envelope.data.message || "O Jarbas não conseguiu responder")));
      return;
    }
    if (envelope.event !== "jarbas:result") return;

    const response = envelope.data.response;
    const interactionId = envelope.data.interaction_id;
    if (!isInteractionResponse(response) || typeof interactionId !== "string") return;

    this.publish("jarbas:ack", {
      request_id: requestId,
      client_id: this.clientId,
      interaction_id: interactionId,
    });
    const item = this.pending.get(requestId);
    if (item) {
      window.clearTimeout(item.timeout);
      this.pending.delete(requestId);
      item.resolve(response);
    } else {
      for (const listener of this.recoveredListeners) listener(response);
    }
  }

  private setState(state: SocketState): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null) return;
    const base = Math.min(1_000 * 2 ** this.reconnectAttempt++, MAX_RECONNECT_MS);
    const delay = Math.round(base * (0.8 + Math.random() * 0.4));
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => undefined);
    }, delay);
  }
}
