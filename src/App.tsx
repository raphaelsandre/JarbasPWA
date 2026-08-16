import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import AdminConsole from "./Admin";
import { JarbasSocket, SocketState, toConversation } from "./api";
import { useInstallPrompt } from "./useInstallPrompt";

type Author = "user" | "jarbas";
type Mode = "chat" | "admin";

interface Message {
  id: number;
  author: Author;
  text: string;
}

function errorMessage(error: unknown): string {
  if (!navigator.onLine) return "Você está sem internet. Seu texto foi preservado.";
  if (error instanceof Error && error.message) return error.message;
  return "Não consegui falar com o Jarbas. Tente novamente em instantes.";
}

export default function App() {
  const [mode, setMode] = useState<Mode>("chat");
  const [connection, setConnection] = useState<SocketState>("connecting");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);
  const listEnd = useRef<HTMLDivElement>(null);
  const socket = useRef<JarbasSocket | null>(null);
  const { canInstall, install, iosHelpOpen, closeIosHelp } = useInstallPrompt();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    const client = new JarbasSocket();
    socket.current = client;
    const unsubscribeState = client.subscribeState(setConnection);
    const unsubscribeRecovered = client.subscribeRecovered((response) => {
      const recovered = toConversation(response);
      setMessages((current) => [
        ...current,
        { id: nextId.current++, author: "user", text: recovered.input },
        { id: nextId.current++, author: "jarbas", text: recovered.reply },
      ]);
    });
    void client.connect().catch(() => undefined);

    return () => {
      unsubscribeState();
      unsubscribeRecovered();
      client.close();
      socket.current = null;
    };
  }, []);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    const optimisticMessageId = nextId.current++;
    setDraft("");
    setMessages((current) => [
      ...current,
      { id: optimisticMessageId, author: "user", text },
    ]);
    setSending(true);
    setError(null);
    try {
      if (!socket.current) throw new Error("Conexão com o Jarbas indisponível");
      const response = toConversation(await socket.current.sendInteraction(text));
      setMessages((current) => [
        ...current,
        { id: nextId.current++, author: "jarbas", text: response.reply },
      ]);
    } catch (cause) {
      setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
      setDraft((current) => current || text);
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className={`app-shell app-shell--${mode}`}>
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setMode("chat")} aria-label="Abrir conversa do Jarbas">
          <img className="brand-mark" src="/icons/jarbas-logo.jpg" alt="" />
          <div><strong>Jarbas</strong><span>Sandre AI</span></div>
        </button>
        <nav className="mode-switch" aria-label="Área do aplicativo">
          <button type="button" className={mode === "chat" ? "active" : ""} onClick={() => setMode("chat")}>Conversa</button>
          <button type="button" className={mode === "admin" ? "active" : ""} onClick={() => setMode("admin")}>Admin</button>
        </nav>
        <div className="topbar-actions">
          {canInstall && <button className="install-button" type="button" onClick={() => void install()}>Instalar</button>}
          <div className={`connection connection--${connection}`} role="status">
            <span aria-hidden="true" />
            {connection === "connecting" ? "Conectando" : connection === "connected" ? "Online" : "Offline"}
          </div>
        </div>
      </header>

      {mode === "chat" ? (
        <>
          <main className="conversation" aria-live="polite">
            {messages.length === 0 && !sending ? (
              <section className="welcome">
                <div className="welcome-avatar"><img src="/icons/jarbas-logo.jpg" alt="Jarbas, assistente Sandre AI" /></div>
                <p className="eyebrow">PIESOCKET CONECTADO</p>
                <h1>O que vamos fazer?</h1>
                <p>Converse com o Jarbas. O contexto e a entrega ficam por conta dele.</p>
              </section>
            ) : (
              <div className="message-list">
                {messages.map((message) => (
                  <article key={message.id} className={`message message--${message.author}`}>
                    {message.author === "jarbas" && <span className="message-label">Jarbas</span>}
                    <p>{message.text}</p>
                  </article>
                ))}
                {sending && <div className="thinking" role="status"><span /><span /><span /><em>Pensando</em></div>}
                <div ref={listEnd} />
              </div>
            )}
          </main>

          <div className="composer-region">
            {error && <div className="error-card" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Fechar aviso">×</button></div>}
            <form className="composer" onSubmit={submit}>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown}
                placeholder="Converse com o Jarbas…" aria-label="Mensagem para o Jarbas" rows={1} disabled={sending} />
              <button className="send-button" type="submit" disabled={sending || !draft.trim()} aria-label="Enviar mensagem"><span aria-hidden="true">↑</span></button>
            </form>
            <p className="composer-hint">Enter envia · Shift + Enter quebra a linha</p>
          </div>
        </>
      ) : <AdminConsole />}

      {iosHelpOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeIosHelp}>
          <section className="install-sheet" role="dialog" aria-modal="true" aria-labelledby="install-title" onMouseDown={(e) => e.stopPropagation()}>
            <div className="sheet-handle" /><h2 id="install-title">Instale o Jarbas</h2>
            <ol><li>Toque em <strong>Compartilhar</strong> no Safari.</li><li>Escolha <strong>Adicionar à Tela de Início</strong>.</li><li>Confirme em <strong>Adicionar</strong>.</li></ol>
            <button className="sheet-action" type="button" onClick={closeIosHelp}>Entendi</button>
          </section>
        </div>
      )}

      {needRefresh && (
        <div className="update-toast" role="status"><span>Uma versão nova está pronta.</span>
          <button type="button" onClick={() => void updateServiceWorker(true)}>Atualizar</button>
          <button type="button" aria-label="Agora não" onClick={() => setNeedRefresh(false)}>×</button>
        </div>
      )}
    </div>
  );
}
