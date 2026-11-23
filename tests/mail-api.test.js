import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mailAPI, unsubscribe } from '../discord-worker/src/mail.js';
import { esc, sanctionMail, ticketReplyMail } from '../discord-worker/src/mail-templates.js';

let account;
before(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pem = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  account = { client_email: 'mail-test@example.com', private_key: `-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----` };
});

const fresh = () => new Date(Date.now() - 60000).toISOString();
const doc = (fields) => ({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'boolean' ? { booleanValue: v } : k.endsWith('At') ? { timestampValue: v } : { stringValue: v }])) });

async function run(body, { caller = 'alice', founder = false, admin = false, docs = {}, log = new Set(), subscribers = [] } = {}) {
  const original = global.fetch, sent = [], commits = [];
  global.fetch = async (url, options = {}) => {
    url = String(url);
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'tok' });
    if (url.includes('accounts:lookup?key=')) return Response.json({ users: [{ localId: caller, email: founder ? 'heivolipro@gmail.com' : `${caller}@example.com`, emailVerified: true }] });
    if (url.includes('/accounts:lookup')) {
      const ids = JSON.parse(options.body).localId;
      return Response.json({ users: ids.filter((id) => id !== 'discord-x').map((id) => ({ localId: id, email: `${id}@example.com`, emailVerified: true })) });
    }
    if (url === 'https://api.brevo.com/v3/smtp/email') { sent.push(JSON.parse(options.body)); return Response.json({ messageId: 'm' }); }
    if (url.endsWith(':commit')) {
      const writes = JSON.parse(options.body).writes; commits.push(writes);
      for (const w of writes) {
        const id = w.update?.name.split('/mailLog/')[1];
        if (id && w.currentDocument?.exists === false) { if (log.has(id)) return new Response('exists', { status: 409 }); log.add(id); }
        const del = w.delete?.split('/mailLog/')[1]; if (del) log.delete(del);
      }
      return Response.json({ writeResults: [] });
    }
    if (url.endsWith(':runQuery')) return Response.json(subscribers.map((id) => ({ document: { name: `x/mailPrefs/${id}`, fields: { news: { booleanValue: true } } } })));
    if (url.includes('/admins/') && admin) return Response.json(doc({ email: 'mod@example.com' }));
    const path = url.split('/documents/')[1];
    if (path && docs[path]) return Response.json(doc(docs[path]));
    return new Response('', { status: 404 });
  };
  try {
    const request = new Request('https://worker.test/api/mail', { method: 'POST', headers: { Origin: 'https://heivoli-network.fr', Authorization: 'Bearer t' }, body: JSON.stringify(body) });
    const response = await mailAPI(request, { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(account), BREVO_API_KEY: 'k' });
    return { status: response.status, data: await response.json(), sent, commits };
  } finally { global.fetch = original; }
}

test('mail endpoint refuses other origins and anonymous calls', async () => {
  const bad = new Request('https://worker.test/api/mail', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' });
  assert.equal((await mailAPI(bad, {})).status, 403);
  const anon = new Request('https://worker.test/api/mail', { method: 'POST', headers: { Origin: 'https://heivoli-network.fr' }, body: '{}' });
  assert.equal((await mailAPI(anon, {})).status, 401);
});

test('welcome mail goes once, only after the rules are accepted, to the caller only', async () => {
  const none = await run({ type: 'welcome' }, { docs: { 'members/alice': { role: 'member' } } });
  assert.equal(none.sent.length, 0);
  const log = new Set();
  const docs = { 'members/alice': { rulesVersion: '2026-11-20' }, 'profiles/alice': { displayName: 'Ali<b>' } };
  const first = await run({ type: 'welcome' }, { docs, log });
  assert.equal(first.sent.length, 1);
  assert.equal(first.sent[0].to[0].email, 'alice@example.com');
  assert.equal(first.sent[0].sender.email, 'contact@heivoli-network.fr');
  assert.ok(first.sent[0].htmlContent.includes('Ali&lt;b&gt;'));
  const again = await run({ type: 'welcome' }, { docs, log });
  assert.equal(again.sent.length, 0);
});

test('ticket replies: moderators only, real recent moderator message, mail to the ticket owner', async () => {
  const docs = {
    'tickets/t1': { creatorId: 'bob', creatorName: 'Bob', subject: 'Carte' },
    'tickets/t1/messages/m1': { authorId: 'alice', authorIsModerator: true, text: 'Corrigé !', createdAt: fresh() },
  };
  assert.equal((await run({ type: 'ticket', id: 't1/m1' }, { docs })).status, 403);
  const ok = await run({ type: 'ticket', id: 't1/m1' }, { docs, admin: true });
  assert.equal(ok.sent.length, 1);
  assert.equal(ok.sent[0].to[0].email, 'bob@example.com');
  const notMine = await run({ type: 'ticket', id: 't1/m1' }, { docs, admin: true, caller: 'carol' });
  assert.equal(notMine.status, 404);
});

test('sanction mails need the moderator who created it and skip accounts without email', async () => {
  const docs = { 'sanctions/s1': { uid: 'bob', type: 'ban', reason: 'Spam', createdBy: 'alice', createdAt: fresh(), expiresAt: fresh() } };
  const ok = await run({ type: 'sanction', id: 's1' }, { docs, admin: true });
  assert.equal(ok.sent.length, 1); assert.match(ok.sent[0].subject, /suspendu/);
  const discord = { 'sanctions/s2': { ...docs['sanctions/s1'], uid: 'discord-x' } };
  assert.equal((await run({ type: 'sanction', id: 's2' }, { docs: discord, admin: true })).data.skipped, 'no-email');
  const note = { 'sanctions/s3': { ...docs['sanctions/s1'], type: 'note' } };
  assert.equal((await run({ type: 'sanction', id: 's3' }, { docs: note, admin: true })).status, 404);
});

test('newsletter: founder only, subscribers only, with a working unsubscribe link', async () => {
  const docs = { 'announcements/a1': { type: 'Événement', title: 'Tournoi', text: 'Samedi', createdAt: fresh() } };
  assert.equal((await run({ type: 'news', id: 'a1' }, { docs, admin: true })).status, 403);
  const ok = await run({ type: 'news', id: 'a1' }, { docs, founder: true, subscribers: ['bob', 'discord-x', 'carol'] });
  assert.equal(ok.data.sent, 2);
  const versions = ok.sent[0].messageVersions;
  assert.deepEqual(versions.map((v) => v.to[0].email), ['bob@example.com', 'carol@example.com']);
  assert.equal(ok.sent[0].sender.email, 'news@heivoli-network.fr');
  const link = versions[0].headers['List-Unsubscribe'].slice(1, -1);
  const original = global.fetch; const commits = [];
  global.fetch = async (url, options = {}) => String(url).endsWith(':commit') ? (commits.push(JSON.parse(options.body)), Response.json({})) : Response.json({ access_token: 'tok' });
  try {
    const env = { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(account) };
    assert.match(await (await unsubscribe(new Request(link), env)).text(), /Se désabonner/);
    assert.equal(commits.length, 0);
    await unsubscribe(new Request(link, { method: 'POST' }), env);
    assert.equal(commits[0].writes[0].update.fields.news.booleanValue, false);
    assert.ok(commits[0].writes[0].update.name.endsWith('/mailPrefs/bob'));
    assert.match(await (await unsubscribe(new Request(link.replace(/t=\w+/, 't=00')), env)).text(), /invalide/);
  } finally { global.fetch = original; }
});

test('templates escape member text', () => {
  assert.equal(esc('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');
  assert.ok(!ticketReplyMail({ name: 'x', subject: '<img>', ticketId: 't', message: '<script>' }).html.includes('<script>'));
  assert.ok(sanctionMail({ name: 'x', type: 'ban', reason: 'r', until: null }).html.includes('définitive'));
});

test('HN Mail inbox needs the private key and returns stored mails', async () => {
  const { inboxAPI } = await import('../discord-worker/src/inbox.js');
  const token = 'k'.repeat(32);
  const req = (key) => new Request('https://worker.test/api/inbox', { headers: key ? { Authorization: `Bearer ${key}` } : {} });
  assert.equal((await inboxAPI(req(token), {})).status, 503);
  const env = { HN_MAIL_TOKEN: token, FIREBASE_SERVICE_ACCOUNT: JSON.stringify(account) };
  assert.equal((await inboxAPI(req('wrong'), env)).status, 401);
  assert.equal((await inboxAPI(req(''), env)).status, 401);
  const original = global.fetch;
  global.fetch = async (url) => String(url).includes('oauth2') ? Response.json({ access_token: 't' })
    : Response.json([{ document: { name: 'x/inbox/123-abc', fields: { mailbox: { stringValue: 'contact' }, subject: { stringValue: 'Salut' }, fromEmail: { stringValue: 'a@b.fr' }, attachments: { arrayValue: { values: [{ stringValue: 'photo.jpg' }] } } } } }]);
  try {
    const res = await inboxAPI(req(token), env);
    assert.equal(res.status, 200);
    const { messages } = await res.json();
    assert.equal(messages[0].id, '123-abc');
    assert.equal(messages[0].subject, 'Salut');
    assert.deepEqual(messages[0].attachments, ['photo.jpg']);
  } finally { global.fetch = original; }
});
