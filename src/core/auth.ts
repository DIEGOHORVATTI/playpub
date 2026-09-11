import { existsSync, readFileSync } from 'node:fs';
import { google } from 'googleapis';

/**
 * Resolve a credencial da service account. `ref` pode ser:
 *  - caminho de um arquivo .json
 *  - nome de uma variável de ambiente que contém o JSON (ex.: em CI)
 *  - vazio → tenta env PLAY_SERVICE_ACCOUNT_JSON
 */
export function loadServiceAccount(ref?: string): Record<string, unknown> {
  const candidate = ref || 'PLAY_SERVICE_ACCOUNT_JSON';

  // 1) arquivo no disco
  if (existsSync(candidate)) {
    return JSON.parse(readFileSync(candidate, 'utf8'));
  }
  // 2) variável de ambiente com o JSON
  const fromEnv = process.env[candidate];
  if (fromEnv) {
    return JSON.parse(fromEnv);
  }
  throw new Error(
    `Service account não encontrada. Informe um arquivo .json ou defina a env ${candidate}. ` +
      `Rode "playpub setup:sa" pra criar uma.`,
  );
}

/** Cliente autenticado da Google Play Developer API (androidpublisher v3). */
export async function playClient(saRef?: string) {
  const credentials = loadServiceAccount(saRef);
  const auth = new google.auth.GoogleAuth({
    credentials: credentials as any,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const authClient = await auth.getClient();
  return google.androidpublisher({ version: 'v3', auth: authClient as any });
}
