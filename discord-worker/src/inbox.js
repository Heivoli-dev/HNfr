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
  const sentRows = await firestore(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'sent' }],
    where: { fieldFilter: { field: { fieldPath: 'sentAt' }, op: 'LESS_THAN', value: { timestampValue: limit } } },
    limit: 20,
  } }) });
  const writes = [...rows, ...sentRows].filter((r) => r.document).map((r) => ({ delete: r.document.name }));
  if (writes.length) await firestore(env, ':commit', { method: 'POST', body: JSON.stringify({ writes }) });
}

const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });

function checkKey(request, env) {
  const key = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!env.HN_MAIL_TOKEN || env.HN_MAIL_TOKEN.length < 24) return json({ error: 'La clé HN Mail n’est pas encore installée sur le serveur.' }, 503);
  if (!safeEqual(key, env.HN_MAIL_TOKEN)) return json({ error: 'Clé HN Mail incorrecte.' }, 401);
  return null;
}

/** POST /api/inbox/replied : marque un mail « répondu » (ou le remet à traiter) pour toute l'équipe. */
export async function inboxRepliedAPI(request, env) {
  if (request.method !== 'POST') return json({ error: 'Méthode refusée.' }, 405);
  const denied = checkKey(request, env);
  if (denied) return denied;
  let body;
  try { body = JSON.parse((await request.text()).slice(0, 2048)); } catch { return json({ error: 'Demande invalide.' }, 400); }
  const id = String(body?.id || '');
  if (!/^[0-9]{10,16}-[0-9a-f]{8}$/.test(id)) return json({ error: 'Mail inconnu.' }, 400);
  const name = `${ROOT}/inbox/${id}`;
  const by = String(body?.by || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || 'Équipe';
  const write = body?.value === false
    ? { update: { name, fields: {} }, updateMask: { fieldPaths: ['repliedAt', 'repliedBy'] }, currentDocument: { exists: true } }
    : { update: { name, fields: { repliedAt: { timestampValue: new Date().toISOString() }, repliedBy: { stringValue: by } } }, updateMask: { fieldPaths: ['repliedAt', 'repliedBy'] }, currentDocument: { exists: true } };
  try {
    await firestore(env, ':commit', { method: 'POST', body: JSON.stringify({ writes: [write] }) });
    return json({ ok: true });
  } catch (error) {
    console.log('inbox replied error', String(error?.message || error));
    return json({ error: 'Impossible d’enregistrer pour le moment.' }, 503);
  }
}

const SENT_FIELDS = ['mailbox', 'toEmail', 'toName', 'subject', 'text', 'html', 'sentAt', 'by', 'inboxId', 'template'];

/**
 * /api/inbox/sent : mails envoyés depuis HN Mail (Mac et Windows), gardés 90 jours.
 * GET → { sent: [...] } ; POST { id, mailbox, toEmail, toName, subject, text, html, by, inboxId, template } → { ok }
 */
export async function inboxSentAPI(request, env) {
  const denied = checkKey(request, env);
  if (denied) return denied;
  try {
    if (request.method === 'GET') {
      const rows = await firestore(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: 'sent' }],
        orderBy: [{ field: { fieldPath: 'sentAt' }, direction: 'DESCENDING' }],
        limit: 200,
      } }) });
      const sent = rows.filter((r) => r.document).map((r) => {
        const f = r.document.fields || {};
        const out = { id: r.document.name.split('/').pop() };
        for (const k of SENT_FIELDS) out[k] = value(f[k]);
        return out;
      });
      return json({ sent });
    }
    if (request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > 400000) return json({ error: 'Mail trop long.' }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: 'Demande invalide.' }, 400); }
      const id = String(body?.id || '');
      if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return json({ error: 'Identifiant invalide.' }, 400);
      const str = (v, max) => ({ stringValue: String(v ?? '').replace(/\u0000/g, '').slice(0, max) });
      const fields = {
        mailbox: str(body.mailbox === 'news' ? 'news' : 'contact', 10),
        toEmail: str(String(body.toEmail || '').toLowerCase(), 200),
        toName: str(body.toName, 200),
        subject: str(body.subject, 300),
        text: str(body.text, 30000),
        html: str(body.html, 300000),
        by: str(String(body.by || '').replace(/[\u0000-\u001f]/g, '').trim() || 'Équipe', 60),
        inboxId: str(body.inboxId, 64),
        template: str(body.template, 60),
        sentAt: { timestampValue: new Date(Date.parse(body.sentAt || '') || Date.now()).toISOString() },
      };
      // Même identifiant = même mail : renvoyer deux fois ne crée pas de doublon.
      await firestore(env, ':commit', { method: 'POST', body: JSON.stringify({ writes: [{ update: { name: `${ROOT}/sent/${id}`, fields } }] }) });
      return json({ ok: true });
    }
    return json({ error: 'Méthode refusée.' }, 405);
  } catch (error) {
    console.log('inbox sent error', String(error?.message || error));
    return json({ error: 'Envoyés indisponibles pour le moment.' }, 503);
  }
}

/** GET /api/inbox : liste des mails reçus, pour l'app (clé HN_MAIL_TOKEN). */
export async function inboxAPI(request, env) {
  const reply = json;
  if (request.method !== 'GET') return reply({ error: 'Méthode refusée.' }, 405);
  const denied = checkKey(request, env);
  if (denied) return denied;
  try {
    const rows = await firestore(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'inbox' }],
      orderBy: [{ field: { fieldPath: 'receivedAt' }, direction: 'DESCENDING' }],
      limit: 200,
    } }) });
    const messages = rows.filter((r) => r.document).map((r) => {
      const f = r.document.fields || {};
      const out = { id: r.document.name.split('/').pop() };
      for (const k of ['mailbox', 'to', 'fromName', 'fromEmail', 'replyTo', 'subject', 'text', 'messageId', 'date', 'receivedAt', 'attachments', 'repliedAt', 'repliedBy']) out[k] = value(f[k]);
      return out;
    });
    return reply({ messages });
  } catch (error) {
    console.log('inbox error', String(error?.message || error));
    return reply({ error: 'Boîte de réception indisponible pour le moment.' }, 503);
  }
}
