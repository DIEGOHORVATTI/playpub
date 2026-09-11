#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig, selectApps } from './core/config.js';
import { checkPrereqs } from './core/prereqs.js';
import { publishApp, appLinks, inspect } from './core/play.js';
import { setupServiceAccount } from './core/setupSa.js';
import { init } from './core/init.js';
import type { Result } from './core/types.js';

const program = new Command();

program
  .name('playpub')
  .description('CLI pra publicar apps Android na Google Play (monorepo-friendly, usável por IA via MCP).')
  .version('0.1.0')
  .option('--json', 'saída JSON (pra automação / IA)', false)
  .option('-c, --config <path>', 'caminho da config');

/** Imprime um Result e define o exit code. */
function emit(r: Result | Result[]): never {
  const json = program.opts().json as boolean;
  const arr = Array.isArray(r) ? r : [r];
  const ok = arr.every((x) => x.ok);
  if (json) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  } else {
    for (const x of arr) {
      console.log(`${x.ok ? '✓' : '✗'} ${x.command}`);
      if (x.data) console.log('  ' + JSON.stringify(x.data));
      if (x.error) console.error('  erro: ' + x.error);
      for (const s of x.manualSteps ?? []) console.log('  manual: ' + s);
      for (const f of x.followups ?? []) console.log(`  ↳ browser-MCP [${f.step}]: ${f.hint}\n      ${f.url}`);
    }
  }
  process.exit(ok ? 0 : 1);
}

const cfgPath = () => program.opts().config as string | undefined;

program
  .command('init')
  .description('cria um playpub.config.json (detecta monorepo Expo em apps/*)')
  .option('-f, --force', 'sobrescreve se já existir')
  .action((o) => emit(init(process.cwd(), { force: o.force })));

program
  .command('doctor')
  .description('checa as CLIs obrigatórias (gcloud, gh, node…) e a config')
  .action(() => {
    const results: Result[] = [checkPrereqs()];
    try {
      const { config } = loadConfig(process.cwd(), cfgPath());
      results.push(inspect(config));
    } catch (e) {
      results.push({ ok: false, command: 'config', error: (e as Error).message });
    }
    emit(results);
  });

program
  .command('publish')
  .description('sobe o AAB + ficha da loja pra faixa (API). Camada 1.')
  .option('-a, --app <name>', 'app do monorepo')
  .option('--all', 'todos os apps')
  .option('-t, --track <track>', 'internal|alpha|beta|production')
  .option('-s, --status <status>', 'draft|completed|inProgress|halted')
  .action(async (o) => {
    try {
      const { config, path } = loadConfig(process.cwd(), cfgPath());
      const apps = selectApps(config, path, { app: o.app, all: o.all });
      const out: Result[] = [];
      for (const app of apps) {
        if (o.track) app.track = o.track;
        if (o.status) app.status = o.status;
        out.push(await publishApp(app, config.serviceAccountKey));
      }
      emit(out);
    } catch (e) {
      emit({ ok: false, command: 'publish', error: (e as Error).message });
    }
  });

program
  .command('links')
  .description('imprime os links de opt-in (teste) e de loja')
  .option('-a, --app <name>')
  .option('--all')
  .action((o) => {
    try {
      const { config, path } = loadConfig(process.cwd(), cfgPath());
      emit(selectApps(config, path, { app: o.app, all: o.all }).map(appLinks));
    } catch (e) {
      emit({ ok: false, command: 'links', error: (e as Error).message });
    }
  });

program
  .command('setup:sa')
  .description('cria projeto GCP + service account + chave e grava secret no GitHub (camada 3)')
  .option('--repo <owner/repo>', 'repo pra gravar o secret')
  .option('--prefix <prefix>', 'prefixo do projeto GCP', 'playpub')
  .option('--dry-run', 'só mostra os comandos')
  .action((o) => emit(setupServiceAccount({ githubRepo: o.repo, projectPrefix: o.prefix, dryRun: o.dryRun })));

program
  .command('rpa')
  .description('preenche as declarações só-console via navegador logado (camada 2, Playwright)')
  .option('-a, --app <name>', 'app do monorepo')
  .option('--all', 'todos os apps')
  .option('-p, --phase <phase>', 'declarations|store|submit|all', 'all')
  .option('--user-data-dir <dir>', 'dir persistente do Chrome (mantém o login)')
  .option('--headless', 'roda sem janela (só depois de logar 1x com janela)')
  .option('--dry-run', 'navega e valida, mas NÃO clica em Guardar/Enviar')
  .action(async (o) => {
    try {
      const { config, path } = loadConfig(process.cwd(), cfgPath());
      const { runRpa } = await import('./rpa/index.js');
      const apps = selectApps(config, path, { app: o.app, all: o.all });
      const out: Result[] = [];
      for (const app of apps) {
        out.push(
          await runRpa({
            developerId: config.developerId ?? '',
            app,
            phase: o.phase,
            userDataDir: o.userDataDir,
            headless: o.headless,
            dryRun: o.dryRun,
          }),
        );
      }
      emit(out);
    } catch (e) {
      emit({ ok: false, command: 'rpa', error: (e as Error).message });
    }
  });

program
  .command('mcp')
  .description('sobe um servidor MCP (stdio) expondo os comandos como tools pra IA')
  .action(async () => {
    await (await import('./mcp.js')).startMcp();
  });

program.parseAsync();
