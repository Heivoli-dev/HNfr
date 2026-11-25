import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { inboxSentAPI } from '../discord-worker/src/inbox.js';

const TOKEN = 't'.repeat(40);
let env;
before(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pem = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  env = { HN_MAIL_TOKEN: TOKEN, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'x@example.com', private_key: `-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----` }) };
});

function fakeFirestore() {
  const docs = new Map();
  const original = global.fetch;
  global.fetch = async (url, options = {}) => {
    url = String(url);
    if (url.startsWith('https://oauth2.googleapis.com')) return Response.json({ access_token: 'a', expires_in: 3600 });
    if (url.endsWith(':commit')) {
      for (const w of JSON.parse(options.body).writes) docs.set(w.update.name.split('/documents/')[1], w.update.fields);
      return Response.json({});
    }
    if (url.endsWith(':runQuery')) {
      const rows = [...docs].filter(([k]) => k.startsWith('sent/')).sort(([, a], [, b]) => b.sentAt.timestampValue.localeCompare(a.sentAt.timestampValue));
      return Response.json(rows.map(([k, fields]) => ({ document: { name: `p/documents/${k}`, fields } })));
    }
    return new Response('?', { status: 500 });
  };
  return { docs, restore: () => { global.fetch = original; } };
}

const call = (method, body, key = TOKEN) => inboxSentAPI(new Request('https://w.test/api/inbox/sent', { method, headers: { Authorization: `Bearer ${key}` }, body: body ? JSON.stringify(body) : undefined }), env);

test('sent mails are saved once and listed newest first', async () => {
  const f = fakeFirestore();
  try {
    assert.equal((await call('GET', null, 'bad')).status, 401);
    assert.equal((await call('POST', { id: 'x' })).status, 400);
    const mail = { id: 'aaaaaaaa-1111', mailbox: 'contact', toEmail: 'Elodie@Example.com', toName: 'Élodie', subject: 'Re: Bug', text: 'Salut', html: '<p>Salut</p>', by: 'Heivoli', inboxId: '123', sentAt: '2026-11-25T10:00:00Z' };
    assert.equal((await call('POST', mail)).status, 200);
    assert.equal((await call('POST', mail)).status, 200); // renvoyé : pas de doublon
    assert.equal((await call('POST', { ...mail, id: 'bbbbbbbb-2222', subject: 'Nouveau', sentAt: '2026-11-25T11:00:00Z' })).status, 200);
    assert.equal(f.docs.size, 2);
    const { sent } = await (await call('GET')).json();
    assert.deepEqual(sent.map((s) => s.subject), ['Nouveau', 'Re: Bug']);
    assert.equal(sent[1].toEmail, 'elodie@example.com');
    assert.equal(sent[1].html, '<p>Salut</p>');
  } finally { f.restore(); }
});
