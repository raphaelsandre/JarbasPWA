import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const socketMocks = vi.hoisted(() => ({
  send: vi.fn(),
  close: vi.fn(),
}));

vi.mock("./api", () => ({
  JarbasSocket: class {
    subscribeState(listener: (state: string) => void) {
      listener("connected");
      return vi.fn();
    }
    subscribeRecovered() { return vi.fn(); }
    connect() { return Promise.resolve(); }
    close() { socketMocks.close(); }
    sendInteraction(text: string) { return socketMocks.send(text); }
  },
  toConversation: (response: { input: string; output: string; intent: { name: string } }) => ({
    input: response.input,
    reply: response.output || response.intent.name,
  }),
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    socketMocks.send.mockReset();
  });

  it("sends text through PieSocket and renders the response", async () => {
    let resolveResponse!: (value: { input: string; output: string; intent: { name: string } }) => void;
    socketMocks.send.mockImplementation(() => new Promise((resolve) => {
      resolveResponse = resolve;
    }));
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText("Mensagem para o Jarbas");
    await user.type(input, "olá");
    await user.click(screen.getByLabelText("Enviar mensagem"));

    expect(input).toHaveValue("");
    expect(screen.getByText("olá")).toBeInTheDocument();
    expect(screen.getByText("Pensando")).toBeInTheDocument();
    expect(socketMocks.send).toHaveBeenCalledWith("olá");

    resolveResponse({
      input: "olá",
      output: "fala comigo",
      intent: { name: "conversation" },
    });

    expect(await screen.findByText("fala comigo")).toBeInTheDocument();
  });

  it("preserves the draft when the socket request fails", async () => {
    socketMocks.send.mockRejectedValue(new Error("socket caiu"));
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText("Mensagem para o Jarbas");
    await user.type(input, "não esqueça isto");
    await user.click(screen.getByLabelText("Enviar mensagem"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("socket caiu"));
    expect(input).toHaveValue("não esqueça isto");
  });

  it("opens the backend administration console", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      model: "qwen", tables: 3, rows: 12, tools: 2, tools_enabled: 1,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Admin" }));
    expect(await screen.findByText("Backend sob controle.")).toBeInTheDocument();
  });
});
