/**
 * CAMADA 2 (RPA / só-console): as declarações de "Conteúdo da app" não têm API.
 * Este módulo dirige o navegador logado (Playwright) e preenche as 10 declarações
 * espelhando EXATAMENTE o fluxo validado à mão em 2 apps (UniTV + Nexa).
 *
 * Estratégia robusta: em vez de adivinhar o slug de cada página, abrimos pela
 * VISÃO GERAL (`app-content/overview`) e clicamos o "Iniciar declaração" que
 * segue cada título — foi o que funcionou de forma estável. Slugs diretos
 * confirmados: ad-id-declaration, government-apps, testing-credentials,
 * target-audience-content, data-privacy-security.
 *
 * Ordem/dependências reais:
 *   - Público-alvo depende de "Detalhes de início de sessão" já concluído.
 *   - Segurança de dados é um wizard de 5 passos; o passo "Utilização" abre um
 *     DIÁLOGO por tipo de dado (recolhido → não-efémero → necessária → finalidades).
 */
import type { RpaConfig, RpaFollowup } from '../core/types.js';
import {
  Driver,
  clickButton,
  clickSave,
  checkBox,
  consoleUrl,
  expandSections,
  fillText,
  gotoContentOverview,
  openDeclaration,
  pickRadio,
  pickRadioAfter,
} from './driver.js';
import { fillIarc } from './iarc.js';

const SIM = /^\s*Sim/;
const NAO = /^\s*Não/;

export interface DeclarationsResult {
  done: string[];
  skipped: string[];
  /** Passos que o RPA não fechou — pra um agente de browser-MCP terminar. */
  followups: RpaFollowup[];
  pendingAfter: number;
}

/** Preenche todas as declarações do "Conteúdo da app". */
export async function fillDeclarations(
  d: Driver,
  dev: string,
  rpa: RpaConfig,
): Promise<DeclarationsResult> {
  const app = rpa.consoleAppId;
  const done: string[] = [];
  const skipped: string[] = [];
  const followups: RpaFollowup[] = [];
  const overview = consoleUrl(dev, app, 'app-content/overview');

  const step = async (label: string, hint: string, fn: () => Promise<boolean>) => {
    try {
      const ok = await fn();
      if (ok) done.push(label);
      else {
        skipped.push(`${label} (não pendente/pulado)`);
      }
    } catch (e) {
      skipped.push(`${label} (${(e as Error).message})`);
      followups.push({ step: label, url: overview, hint, values: { rpa } });
    }
  };

  // 1) Política de privacidade — URL
  if (rpa.privacyPolicyUrl) {
    await step('privacidade', 'Abra "Política de privacidade" e cole a URL da política em rpa.privacyPolicyUrl; Guardar.', async () => {
      await gotoContentOverview(d, dev, app);
      if (!(await openDeclaration(d, /Política de privacidade/))) return false;
      await fillText(d.page.getByRole('textbox').first(), rpa.privacyPolicyUrl!);
      await clickSave(d);
      return true;
    });
  }

  // 2) Anúncios — sim/não
  await step('anúncios', 'Abra "Anúncios" e responda se a app contém anúncios (rpa.hasAds); Guardar.', async () => {
    await gotoContentOverview(d, dev, app);
    if (!(await openDeclaration(d, /^Anúncios/))) return false;
    await pickRadio(d.page, rpa.hasAds ? SIM : NAO);
    await clickSave(d);
    return true;
  });

  // 3) Detalhes de início de sessão (app access)
  await step('app-access', 'Abra "Detalhes de início de sessão": app restrito → Sim, adicione as credenciais de teste (rpa.testCredentials), marque acesso total, Adicionar, Guardar.', async () => {
    await gotoContentOverview(d, dev, app);
    if (!(await openDeclaration(d, /Detalhes de início de sessão/))) return false;
    if (!rpa.restricted || !rpa.testCredentials) {
      await pickRadio(d.page, NAO); // app não restrito
      await clickSave(d);
      return true;
    }
    await pickRadio(d.page, SIM);
    await clickButton(d, /Adicione detalhes|Adicionar detalhes/);
    const c = rpa.testCredentials;
    // ordem dos campos: Nome | utilizador/email | palavra-passe | instruções
    const inputs = d.page.locator('input[type="text"], input:not([type]), input[type="email"]');
    await fillText(inputs.nth(0), c.name ?? 'Test account');
    await fillText(inputs.nth(1), c.email);
    await fillText(inputs.nth(2), c.password);
    await fillText(d.page.locator('textarea').first(), c.instructionsEn);
    // checkbox "acesso total a todas as funcionalidades"
    await d.page.locator('input[type="checkbox"]').last().check().catch(() => {});
    await clickButton(d, /^Adicionar$/);
    await clickSave(d);
    return true;
  });

  // 4) Classificação de conteúdo (IARC)
  if (rpa.iarc) {
    await step('classificação-iarc', 'Abra "Classificação de conteúdo" → Iniciar questionário: email (rpa.iarc.email), categoria (rpa.iarc.category), responda TUDO "Não" exceto compras digitais (rpa.iarc.inAppPurchases) e os overrides rpa.iarc.yes; salve o questionário.', async () => {
      await fillIarc(d, dev, rpa);
      return true;
    });
  }

  // 5) Público-alvo — faixas etárias (depende de app-access concluído)
  await step('público-alvo', 'Abra "Público-alvo e conteúdo" (exige app-access feito): marque as faixas rpa.targetAges (ex.: 18+), Seguinte, Guardar.', async () => {
    await gotoContentOverview(d, dev, app);
    if (!(await openDeclaration(d, /Público-alvo e conteúdo/))) return false;
    if (await d.page.getByText(/Preencha a secção Detalhes de início de sessão/).count()) {
      throw new Error('bloqueado: conclua "Detalhes de início de sessão" antes.');
    }
    const ages = rpa.targetAges ?? ['18+'];
    const map: Record<string, RegExp> = {
      '5-': /Até 5/, '6-8': /6-8/, '9-12': /9-12/, '13-15': /13-15/,
      '16-17': /16-17/, '18+': /18 anos e superior|18 anos e mais|18\+/,
    };
    for (const a of ages) await checkBox(d.page, map[a]);
    await clickButton(d, /^(Seguinte|Próximo|Continuar)$/);
    await clickSave(d); // no resumo
    return true;
  });

  // 6) Segurança de dados — wizard
  if (rpa.dataSafety) {
    await step('segurança-de-dados', 'Abra "Segurança de dados" (wizard 5 passos): recolhe=Sim, encriptado em trânsito, criação de conta, URL de exclusão; marque os tipos rpa.dataSafety.types; em Utilização, 1 diálogo por tipo (recolhido, não-efémero, obrigatório/opcional, finalidades); pré-visualize e Guardar.', async () => {
      await fillDataSafety(d, dev, app, rpa);
      return true;
    });
  }

  // 7) ID de publicidade
  await step('id-publicidade', 'Abra "ID de publicidade": usa AD_ID? (rpa.usesAdvertisingId, geralmente Não); Guardar.', async () => {
    await gotoContentOverview(d, dev, app);
    if (!(await openDeclaration(d, /ID de publicidade/))) return false;
    await pickRadio(d.page, rpa.usesAdvertisingId ? SIM : NAO);
    await clickSave(d);
    return true;
  });

  // 8) Apps governamentais
  await step('governamentais', 'Abra "Apps governamentais": é governamental? (rpa.isGovernmentApp, geralmente Não); Guardar.', async () => {
    await gotoContentOverview(d, dev, app);
    if (!(await openDeclaration(d, /Apps governamentais/))) return false;
    await pickRadio(d.page, rpa.isGovernmentApp ? SIM : NAO);
    await clickSave(d);
    return true;
  });

  // 9) Funcionalidades financeiras — "nenhuma"
  await step('financeiras', 'Abra "Funcionalidades financeiras": marque "nenhuma" (rpa.financialFeatures="none"); Guardar.', async () => {
    await gotoContentOverview(d, dev, app);
    if (!(await openDeclaration(d, /Funcionalidades financeiras/))) return false;
    await pickRadio(d.page, NAO).catch(async () => {
      await checkBox(d.page, /Nenhuma destas|Nenhuma/);
    });
    await clickSave(d);
    return true;
  });

  // 10) Saúde — "nenhuma"
  await step('saúde', 'Abra "Saúde": marque "nenhuma" (rpa.healthFeatures="none"); Guardar.', async () => {
    await gotoContentOverview(d, dev, app);
    if (!(await openDeclaration(d, /^Saúde|Aplicações de saúde/))) return false;
    await pickRadio(d.page, NAO).catch(async () => {
      await checkBox(d.page, /Nenhuma destas|Nenhuma/);
    });
    await clickSave(d);
    return true;
  });

  await gotoContentOverview(d, dev, app);
  const pendingAfter = await pendingAttention(d);
  return { done, skipped, followups, pendingAfter };
}

async function pendingAttention(d: Driver): Promise<number> {
  const t = await d.page.getByText(/Requerem atenção/).first().textContent().catch(() => null);
  const m = t?.match(/\((\d+)\)/);
  return m ? Number(m[1]) : 0;
}

/** Wizard de Segurança de dados (5 passos). */
async function fillDataSafety(d: Driver, dev: string, app: string, rpa: RpaConfig): Promise<void> {
  const ds = rpa.dataSafety!;
  await gotoContentOverview(d, dev, app);
  if (!(await openDeclaration(d, /Segurança d[eo]s dados/))) {
    throw new Error('não achei a declaração de Segurança de dados na visão geral.');
  }

  await clickButton(d, /^Seguinte$/); // passo 1 (Vista geral)

  // passo 2: recolhe? Sim → encriptado? → criação de conta → URL exclusão
  await pickRadio(d.page, SIM);
  await d.page.waitForTimeout(700);
  await pickRadioAfter(
    d.page,
    /encriptados quando estão em trânsito/,
    (ds.encryptedInTransit ?? true) ? SIM : NAO,
  );
  for (const m of ds.accountCreation ?? ['Nome de utilizador e palavra-passe']) {
    await checkBox(d.page, new RegExp('^\\s*' + escapeRe(m) + '\\s*$'));
  }
  if (ds.deletionUrl) await fillText(d.page.getByRole('textbox').first(), ds.deletionUrl);
  await pickRadioAfter(d.page, /sem exigir a eliminação/, NAO).catch(() => {});
  await clickButton(d, /^Seguinte$/);

  // passo 3: tipos de dados — expande e marca
  await expandSections(d.page);
  for (const t of ds.types) {
    await checkBox(d.page, new RegExp('^\\s*' + escapeRe(t.label) + '\\s*$'));
  }
  await clickButton(d, /^Seguinte$/);

  // passo 4: 1 diálogo por tipo
  for (const t of ds.types) await fillDataUsageForType(d, t);
  await clickButton(d, /^Seguinte$/);

  // passo 5: pré-visualização → Guardar
  await clickSave(d);
}

/** Abre o diálogo de um tipo e responde recolhido/efémero/obrigatório/finalidades. */
async function fillDataUsageForType(
  d: Driver,
  t: { label: string; collected?: boolean; shared?: boolean; ephemeral?: boolean; required?: boolean; purposes: string[] },
): Promise<void> {
  await expandSections(d.page); // categorias vêm colapsadas
  const row = d.page.getByText(new RegExp('^\\s*' + escapeRe(t.label) + '\\s*$')).first();
  const open = row.locator('xpath=following::button[1]');
  await open.scrollIntoViewIfNeeded();
  await open.click();
  await d.page.waitForTimeout(1200);

  if (t.collected ?? true) await checkBox(d.page, /^Recolhidos/);
  if (t.shared) await checkBox(d.page, /^Partilhado/);
  await d.page.waitForTimeout(800);
  await pickRadio(
    d.page,
    t.ephemeral ? /processados de forma temporária/ : /não são processados de forma temporária/,
  );
  await d.page.waitForTimeout(800);
  await pickRadio(
    d.page,
    (t.required ?? true)
      ? /A recolha de dados é necessária/
      : /Os utilizadores podem escolher se estes dados são recolhidos/,
  );
  await d.page.waitForTimeout(600);
  for (const p of t.purposes) await checkBox(d.page, new RegExp('^\\s*' + escapeRe(p)));
  await clickSave(d); // "Guardar" do diálogo
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
