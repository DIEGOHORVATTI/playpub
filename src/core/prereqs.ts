import { execFileSync } from 'node:child_process';
import type { Result } from './types.js';

export interface Tool {
  name: string;
  /** Comando pra checar a versão. */
  probe: [string, string[]];
  required: boolean;
  why: string;
  install: string;
}

/** CLIs que o playpub usa. gcloud/gh são obrigatórias pro setup completo. */
export const TOOLS: Tool[] = [
  {
    name: 'node',
    probe: ['node', ['--version']],
    required: true,
    why: 'Runtime do playpub.',
    install: 'https://nodejs.org',
  },
  {
    name: 'gcloud',
    probe: ['gcloud', ['--version']],
    required: true,
    why: 'Cria projeto GCP + service account + chave (setup:sa).',
    install: 'https://cloud.google.com/sdk/docs/install',
  },
  {
    name: 'gh',
    probe: ['gh', ['--version']],
    required: true,
    why: 'Grava a chave da SA como secret no GitHub e dispara os workflows.',
    install: 'https://cli.github.com',
  },
  {
    name: 'java',
    probe: ['java', ['-version']],
    required: false,
    why: 'Assinar o AAB localmente (jarsigner), se não assinar no CI.',
    install: 'https://adoptium.net',
  },
];

function has(tool: Tool): { present: boolean; version?: string } {
  try {
    const out = execFileSync(tool.probe[0], tool.probe[1], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim();
    return { present: true, version: out.split('\n')[0] };
  } catch {
    return { present: false };
  }
}

export function checkPrereqs(): Result {
  const results = TOOLS.map((t) => ({ ...t, ...has(t) }));
  const faltando = results.filter((r) => r.required && !r.present);
  return {
    ok: faltando.length === 0,
    command: 'prereqs',
    data: {
      tools: results.map((r) => ({
        name: r.name,
        present: r.present,
        version: r.version,
        required: r.required,
        why: r.why,
        install: r.install,
      })),
    },
    error: faltando.length ? `CLIs obrigatórias faltando: ${faltando.map((f) => f.name).join(', ')}` : undefined,
    manualSteps: faltando.map((f) => `Instale ${f.name}: ${f.install}`),
  };
}
