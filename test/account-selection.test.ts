import assert from 'node:assert/strict';
import { normalizeXHandle, xHandlesMatch } from '../src/projects/account-selection';

assert.equal(normalizeXHandle('@LuisVmomentums'), '@LuisVmomentums');
assert.equal(normalizeXHandle('LuisVmomentums'), '@LuisVmomentums');
assert.equal(normalizeXHandle('https://x.com/LuisVmomentums'), '@LuisVmomentums');
assert.equal(normalizeXHandle('https://twitter.com/LuisVmomentums/'), '@LuisVmomentums');
assert.equal(normalizeXHandle('https://example.com/LuisVmomentums'), null);
assert.equal(normalizeXHandle('usuario con espacios'), null);
assert.equal(normalizeXHandle('@usuario_demasiado_largo'), null);

assert.equal(xHandlesMatch('@LuisVmomentums', 'luisvmomentums'), true);
assert.equal(xHandlesMatch('@LuisVmomentums', '@all_global_llc'), false);
assert.equal(xHandlesMatch('', '@LuisVmomentums'), false);

console.log('ok — selección estricta de cuenta X');

