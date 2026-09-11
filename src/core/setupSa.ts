import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Result } from './types.js';

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

export interface SetupSaOptions {
  /** Prefixo do projeto GCP. Default: "playpub". */
  projectPrefix?: string;
  /** Nome da service account. Default: "play-publisher". */
  saName?: string;
  /** Repo do GitHub (owner/repo) pra gravar o secret. Default: detecta pelo gh. */
  githubRepo?: string;
  /** Nome do secret. Default: PLAY_SERVICE_ACCOUNT_JSON. */
  secretName?: string;
  /** Só imprime os comandos, não executa. */
  dryRun?: boolean;
}

/**
 * CAMADA 3 (setup one-time): cria projeto GCP → ativa a API → cria service
 * account → gera a chave JSON → grava como secret no GitHub → apaga a chave local.
 *
 * O ÚNICO passo que sobra e NÃO tem API: convidar o e-mail da SA no
 * Play Console (Utilizadores e autorizações). Retornado em manualSteps.
 */
export function setupServiceAccount(opts: SetupSaOptions = {}): Result {
  const cmd = 'setup:sa';
  const prefix = opts.projectPrefix ?? 'playpub';
  const saName = opts.saName ?? 'play-publisher';
  const secretName = opts.secretName ?? 'PLAY_SERVICE_ACCOUNT_JSON';
  const projectId = `${prefix}-${Date.now().toString().slice(-6)}`;
  const saEmail = `${saName}@${projectId}.iam.gserviceaccount.com`;

  const steps: Array<[string, string[]]> = [
    ['gcloud', ['projects', 'create', projectId, '--name=Play Publisher (playpub)']],
    ['gcloud', ['config', 'set', 'project', projectId]],
    ['gcloud', ['services', 'enable', 'androidpublisher.googleapis.com', `--project=${projectId}`]],
    ['gcloud', ['iam', 'service-accounts', 'create', saName, '--display-name=Play Publisher (playpub)', `--project=${projectId}`]],
  ];

  if (opts.dryRun) {
    const preview = steps.map(([c, a]) => `${c} ${a.join(' ')}`);
    preview.push(`gcloud iam service-accounts keys create key.json --iam-account=${saEmail}`);
    preview.push(`gh secret set ${secretName} < key.json` + (opts.githubRepo ? ` --repo ${opts.githubRepo}` : ''));
    return {
      ok: true,
      command: cmd,
      data: { dryRun: true, projectId, saEmail, secretName, commands: preview },
      manualSteps: [`Convide ${saEmail} no Play Console → Utilizadores e autorizações (dê permissão de lançamentos).`],
    };
  }

  for (const [c, a] of steps) sh(c, a);

  const dir = mkdtempSync(join(tmpdir(), 'playpub-'));
  const keyPath = join(dir, 'key.json');
  try {
    sh('gcloud', ['iam', 'service-accounts', 'keys', 'create', keyPath, `--iam-account=${saEmail}`]);
    const args = ['secret', 'set', secretName];
    if (opts.githubRepo) args.push('--repo', opts.githubRepo);
    execFileSync('gh', args, { input: readFileSync(keyPath, 'utf8'), stdio: ['pipe', 'pipe', 'pipe'] });
  } finally {
    rmSync(dir, { recursive: true, force: true }); // NUNCA deixar a chave no disco
  }

  return {
    ok: true,
    command: cmd,
    data: { projectId, saEmail, secretName, secretSet: true },
    manualSteps: [
      `Convide o e-mail da service account no Play Console (Google não tem API pra isso):`,
      `  Play Console → Utilizadores e autorizações → Convidar novos utilizadores`,
      `  E-mail: ${saEmail}`,
      `  Autorizações: "Administrar lançamentos" (ou Admin) nos apps desejados → Enviar convite`,
    ],
  };
}
