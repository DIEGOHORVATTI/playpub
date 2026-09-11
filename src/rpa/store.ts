/**
 * RPA das "Definições da loja" (categoria + contato) e do envio pra revisão —
 * partes só-console, sem API. Espelha o fluxo validado à mão.
 *
 * GOTCHA (crítico): os inputs desta página são Angular. Setar `.value` por JS
 * NÃO atualiza o form-model → Guardar não persiste. Usar `.fill()` (eventos
 * reais) resolve. E há vários "Guardar": clicar o do rodapé do diálogo.
 */
import { Driver, clickSave, consoleUrl, fillText } from './driver.js';
import type { RpaConfig } from '../core/types.js';

/** Define a categoria da loja (ex.: "Entretenimento"). */
export async function setCategory(d: Driver, dev: string, app: string, category: string): Promise<void> {
  await d.page.goto(consoleUrl(dev, app, 'store-settings'), { waitUntil: 'networkidle' });
  // "Editar" da seção "Categoria de apps" (a 1ª da página)
  await d.page.getByRole('button', { name: /^Editar$/ }).first().click();
  await d.page.waitForTimeout(800);
  // abre o combobox "Categoria" e escolhe a opção
  const combo = d.page.getByRole('combobox').filter({ hasText: /Não selecionado|Categoria|Entretenimento/ }).last();
  await combo.click();
  await d.page.waitForTimeout(500);
  await d.page.getByRole('option', { name: new RegExp('^\\s*' + escapeRe(category) + '\\s*$') }).click();
  await d.page.waitForTimeout(400);
  await clickSave(d);
}

/** Define os detalhes de contato (email obrigatório, website/telefone opcionais). */
export async function setContact(
  d: Driver,
  dev: string,
  app: string,
  contact: { email: string; website?: string; phone?: string },
): Promise<void> {
  await d.page.goto(consoleUrl(dev, app, 'store-settings'), { waitUntil: 'networkidle' });
  // "Editar" da seção "Detalhes de contacto" (a 2ª)
  await d.page.getByRole('button', { name: /^Editar$/ }).nth(1).click();
  await d.page.waitForTimeout(800);
  const inputs = d.page.locator('input[type="text"], input[type="email"], input[type="url"], input:not([type])');
  await fillText(inputs.nth(0), contact.email); // email
  if (contact.phone) await fillText(inputs.nth(1), contact.phone);
  if (contact.website) await fillText(inputs.nth(2), contact.website);
  await clickSave(d);
}

/**
 * Envia todas as alterações pendentes pra revisão da Google (Vista geral da
 * publicação → "Enviar N alterações para revisão" → confirmar).
 * Retorna quantas alterações foram enviadas (0 se não havia botão).
 */
export async function submitForReview(d: Driver, dev: string, app: string): Promise<number> {
  await d.page.goto(consoleUrl(dev, app, 'publishing'), { waitUntil: 'networkidle' });
  const btn = d.page.getByRole('button', { name: /Enviar \d+ alterações para revisão/ }).first();
  if (!(await btn.count())) return 0;
  const label = (await btn.textContent()) ?? '';
  const n = Number(label.match(/Enviar (\d+)/)?.[1] ?? 0);
  if (d.opts.dryRun) return n;
  await btn.click();
  await d.page.waitForTimeout(1500);
  // diálogo de confirmação
  await d.page.getByRole('button', { name: /Envie as alterações para verificação/ }).click();
  await d.page.waitForTimeout(3000);
  return n;
}

/** Aplica categoria + contato conforme a config de RPA. */
export async function fillStoreSettings(d: Driver, dev: string, rpa: RpaConfig, contact?: { email?: string; website?: string; phone?: string }): Promise<string[]> {
  const app = rpa.consoleAppId;
  const done: string[] = [];
  if (rpa.category) {
    await setCategory(d, dev, app, rpa.category);
    done.push('categoria');
  }
  if (contact?.email) {
    await setContact(d, dev, app, { email: contact.email, website: contact.website, phone: contact.phone });
    done.push('contato');
  }
  return done;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
