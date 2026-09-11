import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Config, ResolvedApp } from './types.js';

/** Caminhos default de config, na ordem de procura. */
const DEFAULT_FILES = [
  'playpub.config.json',
  'playpub.config.jsonc',
  '.playpub.json',
];

export function findConfigPath(cwd = process.cwd(), explicit?: string): string {
  if (explicit) {
    const p = resolve(cwd, explicit);
    if (!existsSync(p)) throw new Error(`Config não encontrada: ${p}`);
    return p;
  }
  for (const f of DEFAULT_FILES) {
    const p = resolve(cwd, f);
    if (existsSync(p)) return p;
  }
  throw new Error(
    `Nenhuma config encontrada (procurei ${DEFAULT_FILES.join(', ')}). Rode "playpub init".`,
  );
}

/** JSON com comentários simples (// e /* *\/) — pra ser amigável. */
function parseJsonc(text: string): unknown {
  const noComments = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return JSON.parse(noComments);
}

export function loadConfig(cwd = process.cwd(), explicit?: string): { config: Config; path: string } {
  const path = findConfigPath(cwd, explicit);
  const config = parseJsonc(readFileSync(path, 'utf8')) as Config;
  if (!config.apps || typeof config.apps !== 'object' || !Object.keys(config.apps).length) {
    throw new Error('Config inválida: "apps" precisa ter pelo menos 1 app.');
  }
  return { config, path };
}

/** Lê packageName/version de um app.json do Expo, se informado. */
function readExpo(appJsonPath: string): { packageName?: string; version?: string } {
  if (!existsSync(appJsonPath)) return {};
  const json = JSON.parse(readFileSync(appJsonPath, 'utf8'));
  const expo = json.expo ?? json;
  return {
    packageName: expo?.android?.package,
    version: expo?.version,
  };
}

/** Resolve UM app: aplica defaults + expoAppJson e vira caminhos absolutos. */
export function resolveApp(config: Config, name: string, configPath: string): ResolvedApp {
  const raw = config.apps[name];
  if (!raw) {
    const nomes = Object.keys(config.apps).join(', ');
    throw new Error(`App "${name}" não existe na config. Disponíveis: ${nomes}`);
  }
  const base = dirname(configPath);
  const merged = { ...config.defaults, ...raw };

  if (merged.expoAppJson) {
    const expo = readExpo(resolve(base, merged.expoAppJson));
    if (!merged.packageName && expo.packageName) merged.packageName = expo.packageName;
  }
  if (!merged.packageName) {
    throw new Error(`App "${name}": faltou "packageName" (ou um expoAppJson válido).`);
  }

  const abs = (p?: string) => (p ? resolve(base, p) : p);
  const listing = merged.listing
    ? Object.fromEntries(
        Object.entries(merged.listing).map(([lang, l]) => [
          lang,
          {
            ...l,
            icon: abs(l.icon),
            featureGraphic: abs(l.featureGraphic),
            phoneScreenshots: l.phoneScreenshots?.map((s) => abs(s)!),
          },
        ]),
      )
    : undefined;

  return {
    ...merged,
    name,
    packageName: merged.packageName,
    aab: abs(merged.aab),
    track: merged.track ?? 'internal',
    status: merged.status ?? 'draft',
    listing,
  };
}

/** Todos os apps (pra --all) ou os selecionados. */
export function selectApps(
  config: Config,
  configPath: string,
  opts: { app?: string; all?: boolean },
): ResolvedApp[] {
  if (opts.all) {
    return Object.keys(config.apps).map((n) => resolveApp(config, n, configPath));
  }
  if (opts.app) return [resolveApp(config, opts.app, configPath)];
  const nomes = Object.keys(config.apps);
  if (nomes.length === 1) return [resolveApp(config, nomes[0], configPath)];
  throw new Error(`Este repo tem ${nomes.length} apps (${nomes.join(', ')}). Use --app <nome> ou --all.`);
}
