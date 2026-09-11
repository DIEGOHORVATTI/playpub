import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, selectApps } from './core/config.js';
import { checkPrereqs } from './core/prereqs.js';
import { appLinks, inspect, publishApp } from './core/play.js';
import { setupServiceAccount } from './core/setupSa.js';
import { init } from './core/init.js';
import type { Result } from './core/types.js';

/**
 * Servidor MCP (stdio): expõe os comandos do playpub como tools pra uma IA
 * (Claude Code, etc.) orquestrar a publicação. Toda tool retorna o Result em JSON.
 */
const TOOLS = [
  { name: 'playpub_doctor', description: 'Checa CLIs obrigatórias (gcloud, gh…) e valida a config.', inputSchema: { type: 'object', properties: { config: { type: 'string' } } } },
  { name: 'playpub_init', description: 'Cria playpub.config.json (detecta monorepo Expo).', inputSchema: { type: 'object', properties: { force: { type: 'boolean' } } } },
  { name: 'playpub_publish', description: 'Sobe AAB + ficha da loja pra faixa via API.', inputSchema: { type: 'object', properties: { app: { type: 'string' }, all: { type: 'boolean' }, track: { type: 'string' }, status: { type: 'string' }, config: { type: 'string' } } } },
  { name: 'playpub_links', description: 'Links de opt-in (teste) e de loja de cada app.', inputSchema: { type: 'object', properties: { app: { type: 'string' }, all: { type: 'boolean' }, config: { type: 'string' } } } },
  { name: 'playpub_setup_sa', description: 'Cria projeto GCP + service account + chave e grava o secret no GitHub.', inputSchema: { type: 'object', properties: { repo: { type: 'string' }, prefix: { type: 'string' }, dryRun: { type: 'boolean' } } } },
  { name: 'playpub_rpa', description: 'Preenche as declarações só-console (Conteúdo da app + Definições da loja) e envia pra revisão, via navegador logado (Playwright). Fases: declarations|store|submit|all.', inputSchema: { type: 'object', properties: { app: { type: 'string' }, all: { type: 'boolean' }, phase: { type: 'string' }, userDataDir: { type: 'string' }, headless: { type: 'boolean' }, dryRun: { type: 'boolean' }, config: { type: 'string' } } } },
];

async function run(name: string, args: Record<string, any>): Promise<Result | Result[]> {
  switch (name) {
    case 'playpub_doctor': {
      const out: Result[] = [checkPrereqs()];
      try {
        const { config } = loadConfig(process.cwd(), args.config);
        out.push(inspect(config));
      } catch (e) {
        out.push({ ok: false, command: 'config', error: (e as Error).message });
      }
      return out;
    }
    case 'playpub_init':
      return init(process.cwd(), { force: args.force });
    case 'playpub_publish': {
      const { config, path } = loadConfig(process.cwd(), args.config);
      const apps = selectApps(config, path, { app: args.app, all: args.all });
      const out: Result[] = [];
      for (const app of apps) {
        if (args.track) app.track = args.track;
        if (args.status) app.status = args.status;
        out.push(await publishApp(app, config.serviceAccountKey));
      }
      return out;
    }
    case 'playpub_links': {
      const { config, path } = loadConfig(process.cwd(), args.config);
      return selectApps(config, path, { app: args.app, all: args.all }).map(appLinks);
    }
    case 'playpub_setup_sa':
      return setupServiceAccount({ githubRepo: args.repo, projectPrefix: args.prefix, dryRun: args.dryRun });
    case 'playpub_rpa': {
      const { config, path } = loadConfig(process.cwd(), args.config);
      const { runRpa } = await import('./rpa/index.js');
      const apps = selectApps(config, path, { app: args.app, all: args.all });
      const out: Result[] = [];
      for (const app of apps) {
        out.push(
          await runRpa({
            developerId: config.developerId ?? '',
            app,
            phase: args.phase,
            userDataDir: args.userDataDir,
            headless: args.headless,
            dryRun: args.dryRun,
          }),
        );
      }
      return out;
    }
    default:
      return { ok: false, command: name, error: `tool desconhecida: ${name}` };
  }
}

export async function startMcp(): Promise<void> {
  const server = new Server({ name: 'playpub', version: '0.1.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      const result = await run(req.params.name, (req.params.arguments ?? {}) as Record<string, any>);
      const arr = Array.isArray(result) ? result : [result];
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: !arr.every((r) => r.ok),
      };
    } catch (e) {
      return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: (e as Error).message }) }], isError: true };
    }
  });

  await server.connect(new StdioServerTransport());
}
