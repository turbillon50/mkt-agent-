import assert from 'node:assert/strict';
import { elegirFormato } from '../src/creative/specs';
import {
  SOCIAL_PLAYBOOKS,
  angulosParaRed,
  esRedPublicable,
  type RedPublicable,
} from '../src/creative/social-playbooks';
import { sanitizePublicationError } from '../src/publishing/errors';
import { assertPublicMediaUrl } from '../src/channels/media-url';

const REDES: RedPublicable[] = [
  'facebook',
  'instagram',
  'linkedin',
  'twitter',
  'tiktok',
  'youtube',
];

for (const red of REDES) {
  assert.equal(esRedPublicable(red), true, `${red} debe ser publicable`);
  const p = SOCIAL_PLAYBOOKS[red];
  assert.match(p.fuente, /^https:\/\//, `${red} necesita fuente oficial`);
  assert.match(p.version, /^\d{4}-\d{2}-\d{2}$/, `${red} necesita versión`);
  assert.ok(p.caracteresMax > 0, `${red} necesita límite de copy`);
  assert.ok(p.angulos.length >= 2, `${red} necesita más de un arte`);
  assert.equal(new Set(p.angulos.map((a) => a.angulo)).size, p.angulos.length);
  assert.equal(angulosParaRed(red)[0]?.angulo, p.angulos[0]?.angulo);
  const formato = elegirFormato(red);
  assert.equal(formato.red, red, `${red} debe elegir su propio lienzo`);
}

assert.notEqual(
  SOCIAL_PLAYBOOKS.instagram.angulos[0]?.angulo,
  SOCIAL_PLAYBOOKS.linkedin.angulos[0]?.angulo,
  'Instagram y LinkedIn no deben arrancar con la misma dirección visual',
);
assert.notEqual(
  SOCIAL_PLAYBOOKS.facebook.estructuraCopy,
  SOCIAL_PLAYBOOKS.twitter.estructuraCopy,
  'Facebook y X no deben compartir estructura de copy',
);

const sanitized = sanitizePublicationError(
  'Authorization=super-secret access_token=abc123 Bearer eyJ.secret https://x.test/oauth/authorize?token=foo',
);
assert.ok(!sanitized.includes('super-secret'));
assert.ok(!sanitized.includes('abc123'));
assert.ok(!sanitized.includes('eyJ.secret'));
assert.ok(!sanitized.includes('token=foo'));

assert.doesNotThrow(() => assertPublicMediaUrl('https://assets.example.com/pieza.jpg'));
for (const url of [
  'file:///etc/passwd',
  'http://localhost/image.jpg',
  'http://127.0.0.1/image.jpg',
  'http://10.0.0.1/image.jpg',
  'http://192.168.1.2/image.jpg',
]) {
  assert.throws(() => assertPublicMediaUrl(url), `debe rechazar ${url}`);
}

console.log(`ok — ${REDES.length} playbooks nativos, saneamiento y subida pública`);
