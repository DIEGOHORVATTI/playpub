/**
 * Orquestrador da camada RPA: liga o navegador logado e roda as fases só-console
 * (declarações + definições da loja + envio pra revisão) pra 1 app, devolvendo
 * um Result serializável (igual às outras camadas do playpub).
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ResolvedApp, Result } from '../core/types.js';
import { launch, type RpaOptions } from './driver.js';
import { fillDeclarations } from './declarations.js';
import { fillStoreSettings, submitForReview } from './store.js';

export type RpaPhase = 'declarations' | 'store' | 'submit' | 'all';

export interface RunRpaInput {
  developerId: string;
  app: ResolvedApp;
  phase?: RpaPhase;
  /** Diretório persistente do Chrome (login). Default: ~/tmp/playpub-chrome. */
  userDataDir?: string;
  headless?: boolean;
  dryRun?: boolean;
}

export async function runRpa(input: RunRpaInput): Promise<Result> {
  const { app } = input;
  const command = `rpa:${input.phase ?? 'all'} ${app.name}`;
  const rpa = app.rpa;
  if (!rpa) {
    return { ok: false, command, error: `app "${app.name}" não tem bloco "rpa" na config.` };
  }
  if (!rpa.consoleAppId) {
    return { ok: false, command, error: `app "${app.name}": faltou rpa.consoleAppId (ID numérico do Console).` };
  }
  if (!input.developerId) {
    return { ok: false, command, error: 'faltou developerId na config (ID numérico da conta na Console).' };
  }

  const opts: RpaOptions = {
    userDataDir: input.userDataDir ?? join(tmpdir(), 'playpub-chrome'),
    headless: input.headless,
    dryRun: input.dryRun,
  };

  const phase = input.phase ?? 'all';
  const data: Record<string, unknown> = { dryRun: !!input.dryRun };
  const manualSteps: string[] = [];
  const d = await launch(opts);
  try {
    if (phase === 'declarations' || phase === 'all') {
      const r = await fillDeclarations(d, input.developerId, rpa);
      data.declarations = r;
      for (const s of r.skipped) manualSteps.push(`declaração pendente: ${s}`);
      if (r.pendingAfter > 0) manualSteps.push(`ainda ${r.pendingAfter} declaração(ões) requerem atenção.`);
    }
    if (phase === 'store' || phase === 'all') {
      data.store = await fillStoreSettings(d, input.developerId, rpa, app.contact);
    }
    if (phase === 'submit' || phase === 'all') {
      const n = await submitForReview(d, input.developerId, rpa.consoleAppId);
      data.submitted = n;
      if (n === 0) manualSteps.push('nada pendente pra enviar (ou botão não encontrado) — confira a Vista geral da publicação.');
    }
    return { ok: true, command, data, manualSteps: manualSteps.length ? manualSteps : undefined };
  } catch (e) {
    return { ok: false, command, error: (e as Error).message, data };
  } finally {
    await d.close();
  }
}
