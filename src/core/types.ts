/** Tipos compartilhados entre a CLI, o servidor MCP e o core. */

export type Track = 'internal' | 'alpha' | 'beta' | 'production';
export type ReleaseStatus = 'draft' | 'completed' | 'inProgress' | 'halted';

export interface ListingConfig {
  title?: string;
  shortDescription?: string;
  fullDescription?: string;
  /** Caminho para PNG/JPG 512x512. */
  icon?: string;
  /** Caminho para PNG/JPG 1024x500. */
  featureGraphic?: string;
  /** 2 a 8 imagens (16:9 ou 9:16). */
  phoneScreenshots?: string[];
}

export interface AppConfig {
  /** Ex.: "com.unitv.recargafacil". */
  packageName: string;
  /** Opcional: lê packageName/version de um app.json do Expo. */
  expoAppJson?: string;
  /** Caminho do .aab assinado a enviar. */
  aab?: string;
  track?: Track;
  status?: ReleaseStatus;
  /** Nome do lançamento (opcional). Default: versionCode do bundle. */
  releaseName?: string;
  /** Ficha da loja por idioma. Ex.: { "pt-BR": { ... } }. */
  listing?: Record<string, ListingConfig>;
  testers?: { countries?: string[]; emails?: string[] };
  contact?: { email?: string; website?: string; phone?: string };
}

export interface Config {
  /**
   * Chave da service account: caminho de arquivo JSON OU nome de variável de
   * ambiente que contém o JSON. Default: env "PLAY_SERVICE_ACCOUNT_JSON".
   */
  serviceAccountKey?: string;
  /** Valores default herdados por todos os apps. */
  defaults?: Partial<AppConfig>;
  /** Mapa de apps (monorepo). A chave é o nome usado em --app. */
  apps: Record<string, AppConfig>;
}

/** App já resolvido (defaults + expoAppJson aplicados). */
export interface ResolvedApp extends AppConfig {
  name: string;
  packageName: string;
}

/** Resultado padrão de toda operação — serializável pra JSON/MCP. */
export interface Result<T = unknown> {
  ok: boolean;
  command: string;
  data?: T;
  error?: string;
  /** Passos manuais/RPA que o core NÃO consegue automatizar via API. */
  manualSteps?: string[];
}
