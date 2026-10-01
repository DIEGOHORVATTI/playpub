/**
 * Check runnable do gerador de CSV da Segurança de dados, com um recorte real
 * do CSV exportado da Console. Rode: `npx tsx scripts/check-datasafety.mjs`.
 */
import assert from 'node:assert';
import { fillDataSafetyCsv, parseCsv } from '../src/core/dataSafetyCsv.ts';

const template = `Question ID (machine readable),Response ID (machine readable),Response value,Answer requirement,Human-friendly question label
PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA,,,REQUIRED,A sua app recolhe ou partilha algum dos tipos de dados do utilizador necessários?
PSL_SUPPORTED_ACCOUNT_CREATION_METHODS,PSL_ACM_USER_ID_PASSWORD,,MULTIPLE_CHOICE,Qual dos seguintes métodos?/Nome de utilizador e palavra-passe
PSL_SUPPORTED_ACCOUNT_CREATION_METHODS,PSL_ACM_OAUTH,,MULTIPLE_CHOICE,Qual dos seguintes métodos?/OAuth
PSL_ACCOUNT_DELETION_URL,,,MAYBE_REQUIRED,Adicione um link
PSL_SUPPORT_DATA_DELETION_BY_USER,DATA_DELETION_YES,,SINGLE_CHOICE,Eliminação?/Sim
PSL_SUPPORT_DATA_DELETION_BY_USER,DATA_DELETION_NO,,SINGLE_CHOICE,Eliminação?/Não
PSL_DATA_TYPES_PERSONAL,PSL_NAME,,MULTIPLE_CHOICE,Informações pessoais/Nome
PSL_DATA_TYPES_PERSONAL,PSL_ADDRESS,,MULTIPLE_CHOICE,Informações pessoais/Endereço
PSL_DATA_TYPES_PHOTOS_AND_VIDEOS,PSL_PHOTOS,,MULTIPLE_CHOICE,Fotos e vídeos/Fotos
PSL_DATA_USAGE_RESPONSES:PSL_PHOTOS:PSL_DATA_USAGE_COLLECTION_AND_SHARING,PSL_DATA_USAGE_ONLY_COLLECTED,,MULTIPLE_CHOICE,"Utilização (Fotos)/Recolhidos, partilhados?/Recolhidos"
PSL_DATA_USAGE_RESPONSES:PSL_PHOTOS:PSL_DATA_USAGE_EPHEMERAL,,,MAYBE_REQUIRED,Utilização (Fotos)/Efémero?
PSL_DATA_USAGE_RESPONSES:PSL_PHOTOS:DATA_USAGE_USER_CONTROL,PSL_DATA_USAGE_USER_CONTROL_OPTIONAL,,SINGLE_CHOICE,Utilização (Fotos)/Controle?/Opcional
PSL_DATA_USAGE_RESPONSES:PSL_PHOTOS:DATA_USAGE_USER_CONTROL,PSL_DATA_USAGE_USER_CONTROL_REQUIRED,,SINGLE_CHOICE,Utilização (Fotos)/Controle?/Necessária
PSL_DATA_USAGE_RESPONSES:PSL_PHOTOS:DATA_USAGE_COLLECTION_PURPOSE,PSL_APP_FUNCTIONALITY,,MULTIPLE_CHOICE,Utilização (Fotos)/Por que motivo?/Funcionalidade da app
PSL_DATA_USAGE_RESPONSES:PSL_PHOTOS:DATA_USAGE_COLLECTION_PURPOSE,PSL_ANALYTICS,,MULTIPLE_CHOICE,Utilização (Fotos)/Por que motivo?/Análise
PSL_DATA_USAGE_RESPONSES:PSL_ADDRESS:PSL_DATA_USAGE_EPHEMERAL,,,MAYBE_REQUIRED,Utilização (Endereço)/Efémero?
`;

const { csv, missing } = fillDataSafetyCsv(template, {
  deletionUrl: 'https://x.dev/excluir',
  types: [{ label: 'Fotos', required: false, purposes: ['Funcionalidade da app'] }],
});
const v = Object.fromEntries(parseCsv(csv).slice(1).map((r) => [`${r[0]}|${r[1]}`, r[2]]));

assert.deepEqual(missing, []);
assert.equal(v['PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA|'], 'true');
assert.equal(v['PSL_SUPPORTED_ACCOUNT_CREATION_METHODS|PSL_ACM_USER_ID_PASSWORD'], 'true');
assert.equal(v['PSL_SUPPORTED_ACCOUNT_CREATION_METHODS|PSL_ACM_OAUTH'], 'false');
assert.equal(v['PSL_ACCOUNT_DELETION_URL|'], 'https://x.dev/excluir');
assert.equal(v['PSL_SUPPORT_DATA_DELETION_BY_USER|DATA_DELETION_YES'], 'true');
assert.equal(v['PSL_DATA_TYPES_PERSONAL|PSL_NAME'], 'false');
assert.equal(v['PSL_DATA_TYPES_PHOTOS_AND_VIDEOS|PSL_PHOTOS'], 'true');
assert.equal(v['PSL_DATA_USAGE_RESPONSES:PSL_PHOTOS:PSL_DATA_USAGE_EPHEMERAL|'], 'false');
assert.equal(v['PSL_DATA_USAGE_RESPONSES:PSL_PHOTOS:DATA_USAGE_USER_CONTROL|PSL_DATA_USAGE_USER_CONTROL_OPTIONAL'], 'true');
assert.equal(v['PSL_DATA_USAGE_RESPONSES:PSL_PHOTOS:DATA_USAGE_COLLECTION_PURPOSE|PSL_ANALYTICS'], 'false');
assert.equal(v['PSL_DATA_USAGE_RESPONSES:PSL_ADDRESS:PSL_DATA_USAGE_EPHEMERAL|'], '', 'tipo não declarado fica vazio');
assert.match(csv, /"Utilização \(Fotos\)\/Recolhidos, partilhados\?\/Recolhidos"/, 'aspas preservadas');

assert.deepEqual(fillDataSafetyCsv(template, { types: [{ label: 'Inexistente', purposes: [] }] }).missing, ['Inexistente']);

console.log('check-datasafety OK');
