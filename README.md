# Jarbas PWA

PWA instalável do Jarbas com duas áreas:

- conversa em tempo real por WSS através do PieSocket self-hosted;
- console administrativo para banco, modelo ativo e tools HTTP do orchestrator.

O bundle é totalmente estático. Não existe gateway, servidor ou processo Node em
produção.

## Arquitetura

```text
Navegador ──HTTPS──> Cosmos (uma rota autenticada + headers internos)
                         │
                         └──> Jarbas FastAPI ──> dist/ e /admin

PWA ──WSS──> PieSocket <──WSS── Jarbas
```

O próprio FastAPI serve o `dist/` depois das rotas de API. Isso evita a disputa
entre uma rota SPA e outra rota `/admin` no Cosmos.

O transporte usa o canal `chatroom` do app público `jarbas-devel`. Cada
interação leva `request_id` e `client_id`; o Jarbas só marca a resposta como
entregue após o ACK do PWA. Ao reconectar, respostas pendentes são republicadas.

A chave PieSocket presente no frontend é uma chave pública de aplicação. Nenhuma
secret, `JARBAS_API_KEY` ou credencial de modelo entra no bundle.

## Desenvolvimento

```shell
npm install
npm run dev
```

Para outro endpoint PieSocket:

```shell
VITE_PIESOCKET_URL='wss://host/v3/canal?api_key=chave&notify_self=1' npm run dev
```

## Verificação

```shell
npm test
npm run build
npm run preview
```

O resultado publicável fica em `dist/`.

## Jarbas

A integração complementar está no projeto `/opt/Assistant/Jarbas`:

- bridge PieSocket com reconexão;
- ACK e recuperação persistidos na tabela `interactions`;
- rotas protegidas em `/admin`;
- seleção persistente de modelo;
- cadastro de tools HTTP limitado por allowlist.

Configuração do backend:

```dotenv
PIESOCKET_ENABLED=true
PIESOCKET_WS_URL=wss://ws.core.sandre.dev/v3/chatroom?api_key=jarbas-devel&notify_self=1
JARBAS_TOOL_ALLOWED_ORIGINS=https://n8n.exemplo.com,https://automacao.exemplo.com
```

Uma tool só é aceita quando a origem exata do endpoint aparece em
`JARBAS_TOOL_ALLOWED_ORIGINS`. O painel nunca recebe nem armazena tokens.

Veja [DEPLOYMENT.md](DEPLOYMENT.md) para a publicação sem Node.
