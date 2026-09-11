import { createReadStream, existsSync } from 'node:fs';
import { playClient } from './auth.js';
import type { Config, ResolvedApp, Result } from './types.js';

const IMAGE_TYPES = {
  icon: 'icon',
  featureGraphic: 'featureGraphic',
  phoneScreenshots: 'phoneScreenshots',
} as const;

/**
 * Publica um app via API: cria um "edit", sobe o AAB, aponta pra faixa,
 * (opcional) atualiza a ficha da loja + imagens, e faz commit.
 *
 * Cobre a CAMADA 1 (API-automatizável). Declarações de conteúdo e criação do
 * 1º app NÃO passam por aqui — ver o módulo RPA / setup guiado.
 */
export async function publishApp(app: ResolvedApp, saRef?: string): Promise<Result> {
  const cmd = `publish:${app.name}`;
  if (!app.aab) return { ok: false, command: cmd, error: `App "${app.name}": faltou "aab" na config.` };
  if (!existsSync(app.aab)) return { ok: false, command: cmd, error: `AAB não encontrado: ${app.aab}` };

  const ap = await playClient(saRef);
  const packageName = app.packageName;

  const edit = await ap.edits.insert({ packageName });
  const editId = edit.data.id!;

  // 1) sobe o AAB
  const bundle = await ap.edits.bundles.upload({
    packageName,
    editId,
    media: { mimeType: 'application/octet-stream', body: createReadStream(app.aab) },
  });
  const versionCode = bundle.data.versionCode!;

  // 2) aponta pra faixa
  await ap.edits.tracks.update({
    packageName,
    editId,
    track: app.track!,
    requestBody: {
      track: app.track!,
      releases: [
        {
          name: app.releaseName ?? `v${versionCode}`,
          status: app.status!,
          versionCodes: [String(versionCode)],
        },
      ],
    },
  });

  // 3) ficha da loja (texto + imagens) — opcional
  const listingLangs: string[] = [];
  if (app.listing) {
    for (const [language, l] of Object.entries(app.listing)) {
      await ap.edits.listings.update({
        packageName,
        editId,
        language,
        requestBody: {
          language,
          title: l.title,
          shortDescription: l.shortDescription,
          fullDescription: l.fullDescription,
        },
      });
      // imagens
      for (const [key, imageType] of Object.entries(IMAGE_TYPES)) {
        const val = (l as any)[key] as string | string[] | undefined;
        const files = Array.isArray(val) ? val : val ? [val] : [];
        if (!files.length) continue;
        // multi-imagem (screenshots): limpa antes pra evitar duplicar
        if (files.length > 1) {
          await ap.edits.images.deleteall({ packageName, editId, language, imageType }).catch(() => {});
        }
        for (const f of files) {
          if (!existsSync(f)) throw new Error(`Imagem não encontrada: ${f}`);
          await ap.edits.images.upload({
            packageName,
            editId,
            language,
            imageType,
            media: { mimeType: f.endsWith('.png') ? 'image/png' : 'image/jpeg', body: createReadStream(f) },
          });
        }
      }
      listingLangs.push(language);
    }
  }

  // 4) commit
  await ap.edits.commit({ packageName, editId });

  return {
    ok: true,
    command: cmd,
    data: {
      packageName,
      track: app.track,
      status: app.status,
      versionCode,
      listingLangs,
      optInLink: `https://play.google.com/apps/testing/${packageName}`,
      storeLink: `https://play.google.com/store/apps/details?id=${packageName}`,
    },
    manualSteps:
      app.status === 'draft'
        ? ['Lançamento criado como RASCUNHO — confirme/envie pra revisão no Play Console (ou use status "completed").']
        : undefined,
  };
}

/** Links de opt-in (teste) e de loja de um app. */
export function appLinks(app: ResolvedApp): Result {
  return {
    ok: true,
    command: `links:${app.name}`,
    data: {
      optIn: `https://play.google.com/apps/testing/${app.packageName}`,
      store: `https://play.google.com/store/apps/details?id=${app.packageName}`,
      console: `https://play.google.com/console`,
    },
    manualSteps: [
      'O link de opt-in (apps/testing) funciona após o lançamento entrar em revisão.',
      'O link de loja (store/details) só abre depois de PRODUÇÃO (conta pessoal exige 12 testadores x 14 dias).',
    ],
  };
}

/** Sanity check da config sem chamar a API. */
export function inspect(config: Config): Result {
  return {
    ok: true,
    command: 'inspect',
    data: {
      apps: Object.keys(config.apps),
      serviceAccountKey: config.serviceAccountKey ?? 'PLAY_SERVICE_ACCOUNT_JSON (env)',
    },
  };
}
