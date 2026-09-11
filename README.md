# playpub

CLI para **automatizar a publicação de apps Android na Google Play Console** — do zero ao teste fechado. Feito pra **monorepos** (N apps por repo) e pra ser **dirigido por IA** (Claude Code) via um servidor **MCP** embutido.

> Você baixa no seu projeto, aponta um arquivo de config (que pode ler do seu `app.json` do Expo) e roda. O que dá pra automatizar via API, ele faz sozinho. O que só existe no console, ele te guia (ou dirige via RPA).

## As 3 camadas da automação do Play Console

A publicação no Play **não é** uma coisa só — ela se divide em 3 camadas, e o `playpub` trata cada uma:

| Camada | O quê | Como o playpub resolve |
|---|---|---|
| **1. API** | Enviar AAB/APK, faixas, testadores, países, ficha da loja (texto + ícone + feature + screenshots), lançamentos | `playpub publish` — Google Play Developer API (`androidpublisher`). **Funciona de verdade.** |
| **2. Só-console (RPA)** | Declarações de "Conteúdo da app" (privacidade, anúncios, classificação IARC, segurança de dados, público-alvo…) e criação do 1º app | `src/rpa/` — Playwright dirigindo o navegador logado. Sem API oficial. |
| **3. Manual (one-time)** | Criar a **service account** no Google Cloud + **convidá-la** no Play Console | `playpub setup:sa` faz o Cloud e o secret; o convite no Play é o único clique manual (o Google não tem API pra isso). |

## Instalação

```bash
# global
npm i -g playpub

# ou dentro do seu projeto (pra customizar)
git clone https://github.com/DIEGOHORVATTI/playpub && cd playpub
npm i && npm run build && npm link
```

## Pré-requisitos (CLIs)

O `playpub doctor` checa isto:

- **node** ≥ 18 — runtime
- **gcloud** — cria projeto GCP + service account (`setup:sa`) · [instalar](https://cloud.google.com/sdk/docs/install)
- **gh** (GitHub CLI, autenticado) — grava a chave da SA como secret e dispara workflows · [instalar](https://cli.github.com)
- **java** (opcional) — assinar o AAB localmente, se não assinar no CI

## Começando

```bash
playpub init         # cria playpub.config.json (detecta apps/* de monorepo Expo)
playpub doctor       # checa CLIs + valida a config
playpub setup:sa --repo SEU_USER/SEU_REPO   # cria a service account e grava o secret
#   → depois: convide o e-mail da SA no Play Console (o comando te diz qual)
playpub publish --app unitv --status draft  # sobe o AAB + ficha pra faixa alpha
playpub links --all  # imprime os links de opt-in e de loja
```

## Config (monorepo)

Um `playpub.config.json` descreve **N apps**. Cada app pode herdar de `defaults` e ler `packageName`/versão de um `app.json` do Expo. Veja [`playpub.config.example.json`](./playpub.config.example.json).

```jsonc
{
  "serviceAccountKey": "PLAY_SERVICE_ACCOUNT_JSON", // arquivo .json OU nome de env
  "defaults": { "track": "alpha", "status": "draft" },
  "apps": {
    "unitv": {
      "expoAppJson": "apps/unitv/app.json",
      "aab": "apps/unitv/android/app/build/outputs/bundle/release/app-release.aab",
      "listing": { "pt-BR": { "title": "…", "shortDescription": "…", "fullDescription": "…",
                              "icon": "…/icon-512.png", "featureGraphic": "…/feature-1024x500.png",
                              "phoneScreenshots": ["…/1.png", "…/2.png"] } },
      "testers": { "countries": ["BR"], "emails": ["tester@gmail.com"] }
    },
    "nexatv": { "expoAppJson": "apps/nexatv/app.json", "aab": "…" }
  }
}
```

Seleção de app: `--app <nome>` ou `--all`. Se o repo tem só 1 app, ele é o default.

## Uso por IA (MCP)

O `playpub` sobe um **servidor MCP** que expõe os comandos como tools (`playpub_doctor`, `playpub_publish`, `playpub_links`, `playpub_setup_sa`, `playpub_init`). Toda tool devolve um `Result` em JSON. Registre no seu cliente MCP:

```jsonc
// .mcp.json / config do Claude Code
{ "mcpServers": { "playpub": { "command": "playpub", "args": ["mcp"] } } }
```

Ou pela CLI, tudo aceita `--json` pra saída estruturada e exit code determinístico (`0` ok, `1` erro).

## CI/CD (GitHub Actions)

Tem um **workflow de referência** pronto em [`templates/github-actions-publish.yml`](./templates/github-actions-publish.yml): faz build do AAB, assina em **cadeia única** (via `android.injected.signing.*` — reassinar depois faz o Play recusar com _"multiple certificate chains"_), e publica com `playpub publish`. Copie pra `.github/workflows/` e ajuste o passo de build ao seu app.

Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` e `PLAY_SERVICE_ACCOUNT_JSON` (esse o `playpub setup:sa` cria e grava).

## Comandos

| Comando | Camada | O quê |
|---|---|---|
| `init` | — | cria a config (detecta monorepo Expo) |
| `doctor` | — | checa CLIs obrigatórias + valida a config |
| `setup:sa` | 3 | cria projeto GCP + SA + chave + secret no GitHub |
| `publish` | 1 | sobe AAB + ficha da loja pra faixa (API) |
| `links` | 1 | links de opt-in e de loja |
| `mcp` | — | sobe o servidor MCP (stdio) |

## Segurança

- A chave da service account **nunca** é commitada. O `.gitignore` cobre `*service-account*.json`, `play-sa*.json`, `.env*`. O `setup:sa` gera a chave num tempdir e **apaga** depois de gravar o secret.
- Guarde a chave só como **secret do GitHub** (ou variável de ambiente do CI).

## Roadmap

- [ ] `rpa:declarations` completo (Playwright) — camada 2 ponta-a-ponta
- [ ] Import/Export CSV da Segurança de dados
- [ ] `create-app` (criação do 1º app via RPA)
- [ ] `promote` (mover de faixa) e `rollout` (percentual)
- [ ] schema.json publicado + validação forte da config

## Licença

MIT © Diego Horvatti
