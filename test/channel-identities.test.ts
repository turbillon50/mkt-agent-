import assert from 'node:assert/strict';
import {
  gmailPublicIdentity,
  tiktokPublicIdentity,
  youtubePublicIdentity,
} from '../src/projects/public-identities';

assert.deepEqual(
  gmailPublicIdentity({ response_data: { emailAddress: 'equipo@example.com' } }),
  {
    id: 'equipo@example.com',
    handle: 'equipo@example.com',
    label: 'equipo@example.com',
  },
);

assert.deepEqual(
  tiktokPublicIdentity({
    data: {
      user: {
        open_id: 'tt_123',
        username: 'v_living3',
        display_name: 'V&LIVING',
      },
    },
  }),
  {
    id: 'tt_123',
    handle: '@v_living3',
    label: 'V&LIVING',
    avatar: null,
  },
);

assert.deepEqual(
  youtubePublicIdentity({
    items: [
      {
        id: 'UC123',
        snippet: {
          title: 'All Global Holding',
          customUrl: '@allglobalholding',
          thumbnails: { default: { url: 'https://img.example.com/channel.jpg' } },
        },
      },
    ],
  }),
  {
    id: 'UC123',
    handle: '@allglobalholding',
    label: 'All Global Holding',
    avatar: 'https://img.example.com/channel.jpg',
  },
);

assert.throws(() => youtubePublicIdentity({ items: [] }), /YouTube no devolvió/);
assert.throws(() => tiktokPublicIdentity({ data: {} }), /TikTok no devolvió/);

console.log('ok — identidades públicas de Gmail, TikTok y YouTube');
