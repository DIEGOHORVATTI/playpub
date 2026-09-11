import { existsSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Result } from './types.js';

/** Detecta apps de um monorepo Expo (apps/ * /app.json). */
function detectExpoApps(cwd: string): Record<string, { expoAppJson: string; packageName?: string }> {
  const out: Record<string, { expoAppJson: string; packageName?: string }> = {};
  const appsDir = resolve(cwd, 'apps');
  if (!existsSync(appsDir)) return out;
  for (const name of readdirSync(appsDir)) {
    const appJson = resolve(appsDir, name, 'app.json');
    if (existsSync(appJson)) out[name] = { expoAppJson: `apps/${name}/app.json` };
  }
  return out;
}

export function init(cwd = process.cwd(), opts: { force?: boolean } = {}): Result {
  const target = resolve(cwd, 'playpub.config.json');
  if (existsSync(target) && !opts.force) {
    return { ok: false, command: 'init', error: `Já existe ${target}. Use --force pra sobrescrever.` };
  }

  const detected = detectExpoApps(cwd);
  const apps = Object.keys(detected).length
    ? Object.fromEntries(
        Object.entries(detected).map(([name, d]) => [
          name,
          {
            expoAppJson: d.expoAppJson,
            aab: `apps/${name}/android/app/build/outputs/bundle/release/app-release.aab`,
            listing: {
              'pt-BR': {
                title: name,
                shortDescription: 'TODO: descrição curta (máx 80).',
                fullDescription: 'TODO: descrição completa.',
                icon: `apps/${name}/play/icon-512.png`,
                featureGraphic: `apps/${name}/play/feature-1024x500.png`,
                phoneScreenshots: [`apps/${name}/play/1.png`, `apps/${name}/play/2.png`],
              },
            },
            testers: { countries: ['BR'], emails: [] },
            contact: { email: '', website: '' },
          },
        ]),
      )
    : {
        meuapp: {
          packageName: 'com.exemplo.meuapp',
          aab: './app-release.aab',
          listing: { 'pt-BR': { title: 'Meu App', shortDescription: '...', fullDescription: '...' } },
        },
      };

  const config = {
    $schema: 'https://raw.githubusercontent.com/DIEGOHORVATTI/playpub/main/schema.json',
    serviceAccountKey: 'PLAY_SERVICE_ACCOUNT_JSON',
    defaults: { track: 'alpha', status: 'draft' },
    apps,
  };

  writeFileSync(target, JSON.stringify(config, null, 2) + '\n');
  return {
    ok: true,
    command: 'init',
    data: { path: target, apps: Object.keys(apps), detectedMonorepo: Object.keys(detected).length > 0 },
    manualSteps: ['Edite playpub.config.json (descrições, imagens, testadores).', 'Rode "playpub doctor" pra checar tudo.'],
  };
}
