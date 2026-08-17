# Publicação sem gateway Node

## Serviço do Jarbas

O backend roda como uma unidade systemd do usuário `raphael`. O arquivo fonte
versionado está em `deploy/systemd/jarbas.service` e a unidade instalada fica em
`~/.config/systemd/user/jarbas.service`.

Comandos de operação:

```shell
systemctl --user status jarbas
systemctl --user restart jarbas
systemctl --user stop jarbas
systemctl --user start jarbas
journalctl --user-unit jarbas -f
```

A unidade está habilitada no `default.target` e o usuário possui `Linger=yes`,
portanto o serviço inicia no boot sem depender de uma sessão ou de um `tmux`.
Para reinstalar a unidade depois de alterar o arquivo versionado:

```shell
install -d -m 0755 ~/.config/systemd/user
install -m 0644 deploy/systemd/jarbas.service ~/.config/systemd/user/jarbas.service
systemctl --user daemon-reload
systemctl --user enable --now jarbas
```

## Build

Gere o bundle no diretório que o Jarbas serve:

```shell
cd /opt/Assistant/JarbasPwa
npm run build
```

O FastAPI monta `/opt/Assistant/JarbasPwa/dist` na raiz depois de registrar as
rotas de API. O caminho pode ser alterado com `PWA_DIST_DIR`.

## Rota única no Cosmos

Crie apenas uma rota para o hostname:

- nome: `JarbasApp`;
- tipo: `PROXY`;
- hostname: `jarbasapp.sandre.dev`;
- path prefix: vazio;
- target: `http://127.0.0.1:18181`;
- autenticação e Smart Shield: ligados;
- strip prefix: desligado.

Na mesma rota, descarte valores recebidos do navegador e injete os headers de
requisição internos:

- `User-Agent`: valor de `JARBAS_USER_AGENT`;
- `X-Jarbas-Key`: valor de `JARBAS_API_KEY`.

Não mantenha uma rota SPA e outra `/admin` no mesmo hostname: elas compartilham
o callback OpenID do Cosmos e podem selecionar clientes diferentes. Não publique
a porta 18181 diretamente.

Validação:

```shell
curl -I https://jarbasapp.sandre.dev/
curl -I https://jarbasapp.sandre.dev/admin/overview
```

Sem sessão, ambas devem iniciar o mesmo fluxo OpenID. Depois do login, a raiz
deve retornar HTML e `/admin/overview`, JSON.

Cache recomendado:

- `/assets/*`: `public, max-age=31536000, immutable`;
- `/index.html`, `/manifest.webmanifest` e `/sw.js`: `no-cache`.

## PieSocket

O chat conecta em:

```text
wss://ws.core.sandre.dev/v3/chatroom?api_key=jarbas-devel&notify_self=1
```

O app PieSocket precisa aceitar mensagens de cliente para o PWA enviar
`jarbas:input` e `jarbas:ack`. Como a chave da aplicação é pública, proteja
o host WSS no Cosmos e limite o acesso antes de habilitar essa opção. Para uma
exposição pública futura, prefira autenticação de usuário/JWT do PieSocket.

No Jarbas, habilite `PIESOCKET_ENABLED=true` e use a mesma URL. O bridge
consome inputs, publica resultados e mantém respostas sem ACK como
`awaiting_delivery`.

## CSP

```text
Content-Security-Policy: default-src 'self'; connect-src 'self' wss://ws.core.sandre.dev; img-src 'self' data:; style-src 'self'; script-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

O service worker não intercepta WebSocket nem armazena conversas.
