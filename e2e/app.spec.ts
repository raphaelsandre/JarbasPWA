import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class MockWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;
      readyState = 0;
      bufferedAmount = 0;
      extensions = "";
      protocol = "";
      binaryType: BinaryType = "blob";
      onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
      onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
      onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
      onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;

      constructor(readonly url: string) {
        super();
        queueMicrotask(() => {
          this.readyState = 1;
          const event = new Event("open");
          this.dispatchEvent(event);
          this.onopen?.call(this as unknown as WebSocket, event);
        });
      }

      send(raw: string) {
        const message = JSON.parse(raw);
        if (message.event !== "jarbas:input") return;
        queueMicrotask(() => {
          const event = new MessageEvent("message", {
            data: JSON.stringify({
              event: "jarbas:result",
              data: {
                request_id: message.data.request_id,
                client_id: message.data.client_id,
                interaction_id: "e2e-interaction",
                response: {
                  input: message.data.text,
                  output: "entendi você",
                  intent: { name: "conversation" },
                },
              },
            }),
          });
          this.dispatchEvent(event);
          this.onmessage?.call(this as unknown as WebSocket, event);
        });
      }
      close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
    }
    window.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });
});

test("shows the Sandre AI shell and completes a PieSocket conversation", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByText("O que vamos fazer?")).toBeVisible();

  await page.getByLabel("Mensagem para o Jarbas").fill("teste");
  await page.getByLabel("Enviar mensagem").click();

  await expect(page.getByText("teste")).toBeVisible();
  await expect(page.getByText("entendi você")).toBeVisible();
});
