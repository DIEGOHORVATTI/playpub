/**
 * Helpers de RPA (Playwright) pro Play Console — destilados de rodar os fluxos
 * na mão em 2 apps. Encapsulam os "gotchas" que quebram automação ingênua:
 *
 *  - Form Angular do Console: setar `.value` por JS NÃO atualiza o form-model
 *    (Guardar continua desativado / salva vazio). Use `.fill()` do Playwright,
 *    que dispara eventos reais de teclado — aí o Angular registra.
 *  - Existem VÁRIOS botões "Guardar" na página (rodapé da página + rodapé do
 *    diálogo). `clickSave` clica o ÚLTIMO habilitado (o do diálogo), não o 1º.
 *  - Seções de "Tipos de dados"/"Utilização" vêm COLAPSADAS ("Mostrar"); as
 *    linhas só existem no DOM depois de expandir. Sempre `expandSections` antes.
 *  - Radios/checkbox respondem a `.check()`/`.click()` normalmente.
 *  - O tamanho da janela oscila; prefira seletores por papel/texto a coordenada.
 */
import type { Browser, BrowserContext, Page, Locator } from 'playwright';

export interface RpaOptions {
  /** Diretório persistente do Chrome pra reaproveitar o login no Console. */
  userDataDir: string;
  headless?: boolean;
  /** Se true, navega e valida mas NÃO clica em Guardar/Enviar. */
  dryRun?: boolean;
  /** ms de espera após cada Guardar (o save é assíncrono). Default 4000. */
  saveWaitMs?: number;
}

export interface Driver {
  page: Page;
  ctx: BrowserContext;
  close(): Promise<void>;
  opts: RpaOptions;
}

const BASE = 'https://play.google.com/console/u/0/developers';

export const consoleUrl = (dev: string, app: string, suffix: string) =>
  `${BASE}/${dev}/app/${app}/${suffix}`;

export async function launch(opts: RpaOptions): Promise<Driver> {
  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Instale o pacote opcional "playwright" pra usar o RPA: npm i -D playwright');
  }
  const ctx = await chromium.launchPersistentContext(opts.userDataDir, {
    headless: opts.headless ?? false,
    viewport: { width: 1500, height: 900 },
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  return {
    page,
    ctx,
    opts: { saveWaitMs: 4000, ...opts },
    close: () => ctx.close(),
  };
}

/** Marca um radio pelo texto do seu label (checa se já não está marcado). */
export async function pickRadio(page: Page, label: RegExp): Promise<void> {
  await page.getByRole('radio', { name: label }).first().check();
}

/** Marca um checkbox pelo texto do label. */
export async function checkBox(page: Page, label: RegExp): Promise<void> {
  const cb = page.getByRole('checkbox', { name: label }).first();
  if (!(await cb.isChecked().catch(() => false))) await cb.check();
}

/**
 * Radio que vem DEPOIS de um texto de pergunta (quando há vários "Sim/Não" na
 * página e o papel/label sozinho é ambíguo). Ex.: encriptação em trânsito.
 */
export async function pickRadioAfter(page: Page, question: RegExp, option: RegExp): Promise<void> {
  const q = page.getByText(question).first();
  // radios que seguem a pergunta no DOM
  const radio = q.locator('xpath=following::*[@role="radio"]').filter({ hasText: option }).first();
  await radio.check();
}

/** Preenche texto de forma que o Angular registre (fill = eventos reais) + blur. */
export async function fillText(loc: Locator, value: string): Promise<void> {
  await loc.click();
  await loc.fill(value);
  await loc.blur().catch(() => {});
}

/**
 * Clica o "Guardar" correto: o ÚLTIMO habilitado (rodapé do diálogo), não o
 * botão de página. No dryRun, não clica.
 */
export async function clickSave(d: Driver, name: RegExp = /^(Guardar|Salvar|Save)$/): Promise<void> {
  if (d.opts.dryRun) return;
  const btns = d.page.getByRole('button', { name });
  const n = await btns.count();
  for (let i = n - 1; i >= 0; i--) {
    const b = btns.nth(i);
    if (await b.isEnabled().catch(() => false)) {
      await b.click();
      await d.page.waitForTimeout(d.opts.saveWaitMs ?? 4000);
      return;
    }
  }
  throw new Error(`Nenhum botão "${name}" habilitado pra clicar.`);
}

/** Clica um botão por nome (dialog "Adicionar", "Seguinte", etc.). */
export async function clickButton(d: Driver, name: RegExp): Promise<void> {
  if (d.opts.dryRun) return;
  await d.page.getByRole('button', { name }).filter({ hasNot: d.page.locator('[disabled]') }).last().click();
  await d.page.waitForTimeout(600);
}

/** Expande todas as seções colapsadas ("Mostrar") pra materializar as linhas. */
export async function expandSections(page: Page): Promise<number> {
  const toggles = page.getByRole('button', { name: /^Mostrar$/ });
  const n = await toggles.count();
  for (let i = 0; i < n; i++) {
    await toggles.nth(0).click().catch(() => {});
    await page.waitForTimeout(150);
  }
  return n;
}

/** Vai pra visão geral do "Conteúdo da app". */
export async function gotoContentOverview(d: Driver, dev: string, app: string): Promise<void> {
  await d.page.goto(consoleUrl(dev, app, 'app-content/overview'), { waitUntil: 'networkidle' });
}

/**
 * Na visão geral, abre a declaração cujo título casa `heading` clicando o
 * "Iniciar declaração" que a segue. Retorna false se já não está pendente.
 */
export async function openDeclaration(d: Driver, heading: RegExp): Promise<boolean> {
  const h = d.page.getByText(heading).first();
  if (!(await h.count())) return false;
  const btn = h.locator('xpath=following::button[normalize-space()="Iniciar declaração"]').first();
  if (!(await btn.count())) return false;
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await d.page.waitForLoadState('networkidle').catch(() => {});
  return true;
}

/** Conta quantas declarações ainda "Requerem atenção" (0 = tudo feito). */
export async function pendingCount(d: Driver, dev: string, app: string): Promise<number> {
  await gotoContentOverview(d, dev, app);
  const tab = await d.page.getByText(/Requerem atenção(\s*\((\d+)\))?/).first().textContent();
  const m = tab?.match(/\((\d+)\)/);
  return m ? Number(m[1]) : 0;
}
