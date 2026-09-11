/**
 * Check runnable (sem navegador): garante que runRpa faz as validações de guarda
 * ANTES de abrir o Chrome — se faltar consoleAppId/developerId/bloco rpa, ele
 * devolve um Result ok:false limpo em vez de estourar ou abrir janela à toa.
 * Rode: `npm run check` (via tsx, importa o src direto).
 */
import assert from 'node:assert';
import { runRpa } from '../src/rpa/index.js';

const fakeApp = (rpa) => ({ name: 'x', packageName: 'com.x', track: 'alpha', status: 'draft', rpa });

// 1) sem bloco rpa → erro limpo, sem navegador
let r = await runRpa({ developerId: '123', app: fakeApp(undefined), dryRun: true });
assert(r.ok === false && /bloco "rpa"/.test(r.error), `esperava erro de bloco rpa, veio: ${r.error}`);

// 2) sem consoleAppId → erro limpo
r = await runRpa({ developerId: '123', app: fakeApp({ consoleAppId: '' }), dryRun: true });
assert(r.ok === false && /consoleAppId/.test(r.error), `esperava erro de consoleAppId, veio: ${r.error}`);

// 3) sem developerId → erro limpo
r = await runRpa({ developerId: '', app: fakeApp({ consoleAppId: '999' }), dryRun: true });
assert(r.ok === false && /developerId/.test(r.error), `esperava erro de developerId, veio: ${r.error}`);

console.log('check-rpa OK — guards validados (nenhum navegador aberto).');
