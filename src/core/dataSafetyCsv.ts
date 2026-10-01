/**
 * Segurança de dados via CSV — o caminho estável. O wizard da Console ignora
 * cliques sintéticos em vários pontos; o "Exportar para CSV" / "Importar CSV"
 * da própria página não. Fluxo:
 *
 *   1. Console → Conteúdo da app → Segurança de dados → Exportar (CSV vazio,
 *      ~780 linhas, uma por resposta possível).
 *   2. `playpub datasafety --app x --template export.csv --out preenchido.csv`
 *   3. Console → Importar CSV → Guardar.
 *
 * As colunas são: Question ID, Response ID, Response value, Answer requirement,
 * Human-friendly question label. Casamos os rótulos da config (ex.: "Nome",
 * "Funcionalidade da app") pelo sufixo do rótulo humano, então o CSV precisa ser
 * exportado no MESMO idioma dos rótulos da config.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { ResolvedApp, Result, RpaConfig } from './types.js';

type DataSafety = NonNullable<RpaConfig['dataSafety']>;
type Row = string[];

const USAGE = 'PSL_DATA_USAGE_RESPONSES';

export function parseCsv(text: string): Row[] {
  const rows: Row[] = [];
  let row: Row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function toCsv(rows: Row[]): string {
  const cell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

const lastSegment = (label: string) => label.slice(label.lastIndexOf('/') + 1).trim();

/**
 * Preenche a coluna "Response value" do CSV exportado a partir de `dataSafety`.
 * Linhas de tipos não declarados ficam vazias (a Console as ignora); escolhas
 * de tipos declarados viram true/false explícitos.
 */
export function fillDataSafetyCsv(template: string, ds: DataSafety): { csv: string; missing: string[] } {
  const rows = parseCsv(template);
  const [header, ...body] = rows;

  const typeIdByLabel = new Map<string, string>();
  for (const [q, r, , , label] of body) {
    if (q.startsWith('PSL_DATA_TYPES_') && r) typeIdByLabel.set(lastSegment(label), r);
  }

  const declared = new Map<string, DataSafety['types'][number]>();
  const missing: string[] = [];
  for (const t of ds.types) {
    const id = typeIdByLabel.get(t.label);
    if (id) declared.set(id, t);
    else missing.push(t.label);
  }

  const accountMethods = new Set(ds.accountCreation ?? ['Nome de utilizador e palavra-passe']);
  const bool = (b: boolean) => String(b);

  for (const row of body) {
    const [q, r, , , label] = row;
    const answer = (): string | undefined => {
      switch (q) {
        case 'PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA': return bool(declared.size > 0);
        case 'PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT': return bool(ds.encryptedInTransit ?? true);
        case 'PSL_SUPPORTED_ACCOUNT_CREATION_METHODS': return bool(accountMethods.has(lastSegment(label)));
        case 'PSL_ACCOUNT_DELETION_URL':
        case 'PSL_DATA_DELETION_URL': return ds.deletionUrl;
        case 'PSL_SUPPORT_DATA_DELETION_BY_USER':
          return ds.deletionUrl ? bool(r === 'DATA_DELETION_YES') : undefined;
      }
      if (q.startsWith('PSL_DATA_TYPES_')) return bool(declared.has(r));
      if (!q.startsWith(`${USAGE}:`)) return undefined;

      const [, typeId, question] = q.split(':');
      const t = declared.get(typeId);
      if (!t) return undefined;
      const shared = t.shared ?? false;
      const collected = t.collected ?? true;
      switch (question) {
        case 'PSL_DATA_USAGE_COLLECTION_AND_SHARING':
          return bool(r === 'PSL_DATA_USAGE_ONLY_COLLECTED' ? collected : shared);
        case 'PSL_DATA_USAGE_EPHEMERAL': return bool(t.ephemeral ?? false);
        case 'DATA_USAGE_USER_CONTROL':
          return bool((r === 'PSL_DATA_USAGE_USER_CONTROL_REQUIRED') === (t.required ?? true));
        case 'DATA_USAGE_COLLECTION_PURPOSE': return bool(collected && t.purposes.includes(lastSegment(label)));
        case 'DATA_USAGE_SHARING_PURPOSE': return bool(shared && t.purposes.includes(lastSegment(label)));
      }
      return undefined;
    };
    const value = answer();
    if (value !== undefined) row[2] = value;
  }

  return { csv: toCsv([header, ...body]), missing };
}

/** `playpub datasafety`: lê o CSV exportado da Console e grava o preenchido. */
export function writeDataSafetyCsv(app: ResolvedApp, template: string, out: string): Result {
  const cmd = `datasafety:${app.name}`;
  const ds = app.rpa?.dataSafety;
  if (!ds) return { ok: false, command: cmd, error: `App "${app.name}": faltou rpa.dataSafety na config.` };
  if (!existsSync(template)) return { ok: false, command: cmd, error: `CSV exportado não encontrado: ${template}` };

  const { csv, missing } = fillDataSafetyCsv(readFileSync(template, 'utf8'), ds);
  if (missing.length) {
    return {
      ok: false,
      command: cmd,
      error: `Tipos sem correspondência no CSV (o rótulo precisa ser idêntico ao da Console, no mesmo idioma): ${missing.join(', ')}`,
    };
  }
  writeFileSync(out, csv);
  return {
    ok: true,
    command: cmd,
    data: { out, types: ds.types.map((t) => t.label) },
    manualSteps: [`Console → Conteúdo da app → Segurança de dados → Importar CSV → ${out} → Guardar.`],
  };
}
