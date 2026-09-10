import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import worker from '../discord-worker/src/index.js';
import { beginDiscordLogin, consumeDiscordToken } from '../security.js';

const env = { DISCORD_CLIENT_ID: '123', DISCORD_CLIENT_SECRET: 'secret', DISCORD_BOT_TOKEN: 'bot', DISCORD_GUILD_ID: '123' , FIREBASE_SERVICE_ACCOUNT: '{}' };
const state = 'a'.repeat(64);
const origin = 'https://auth.example';
async function start(returnTo = 'tickets') {
  return worker.fetch(new Request(`${origin}/login?clientState=${state}&returnTo=${returnTo}`), env);
}
test('OAuth rejects missing browser state, non-GET methods and unknown routes', async () => {
  assert.equal((await worker.fetch(new Request(`${origin}/login`), env)).status, 400);
  assert.equal((await worker.fetch(new Request(`${origin}/callback`, { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.fetch(new Request(`${origin}/unknown`), env)).status, 404);
});
test('OAuth cookie is host-only, secure and private; responses cannot be cached', async () => {
  const result = await start();
  assert.equal(result.status, 302);
  assert.match(result.headers.get('set-cookie'), /^__Host-/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(result.headers.get('set-cookie').includes(flag));
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(new URL(result.headers.get('location')).searchParams.get('scope'), 'identify guilds.join');
});
test('OAuth rejects missing, malformed, mismatched cookies and unsafe return paths before network access', async () => {
  const savedFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Unexpected upstream request'); };
  try {
    for (const cookie of ['', '__Host-heivoli_discord_state=%XX', `__Host-heivoli_discord_state=${encodeURIComponent(JSON.stringify(['b'.repeat(43), '//evil.example', state]))}`]) {
      const result = await worker.fetch(new Request(`${origin}/callback?code=code&state=${'b'.repeat(43)}`, { headers: { Cookie: cookie } }), env);
      assert.equal(result.status, 400);
    }
    const login = await start();
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await worker.fetch(new Request(`${origin}/callback?code=code&state=wrong`, { headers: { Cookie: cookie } }), env)).status, 400);
  } finally { globalThis.fetch = savedFetch; }
});
test('OAuth successful callback signs a short-lived token and returns only to the site', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const privateKey = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64');
  const account = { client_email: 'test@example.com', private_key: `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----` };
  const login = await start();
  const oauthState = new URL(login.headers.get('location')).searchParams.get('state');
  const savedFetch = globalThis.fetch;
  const replies = [{ access_token: 'discord-access' }, { id: '123456789012345678', username: 'Test' }, {}];
  globalThis.fetch = async () => Response.json(replies.shift());
  try {
    const result = await worker.fetch(new Request(`${origin}/callback?code=code&state=${oauthState}`, { headers: { Cookie: login.headers.get('set-cookie').split(';')[0] } }), { ...env, FIREBASE_SERVICE_ACCOUNT: JSON.stringify(account) });
    assert.equal(result.status, 302);
    const target = new URL(result.headers.get('location'));
    assert.equal(target.origin, 'https://heivoli-network.fr');
    assert.equal(target.pathname, '/tickets.html');
    const params = new URLSearchParams(target.hash.slice(1));
    assert.equal(params.get('clientState'), state);
    const [header, payload, signature] = params.get('discordToken').split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.equal(claims.exp - claims.iat, 300);
    assert.equal(claims.uid, 'discord-123456789012345678');
    assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', keys.publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${header}.${payload}`)), true);
    assert.match(result.headers.get('set-cookie'), /Max-Age=0/);
  } finally { globalThis.fetch = savedFetch; }
});
test('Browser rejects unsolicited, expired and replayed login tokens and clears the fragment', () => {
  const storage = new Map();
  globalThis.sessionStorage = { setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k) ?? null, removeItem: k => storage.delete(k) };
  let target;
  globalThis.window = { location: { hash: '#discordToken=attacker', pathname: '/profil.html', search: '', assign: url => { target = new URL(url); } } };
  let cleared = 0;
  globalThis.history = { replaceState: () => { cleared++; } };
  assert.equal(consumeDiscordToken(), null);
  beginDiscordLogin(`${origin}/login`);
  window.location.hash = `#discordToken=valid&clientState=${target.searchParams.get('clientState')}`;
  assert.equal(consumeDiscordToken(), 'valid');
  assert.equal(consumeDiscordToken(), null);
  beginDiscordLogin(`${origin}/login`);
  const pending = JSON.parse(storage.get('heivoli-discord-login'));
  storage.set('heivoli-discord-login', JSON.stringify({ ...pending, createdAt: Date.now() - 610000 }));
  window.location.hash = `#discordToken=old&clientState=${pending.state}`;
  assert.equal(consumeDiscordToken(), null);
  assert.equal(cleared, 4);
});
test('Announcements display stored attack payloads as text, never HTML', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function renderAnnouncements('), source.indexOf('\nrenderAnnouncements(announcements)'));
  function element() { return { children: [], append(child) { this.children.push(child); }, replaceChildren() { this.children = []; }, set innerHTML(_) { throw new Error('Unsafe HTML sink'); } }; }
  const list = element();
  const attack = '<img src=x onerror=alert(document.cookie)>';
  const context = vm.createContext({ document: { createElement: element }, announcementList: list });
  vm.runInContext(body + '\nrenderAnnouncements(' + JSON.stringify([{ type: attack, title: attack, text: attack, date: attack }]) + ')', context);
  assert.equal(list.children.length, 1);
  for (const node of list.children[0].children) assert.equal(node.textContent, attack);
});
