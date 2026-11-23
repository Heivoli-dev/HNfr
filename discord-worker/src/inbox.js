// Boîte de réception de HN Mail : le Worker garde une copie de chaque mail reçu sur contact@ et news@
// (collection Firestore « inbox », jamais lisible depuis le site) et l'app Mac les lit avec une clé privée.
import { ROOT, URL_ROOT, serviceToken } from './network.js';

const KEEP_DAYS = 90;

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}

async function firestore(env, path, options = {}) {
  const token = await serviceToken(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT));
  const res = await fetch(`${URL_ROOT}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`firestore ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const value = (v) => v?.stringValue ?? v?.timestampValue ?? (v?.arrayValue ? (v.arrayValue.values || []).map((x) => x.stringValue) : null);

/** Enregistre le mail reçu. Renvoie le mail lu (expéditeur, objet…) ou null si illisible. */
export async function storeIncoming(message, env) {
  const raw = await new Response(message.raw).arrayBuffer();
  const { default: PostalMime } = await import('postal-mime'); // chargé seulement quand un mail arrive
  const email = await PostalMime.parse(raw);
  const to = String(message.to || '').toLowerCase();
  const mailbox = to.startsWith('news@') ? 'news' : 'contact';
  const text = (email.text && email.text.trim()) ? email.text : htmlToText(email.html);
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const fields = {
    mailbox: { stringValue: mailbox },
    to: { stringValue: to.slice(0, 200) },
    fromName: { stringValue: String(email.from?.name || '').slice(0, 200) },
    fromEmail: { stringValue: String(email.from?.address || message.from || '').toLowerCase().slice(0, 200) },
    replyTo: { stringValue: String(email.replyTo?.[0]?.address || '').toLowerCase().slice(0, 200) },
    subject: { stringValue: String(email.subject || '(sans objet)').slice(0, 300) },
    text: { stringValue: String(text || '').slice(0, 60000) },
    messageId: { stringValue: String(email.messageId || '').slice(0, 300) },
    date: { timestampValue: new Date(Date.parse(email.date || '') || Date.now()).toISOString() },
    receivedAt: { timestampValue: new Date().toISOString() },
    attachments: { arrayValue: { values: (email.attachments || []).slice(0, 20).map((a) => ({ stringValue: String(a.filename || 'pièce jointe').slice(0, 120) })) } },
  };
  await firestore(env, ':commit', { method: 'POST', body: JSON.stringify({ writes: [{ update: { name: `${ROOT}/inbox/${id}`, fields }, currentDocument: { exists: false } }] }) });
  return { id, mailbox, fromEmail: fields.fromEmail.stringValue, subject: fields.subject.stringValue };
}

/** Supprime les mails gardés depuis plus de 90 jours (quelques-uns à chaque nouveau mail). */
export async function cleanupInbox(env) {
  const limit = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
  const rows = await firestore(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'inbox' }],
    where: { fieldFilter: { field: { fieldPath: 'receivedAt' }, op: 'LESS_THAN', value: { timestampValue: limit } } },
    limit: 20,
  } }) });
  const writes = rows.filter((r) => r.document).map((r) => ({ delete: r.document.name }));
  if (writes.length) await firestore(env, ':commit', { method: 'POST', body: JSON.stringify({ writes }) });
}

const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** GET /api/inbox : liste des mails reçus, pour l'app Mac (clé HN_MAIL_TOKEN). */
export async function inboxAPI(request, env) {
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
  if (request.method !== 'GET') return reply({ error: 'Méthode refusée.' }, 405);
  const key = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!env.HN_MAIL_TOKEN || env.HN_MAIL_TOKEN.length < 24) return reply({ error: 'La clé HN Mail n’est pas encore installée sur le serveur.' }, 503);
  if (!safeEqual(key, env.HN_MAIL_TOKEN)) return reply({ error: 'Clé HN Mail incorrecte.' }, 401);
  try {
    const rows = await firestore(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'inbox' }],
      orderBy: [{ field: { fieldPath: 'receivedAt' }, direction: 'DESCENDING' }],
      limit: 200,
    } }) });
    const messages = rows.filter((r) => r.document).map((r) => {
      const f = r.document.fields || {};
      const out = { id: r.document.name.split('/').pop() };
      for (const k of ['mailbox', 'to', 'fromName', 'fromEmail', 'replyTo', 'subject', 'text', 'messageId', 'date', 'receivedAt', 'attachments']) out[k] = value(f[k]);
      return out;
    });
    return reply({ messages });
  } catch (error) {
    console.log('inbox error', String(error?.message || error));
    return reply({ error: 'Boîte de réception indisponible pour le moment.' }, 503);
  }
}
