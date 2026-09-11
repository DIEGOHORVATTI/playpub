/**
 * Classificação de conteúdo (IARC) — o questionário mais chato: multi-página,
 * dezenas de Sim/Não. Estratégia config-driven: email + categoria, e depois
 * responde "Não" a TODA pergunta de conteúdo por default, marcando "Sim" só
 * onde a pergunta casar `iarc.yes` ou for sobre compras digitais (`inAppPurchases`).
 *
 * Radios aceitam `.click()` programático (validado à mão). Os grupos são
 * identificados pelo atributo `name`; a "pergunta" é o texto do container mais
 * próximo. Se a página fugir do padrão, o passo falha e vira um followup de
 * browser-MCP (ver runRpa) — coerente com "o que não der certo, IA no navegador".
 */
import { Driver, clickButton, clickSave, expandSections, fillText, gotoContentOverview, openDeclaration, pickRadio } from './driver.js';
import type { RpaConfig } from '../core/types.js';

export async function fillIarc(d: Driver, dev: string, rpa: RpaConfig): Promise<void> {
  const iarc = rpa.iarc;
  if (!iarc) throw new Error('faltou o bloco rpa.iarc na config.');

  await gotoContentOverview(d, dev, rpa.consoleAppId);
  if (!(await openDeclaration(d, /Classificação de conteúdo/))) {
    throw new Error('Classificação de conteúdo não está pendente (já preenchida?).');
  }

  // Inicia o questionário (a página tem um "Iniciar questionário"/"Começar").
  await clickButton(d, /Iniciar questionário|Iniciar o questionário|Começar|Iniciar novo questionário/).catch(() => {});
  await d.page.waitForTimeout(800);

  // Email de contato + categoria da app.
  await fillText(d.page.getByRole('textbox').first(), iarc.email).catch(() => {});
  await expandSections(d.page).catch(() => {});
  await pickRadio(d.page, new RegExp(escapeRe(iarc.category))).catch(() => {
    throw new Error(`não achei a categoria IARC "${iarc.category}" — confira o rótulo exato.`);
  });
  await clickButton(d, /^(Seguinte|Próximo|Continuar)$/);

  // Páginas de perguntas: responde tudo e avança até o botão final.
  const yes = iarc.yes ?? [];
  for (let pageN = 0; pageN < 30; pageN++) {
    await answerPage(d, yes, !!iarc.inAppPurchases);
    await d.page.waitForTimeout(400);

    const next = d.page.getByRole('button', { name: /^(Seguinte|Próximo|Continuar)$/ });
    if ((await next.count()) && (await next.first().isEnabled().catch(() => false))) {
      if (!d.opts.dryRun) await next.first().click();
      await d.page.waitForTimeout(700);
      if (d.opts.dryRun) break;
      continue;
    }
    // sem "Seguinte": deve ser a última página → salvar/enviar o questionário
    await clickSave(d, /Guardar|Enviar|Submeter|Concluir|Calcular classificação|Guardar questionário/);
    break;
  }
}

/**
 * Responde todos os grupos de radio da página atual. Feito num único evaluate:
 * radios aceitam click() e evita ida-e-volta por opção.
 */
async function answerPage(d: Driver, yes: string[], purchases: boolean): Promise<number> {
  if (d.opts.dryRun) return 0;
  return await d.page.evaluate(
    ({ yesSrc, purchases }: { yesSrc: string[]; purchases: boolean }) => {
      const yesRe = yesSrc.map((s) => new RegExp(s, 'i'));
      const groups: Record<string, HTMLInputElement[]> = {};
      document.querySelectorAll<HTMLInputElement>('input[type=radio]').forEach((r) => {
        (groups[r.name] ||= []).push(r);
      });
      let answered = 0;
      for (const radios of Object.values(groups)) {
        // texto da pergunta = container mais próximo com texto relevante
        let q = '';
        let node: HTMLElement | null = radios[0];
        for (let i = 0; i < 6 && node; i++) {
          node = node.parentElement;
          if (node && node.textContent && node.textContent.trim().length > 12) { q = node.textContent; break; }
        }
        const wantYes = yesRe.some((re) => re.test(q)) || (purchases && /compra|purchase|digita|in-app|na aplica/i.test(q));
        let target: HTMLInputElement | null = null;
        for (const r of radios) {
          const lab = (r.closest('label') || r.parentElement?.parentElement)?.textContent?.trim() || '';
          if (wantYes ? /^\s*sim/i.test(lab) : /^\s*não/i.test(lab)) { target = r; break; }
        }
        if (!target && radios.length === 2) target = radios[1]; // 2º costuma ser "Não"
        if (target && !target.checked) { target.click(); answered++; }
      }
      return answered;
    },
    { yesSrc: yes, purchases },
  );
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
