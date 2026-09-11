/**
 * CAMADA 2 (RPA / só-console): as declarações de "Conteúdo da app" e a criação
 * do 1º app NÃO têm API. Aqui vai o mapa do fluxo (aprendido na mão) pra dirigir
 * via Playwright. É um SCAFFOLD: liga o navegador logado e navega os formulários.
 *
 * Requer o pacote opcional "playwright" e uma sessão logada no Play Console
 * (use um userDataDir persistente pra reaproveitar o login).
 *
 * Ordem real das declarações (mapeada):
 *   1. Política de privacidade      → URL do site
 *   2. Anúncios                     → contém anúncios? (sim/não)
 *   3. Detalhes de início de sessão → app restrito? credenciais de teste
 *   4. Classificação de conteúdo    → questionário IARC (categoria + perguntas)
 *   5. Público-alvo                 → faixas etárias (ex.: 18+)
 *   6. Segurança de dados           → tipos de dados + uso (form longo, 5 passos)
 *   7. ID de publicidade            → usa? (sim/não)
 *   8. Apps governamentais          → é? (sim/não)
 *   9. Funcionalidades financeiras  → nenhuma / quais
 *  10. Saúde                        → nenhuma / quais
 *
 * Dicas aprendidas (pro RPA ser estável):
 *  - Prefira clique por role/label (get_by_role) a coordenada — o zoom varia.
 *  - Os refs de checkbox mudam a cada re-render: clique 1, valide, repita.
 *  - Upload de imagem da Ficha usa UM input[type=file] compartilhado: o arquivo
 *    cai na BIBLIOTECA de recursos; depois selecione da biblioteca no slot.
 *  - A URL de exclusão de conta é validada (precisa responder 200).
 */

export interface DeclarationsInput {
  developerId: string; // ex.: 6359376848158940710
  appId: string; // ex.: 4974105515853971968
  privacyPolicyUrl: string;
  accountDeletionUrl: string;
  hasAds: boolean;
  usesAdvertisingId: boolean;
  restricted: boolean; // app exige login?
  testCredentials?: { email: string; password: string; instructionsEn: string };
  targetAges: Array<'5-' | '6-8' | '9-12' | '13-15' | '16-17' | '18+'>;
  contentRating: { email: string; category: 'game' | 'social' | 'other' };
  dataSafety?: unknown; // ver esquema no README; recomendável usar Import CSV do Play
}

export interface RpaOptions {
  /** Diretório persistente do Chrome pra manter o login. */
  userDataDir: string;
  headless?: boolean;
}

const CONTENT_URL = (dev: string, app: string, page: string) =>
  `https://play.google.com/console/u/0/developers/${dev}/app/${app}/app-content/${page}`;

/**
 * Preenche as declarações via navegador. IMPLEMENTAÇÃO PARCIAL (scaffold):
 * abre o navegador e navega. Complete cada passo conforme o mapa acima.
 */
export async function fillDeclarations(input: DeclarationsInput, opts: RpaOptions): Promise<void> {
  // import dinâmico: playwright é dependência opcional
  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Instale o pacote opcional "playwright" pra usar o módulo RPA: npm i -D playwright');
  }

  const ctx = await chromium.launchPersistentContext(opts.userDataDir, {
    headless: opts.headless ?? false,
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  const goto = (p: string) => page.goto(CONTENT_URL(input.developerId, input.appId, p));

  // 1) Política de privacidade
  await goto('privacy-policy');
  await page.getByRole('textbox').first().fill(input.privacyPolicyUrl);
  await page.getByRole('button', { name: /guardar|salvar|save/i }).click();

  // 2) Anúncios
  await goto('ads-declaration');
  await page
    .getByRole('radio', { name: input.hasAds ? /sim|contém anúncios/i : /não.*anúncios/i })
    .click();
  await page.getByRole('button', { name: /guardar|salvar|save/i }).click();

  // 3..10 — seguir o mapa acima (público-alvo depende do app access;
  //         segurança de dados é o form mais longo — considere "Import CSV").
  // TODO: completar. Deixado como scaffold intencional (ver README > RPA).

  await ctx.close();
}
