import { beforeEach, describe, expect, it, vi } from "vitest";
import { JarbasSocket, toConversation } from "./api";

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];

  constructor(readonly url: string) {
    super();
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.dispatchEvent(new Event("open"));
    });
  }

  send(payload: string) { this.sent.push(payload); }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
  message(payload: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
  }
}

describe("JarbasSocket", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    localStorage.clear();
    localStorage.setItem("jarbas-client-id", "client-1");
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
  });

  it("publishes an input, correlates the result and acknowledges delivery", async () => {
    const client = new JarbasSocket("wss://example.test/v3/chatroom");
    await client.connect();
    const socket = FakeWebSocket.instances[0];

    expect(JSON.parse(socket.sent[0])).toEqual({
      event: "jarbas:recover",
      data: { client_id: "client-1" },
    });

    const responsePromise = client.sendInteraction("olá");
    await Promise.resolve();
    expect(JSON.parse(socket.sent[1])).toEqual({
      event: "jarbas:input",
      data: { request_id: "00000000-0000-4000-8000-000000000001", client_id: "client-1", text: "olá" },
    });

    socket.message({
      event: "jarbas:result",
      data: {
        request_id: "00000000-0000-4000-8000-000000000001",
        client_id: "client-1",
        interaction_id: "interaction-1",
        response: {
          input: "olá",
          output: "oi, patrão",
          intent: { name: "conversation" },
        },
      },
    });

    await expect(responsePromise).resolves.toMatchObject({ output: "oi, patrão" });
    expect(JSON.parse(socket.sent[2])).toMatchObject({
      event: "jarbas:ack",
      data: { interaction_id: "interaction-1" },
    });
    client.close();
  });

  it("uses intent as a readable fallback when output is empty", () => {
    expect(toConversation({
      input: "luz",
      output: null,
      intent: { name: "casa.luzes", action: "ligar" },
    }).reply).toBe("ligar");
  });
});
