# Login com Google: clientes OAuth pela API interna do Cloud Console

Capturado criando os clientes do Champ (out/2026) com o Cloud Console logado.
Não existe API pública para criar cliente OAuth do tipo Web/Android (o
`gcloud` só cobre clientes do IAP), então o caminho é o mesmo do console:
chamar a API interna de dentro do navegador logado.

## O que um app Android + web precisa

| Cliente | Para quê | Dados |
| --- | --- | --- |
| Web | `webClientId` do app e botão do Google no site | origens JS (`https://app…`, `http://localhost:3000`) |
| Android (EAS) | APK/AAB assinado pelo keystore do EAS | pacote + SHA-1 do keystore EAS |
| Android (Play) | app baixado da Play, reassinado pela Play | pacote + SHA-1 da **chave de assinatura de apps** |
| Android (dev) | variante `.dev` | pacote `.dev` + SHA-1 do keystore dela |

O ID token que o app recebe tem `aud` = Client ID **Web**. O backend só
precisa validar esse `aud`; os clientes Android existem para o Google aceitar
o pacote + assinatura (sem eles: `DEVELOPER_ERROR`).

## Onde achar os SHA-1

- **EAS** (GraphQL, sessão do `~/.expo/state.json`):

  ```graphql
  { app { byId(appId: "<projectId>") { androidAppCredentials(filter: {}) {
      applicationIdentifier
      androidAppBuildCredentialsList { androidKeystore { sha1CertificateFingerprint } }
  } } } }
  ```

- **Play** (`/app/{appId}/keymanagement`): o SHA-1 da chave de assinatura só
  aparece num botão de copiar. Interceptar `navigator.clipboard.writeText` e
  clicar no botão `aria-label*="SHA-1"` devolve o valor. O SHA-1 visível em
  texto na mesma página é o da **chave de carregamento** (= keystore EAS).

## API

Host `https://clientauthconfig.clients6.google.com`, chamada de dentro do
iframe `console.cloud.google.com/pangolin/iframe.html` (o `fetch`/XHR da página
principal não vê essas chamadas; é preciso instrumentar o iframe). Autenticação
igual às outras `*.clients6`: `SAPISIDHASH` + `X-Goog-AuthUser` + `key` do console,
ou seja, só funciona no navegador logado.

### Listar

```
GET /v1/clients?projectNumber=<n>&readMask=client_id,redirect_uris,
    post_message_origins,type,auth_type,native_app_info,creation_time,
    display_name&returnDisabledClients=true
```

### Criar cliente Android

```jsonc
// POST /v1/clients
{
  "type": "NATIVE_ANDROID",
  "displayName": "Champ Android (Play)",
  "nativeAppInfo": {
    "androidInfo": {
      "androidPackageName": "com.diegohorvatti.champ",
      "androidCertificateHash": "hds00KliNU+lPIQ1eVOFCRcCIKg="
    }
  },
  "authType": "SHARED_SECRET",
  "brandId": "<projectNumber>",
  "projectNumber": "<projectNumber>"
}
```

`androidCertificateHash` é o SHA-1 em **base64 dos bytes**, não o hex com `:`:

```js
btoa(String.fromCharCode(...'85:DB:34:…'.split(':').map((h) => parseInt(h, 16))))
```

A resposta traz `clientId`. Cliente Android não tem secret.

### Criar cliente Web

Mesmo endpoint, `type: "WEB"`. O corpo exato não foi capturado (o monitor do
iframe entrou depois); pelo `readMask` da listagem as origens ficam em
`postMessageOrigins` e os redirects em `redirectUris`. A resposta traz o
`clientSecret` (`GOCSPX-…`), que **não** é necessário para login por ID token —
não guardar.

## Antes dos clientes: tela de consentimento

1. Branding: nome do app, e-mail de suporte, página inicial, política de
   privacidade, domínio autorizado (entra sozinho a partir das origens).
2. Público: **Externo**, e depois **Publicar app** (sai de "Teste"). Só com
   escopos básicos (`openid email profile`) e sem logotipo não há verificação.
   Subir logotipo obriga verificação.
3. Concordar com a *Google API Services User Data Policy* (checkbox) — é
   aceite de termos: confirmar com o dono da conta antes.

Esses passos passam pelo transporte GraphQL do console
(`cloudconsole-pa.clients6.google.com/v3/entityServices/OauthEntityService/...`)
e não foram isolados; por ora seguem pelo RPA de navegador.
