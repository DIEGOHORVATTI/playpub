# API interna do Play Console

Capturado interceptando `fetch`/`XMLHttpRequest` na própria página do console,
com a sessão do programador logada. Serve para trocar cliques de RPA por
chamadas diretas dentro do `page.evaluate()` do Playwright — mais rápido e
muito menos frágil que procurar botões.

## Como autentica

Não dá para chamar de fora do browser. Cada requisição leva, na query string
`$httpHeaders` (CRLF-encoded):

```
Content-Type: application/json+protobuf
X-Goog-AuthUser: 0
Authorization: SAPISIDHASH <timestamp>_<sha1>
X-Goog-Api-Key: <chave pública do console>
X-Play-Console-Session-Id: <id da sessão>
```

O `SAPISIDHASH` é derivado do cookie `SAPISID` do domínio google.com, com
timestamp. Ou seja: **só funciona dentro de um browser já logado**. É por isso
que a camada 2 continua precisando de RPA — mas o RPA pode chamar a API em vez
de clicar.

## Corpo em JSON+protobuf

Os campos são numerados, não nomeados. Exemplo real do formulário
**Detalhes de início de sessão** (`app-content/testing-credentials`):

```jsonc
// POST playconsoleapps-pa.clients6.google.com/v1/developers/{devId}/apps/{appId}/...
{
  "1": true,                       // app exige credenciais de login
  "2": [{
    "2": "qa2@exemplo.com",        // utilizador
    "3": "senha",                  // palavra-passe
    "4": "instruções em inglês",   // como entrar
    "5": "Conta de teste Champ",   // nome da credencial
    "6": true                      // dá acesso total às funcionalidades
  }],
  "3": true
}
```

Resposta espelha o mesmo shape com `"1": 1` indicando sucesso.

## Hosts

| Host | Para quê |
| --- | --- |
| `playconsoleapps-pa.clients6.google.com` | dados do app: declarações, ficha, publicação |
| `playconsoleplatform-pa.clients6.google.com` | telemetria (`featureEvents`, `leafblower`) — ignorável |

## Endpoints observados

```
POST /v1/developers/{devId}/apps/{appId}/publishing:publishingPageNotificationIndicatorData
  → {"1":1}  quantas alterações estão pendentes de envio para revisão
```

## Como capturar mais

Cole no console da página antes de mexer no formulário:

```js
window.__spy = []
const of = window.fetch
window.fetch = async function (i, init) {
  const r = await of.apply(this, arguments)
  const c = r.clone()
  window.__spy.push({ url: typeof i === 'string' ? i : i.url, method: init?.method,
                      req: init?.body, status: r.status, res: await c.text() })
  return r
}
```

Preencha e guarde o formulário, depois leia `window.__spy`.

## Cuidado

Os payloads carregam credenciais em texto puro (o campo `3` acima é a senha da
conta de teste). Não logar isso em CI nem commitar captura crua.

# O que aprendemos publicando o Champ (out/2026)

## Slugs diretos das páginas

Todos sob `https://play.google.com/console/u/0/developers/{devId}/app/{appId}/`:

| Slug | Página |
| --- | --- |
| `app-content/overview` | visão geral do Conteúdo da app (contador "Requerem atenção") |
| `app-content/privacy-policy` | Política de privacidade |
| `app-content/testing-credentials` | Detalhes de início de sessão |
| `app-content/ads-declaration` | Anúncios |
| `app-content/ad-id-declaration` | ID de publicidade |
| `app-content/government-apps` | Apps governamentais |
| `app-content/finance` | Funcionalidades financeiras |
| `app-content/health` | Saúde |
| `app-content/target-audience-content` | Público-alvo |
| `app-content/content-rating-overview` | Classificação de conteúdo |
| `app-content/content-rating-iarc-questionnaire` | questionário IARC |
| `app-content/data-privacy-security` | Segurança de dados |
| `store-settings` | categoria, e-mail e site de contato |

## Segurança de dados: use o CSV, não o wizard

A página tem **Exportar** e **Importar CSV**. O export vem com ~780 linhas
(`Question ID`, `Response ID`, `Response value`, …), uma por resposta possível.
`playpub datasafety --app x --template export.csv` preenche a partir de
`rpa.dataSafety` e o import entra de primeira. O wizard, pelo RPA, quebra nos
diálogos por tipo de dado.

Regras do CSV que a Console valida:

- Tipo declarado: toda escolha dele precisa de `true`/`false` explícito.
- Tipo não declarado: linhas de uso ficam **vazias** (foi assim que o import
  passou sem erro).
- `PSL_ACCOUNT_DELETION_URL` é obrigatório quando há criação de conta. A URL
  precisa responder 200 e explicar como pedir a exclusão.

## Componentes AngularDart

- Rádio e checkbox são `material-radio`/`material-checkbox`: o estado está em
  `aria-checked`, não em `.checked`. Ler `.checked` diz que nada foi marcado.
- `material-dropdown-select` e os diálogos de **Definições da loja** ignoram
  `element.click()` sintético. Precisa de clique real (`locator.click()` do
  Playwright, que despacha mouse events com coordenadas).
- Campos de texto só "pegam" com `fill()` seguido de `blur`; `value = ...`
  não dispara o binding.

## Publicação pela API

- App que nunca passou por revisão está em **rascunho**: `tracks.update` com
  status `completed` falha com `Only releases with status draft may be created
  on draft app`. O `publish` agora rebaixa para `draft` sozinho e avisa.
- Screenshot com lado maior > 2× o menor só é recusado no `edits.commit`, depois
  de subir o AAB. O `publish` agora valida antes (PNG).
- Primeiro envio do AAB pode vir do EAS (`eas build --profile production`) e ser
  baixado com `eas build:list --json` → `artifacts.applicationArchiveUrl`.
  Confira `BundleConfig.pb` dentro do zip para não mandar APK por engano.
