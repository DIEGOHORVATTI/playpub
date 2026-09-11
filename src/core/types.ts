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

/** Um tipo de dado da declaração de Segurança de dados (camada RPA). */
export interface DataSafetyType {
  /** Rótulo visível no Console. Ex.: "Nome", "Endereço de email", "Fotos". */
  label: string;
  /** Coletado? Default true. */
  collected?: boolean;
  /** Partilhado com terceiros? Default false. */
  shared?: boolean;
  /** Processado de forma efémera? Default false. */
  ephemeral?: boolean;
  /** Obrigatório? Default true (senão "os utilizadores podem escolher"). */
  required?: boolean;
  /** Finalidades. Ex.: ["Funcionalidade da app", "Gestão da conta"]. */
  purposes: string[];
}

/** Respostas das declarações "só-console" (camada 2, dirigidas por RPA). */
export interface RpaConfig {
  /** ID numérico do app na Play Console (aparece na URL). Obrigatório pro RPA. */
  consoleAppId: string;
  privacyPolicyUrl?: string;
  accountDeletionUrl?: string;
  /** App contém anúncios? Default false. */
  hasAds?: boolean;
  /** Usa ID de publicidade (AD_ID)? Default false. */
  usesAdvertisingId?: boolean;
  /** É app governamental? Default false. */
  isGovernmentApp?: boolean;
  /** Funcionalidades financeiras — 'none' marca "nenhuma". */
  financialFeatures?: 'none';
  /** Funcionalidades de saúde — 'none' marca "nenhuma". */
  healthFeatures?: 'none';
  /** App exige login pra ver conteúdo? (Detalhes de início de sessão) */
  restricted?: boolean;
  /** Conta de teste pro revisor (quando restricted). */
  testCredentials?: { name?: string; email: string; password: string; instructionsEn: string };
  /** Faixas etárias-alvo. Ex.: ["18+"]. */
  targetAges?: Array<'5-' | '6-8' | '9-12' | '13-15' | '16-17' | '18+'>;
  /** Categoria da loja. Ex.: "Entretenimento". */
  category?: string;
  /** Classificação de conteúdo (IARC). */
  iarc?: {
    /** Email de contato do questionário IARC. */
    email: string;
    /** Rótulo da categoria da app no IARC. Ex.: "Todos os outros tipos de apps". */
    category: string;
    /** App tem compras digitais/in-app? (recarga = true) */
    inAppPurchases?: boolean;
    /** Por default TODAS as perguntas de conteúdo = "Não". Aqui, regex de
     *  perguntas (pelo texto) que devem ser respondidas "Sim". */
    yes?: string[];
  };
  /** Declaração de Segurança de dados. */
  dataSafety?: {
    /** Criptografado em trânsito? Default true. */
    encryptedInTransit?: boolean;
    /** Métodos de criação de conta. Ex.: ["Nome de utilizador e palavra-passe"]. */
    accountCreation?: string[];
    /** URL de eliminação de conta (validada, precisa responder 200). */
    deletionUrl?: string;
    /** Tipos de dados coletados/partilhados. */
    types: DataSafetyType[];
  };
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
  /** Respostas das declarações só-console (usadas por `playpub rpa`). */
  rpa?: RpaConfig;
}

export interface Config {
  /**
   * Chave da service account: caminho de arquivo JSON OU nome de variável de
   * ambiente que contém o JSON. Default: env "PLAY_SERVICE_ACCOUNT_JSON".
   */
  serviceAccountKey?: string;
  /** ID numérico do programador/conta na Play Console (URL). Necessário pro RPA. */
  developerId?: string;
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

/**
 * Passo que o RPA determinístico NÃO conseguiu fechar sozinho — descrito de
 * forma que um agente de **browser MCP** (ex.: claude-in-chrome) execute:
 * abre `url`, segue `hint`, usando `values`. É a ponte "CLI → IA no navegador".
 */
export interface RpaFollowup {
  /** Nome do passo. Ex.: "classificação-iarc". */
  step: string;
  /** Deep-link pra abrir no navegador logado. */
  url: string;
  /** Instrução clara do que fazer na página. */
  hint: string;
  /** Dados a preencher (email, categoria, respostas…). */
  values?: Record<string, unknown>;
}

/** Resultado padrão de toda operação — serializável pra JSON/MCP. */
export interface Result<T = unknown> {
  ok: boolean;
  command: string;
  data?: T;
  error?: string;
  /** Passos manuais/RPA que o core NÃO consegue automatizar via API. */
  manualSteps?: string[];
  /** Passos pra um agente de browser MCP terminar (fallback do RPA). */
  followups?: RpaFollowup[];
}
