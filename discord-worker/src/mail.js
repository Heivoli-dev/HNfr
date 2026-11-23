// E-mails automatiques de Heivoli Network, envoyés avec Brevo (clé dans le secret BREVO_API_KEY).
// Le site ne fait que signaler un évènement (« ce ticket a reçu une réponse ») : le Worker vérifie
// tout dans Firestore, choisit le destinataire lui-même et ne renvoie jamais deux fois le même mail.
import { API_KEY, PROJECT, ROOT, URL_ROOT, serviceToken } from './network.js';
import { autoReplyMail, newsMail, sanctionMail, ticketReplyMail, welcomeMail } from './mail-templates.js';

const SITE = 'https://heivoli-network.fr';
const WORKER = 'https://heivoli-discord-auth.heivoli-discord-auth.workers.dev';
const FOUNDER = 'heivolipro@gmail.com';
const FORWARD_TO = 'heivolipro@gmail.com';
const SENDERS = {
  contact: { name: 'Heivoli Network', email: 'contact@heivoli-network.fr' },
  news: { name: 'Heivoli Network', email: 'news@heivoli-network.fr' },
};
const DATASTORE = 'https://www.googleapis.com/auth/datastore';
const IDENTITY = 'https://www.googleapis.com/auth/identitytoolkit';

// ---------- Firestore (REST) ----------
function value(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(value);
  return null;
}
const fields = (doc) => doc?.fields ? Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, value(v)])) : null;
const str = (s) => ({ stringValue: String(s) });
const now = () => ({ timestampValue: new Date().toISOString() });

function firestore(env) {
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const call = async (path, options = {}) => {
    const token = await serviceToken(account, DATASTORE);
    const res = await fetch(`${URL_ROOT}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    if (res.status === 404 && !options.method) return null;
    if (!res.ok) { const body = await res.text(); const err = new Error(`firestore ${res.status} ${body.slice(0, 300)}`); err.status = res.status; err.body = body; throw err; }
    return res.json();
  };
  return {
    account,
    read: async (path) => fields(await call(`/${path}`)),
    commit: (writes) => call(':commit', { method: 'POST', body: JSON.stringify({ writes }) }),
    query: async (structuredQuery) => (await call(':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) }))
      .filter((row) => row.document).map((row) => ({ id: row.document.name.split('/').pop(), ...fields(row.document) })),
  };
}

// Réserve un envoi (mailLog/{id}) : échoue si ce mail est déjà parti.
async function claim(db, id, info) {
  try {
    await db.commit([{ update: { name: `${ROOT}/mailLog/${id}`, fields: { ...info, sentAt: now() } }, currentDocument: { exists: false } }]);
    return true;
  } catch (error) {
    // Seul « le document existe déjà » signifie « déjà envoyé » ; toute autre erreur est remontée.
    if (error.status === 409 || (error.status === 400 && /FAILED_PRECONDITION|ALREADY_EXISTS/.test(error.body || ''))) return false;
    throw error;
  }
}
const release = (db, id) => db.commit([{ delete: `${ROOT}/mailLog/${id}` }]).catch(() => {});

// Adresse e-mail vérifiée d'un ou plusieurs comptes (comptes Google ; les comptes Discord n'en ont pas).
async function accounts(env, account, uids) {
  if (!uids.length) return new Map();
  const token = await serviceToken(account, IDENTITY);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uids }),
  });
  if (!res.ok) throw new Error('identity lookup');
  const map = new Map();
  for (const user of (await res.json()).users || []) {
    if (user.email && user.emailVerified && !user.disabled) map.set(user.localId, { email: user.email, name: user.displayName || '' });
  }
  return map;
}

async function displayName(db, uid, fallback) {
  const profile = await db.read(`profiles/${uid}`).catch(() => null);
  const member = profile?.displayName ? null : await db.read(`members/${uid}`).catch(() => null);
  return String(profile?.displayName || member?.name || fallback || 'membre').slice(0, 60);
}

// ---------- Brevo ----------
async function brevo(env, payload) {
  if (!env.BREVO_API_KEY) throw new Error('BREVO_API_KEY manquante');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`brevo ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
const sendOne = (env, sender, to, mail, extra = {}) => brevo(env, {
  sender, to: [to], replyTo: SENDERS.contact, subject: mail.subject, htmlContent: mail.html, ...extra,
});

async function unsubscribeToken(account, uid) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(account.private_key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`unsubscribe:${uid}`)));
  return Array.from(sig.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- POST /api/mail ----------
export async function mailAPI(request, env) {
  const headers = { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': SITE, Vary: 'Origin' };
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (request.headers.get('Origin') !== SITE) return reply({ error: 'Origine refusée.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } });
  if (request.method !== 'POST') return reply({ error: 'Méthode refusée.' }, 405);
  try {
    const bearer = request.headers.get('Authorization') || '';
    if (!bearer.startsWith('Bearer ')) return reply({ error: 'Connecte-toi.' }, 401);
    const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: bearer.slice(7) }) });
    if (!lookup.ok) return reply({ error: 'Reconnecte-toi.' }, 401);
    const caller = (await lookup.json()).users?.[0];
    if (!caller?.localId || caller.disabled) return reply({ error: 'Compte indisponible.' }, 401);
    const text = await request.text();
    if (text.length > 1024) return reply({ error: 'Demande trop longue.' }, 413);
    const { type, id } = JSON.parse(text);
    const db = firestore(env);
    const founder = caller.emailVerified && caller.email === FOUNDER;
    const isAdmin = async () => founder || (caller.emailVerified && caller.email && !!await db.read(`admins/${encodeURIComponent(caller.email)}`));
    const recent = (iso, minutes) => iso && Date.now() - Date.parse(iso) < minutes * 60000;

    if (type === 'welcome') {
      const member = await db.read(`members/${caller.localId}`);
      if (!member?.rulesVersion) return reply({ skipped: 'rules' });
      if (!caller.email || !caller.emailVerified) return reply({ skipped: 'no-email' });
      if (!await claim(db, `welcome-${caller.localId}`, { type: str('welcome'), uid: str(caller.localId) })) return reply({ skipped: 'sent' });
      const name = await displayName(db, caller.localId, caller.displayName);
      try { await sendOne(env, SENDERS.contact, { email: caller.email, name }, welcomeMail({ name })); }
      catch (error) { await release(db, `welcome-${caller.localId}`); throw error; }
      return reply({ sent: true });
    }

    if (type === 'ticket') {
      if (!await isAdmin()) return reply({ error: 'Réservé à la modération.' }, 403);
      const [ticketId, messageId] = String(id || '').split('/');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(ticketId || '') || !/^[A-Za-z0-9_-]{1,128}$/.test(messageId || '')) return reply({ error: 'Ticket invalide.' }, 400);
      const ticket = await db.read(`tickets/${ticketId}`);
      const message = await db.read(`tickets/${ticketId}/messages/${messageId}`);
      if (!ticket || !message || !message.authorIsModerator || message.authorId !== caller.localId || !recent(message.createdAt, 15)) return reply({ error: 'Message introuvable.' }, 404);
      if (ticket.creatorId === caller.localId) return reply({ skipped: 'self' });
      const to = (await accounts(env, db.account, [ticket.creatorId])).get(ticket.creatorId);
      if (!to) return reply({ skipped: 'no-email' });
      const logId = `ticket-${ticketId}-${messageId}`;
      if (!await claim(db, logId, { type: str('ticket'), uid: str(ticket.creatorId) })) return reply({ skipped: 'sent' });
      const name = await displayName(db, ticket.creatorId, ticket.creatorName);
      try { await sendOne(env, SENDERS.contact, { email: to.email, name }, ticketReplyMail({ name, subject: ticket.subject, ticketId, message: message.text })); }
      catch (error) { await release(db, logId); throw error; }
      return reply({ sent: true });
    }

    if (type === 'sanction') {
      if (!await isAdmin()) return reply({ error: 'Réservé à la modération.' }, 403);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id || '')) return reply({ error: 'Sanction invalide.' }, 400);
      const sanction = await db.read(`sanctions/${id}`);
      if (!sanction || !['warning', 'ban'].includes(sanction.type) || sanction.createdBy !== caller.localId || !recent(sanction.createdAt, 15)) return reply({ error: 'Sanction introuvable.' }, 404);
      const to = (await accounts(env, db.account, [sanction.uid])).get(sanction.uid);
      if (!to) return reply({ skipped: 'no-email' });
      if (!await claim(db, `sanction-${id}`, { type: str('sanction'), uid: str(sanction.uid) })) return reply({ skipped: 'sent' });
      const name = await displayName(db, sanction.uid, sanction.name || to.name);
      try { await sendOne(env, SENDERS.contact, { email: to.email, name }, sanctionMail({ name, type: sanction.type, reason: sanction.reason, until: sanction.expiresAt })); }
      catch (error) { await release(db, `sanction-${id}`); throw error; }
      return reply({ sent: true });
    }

    if (type === 'news') {
      if (!founder) return reply({ error: 'Réservé au fondateur.' }, 403);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id || '')) return reply({ error: 'Annonce invalide.' }, 400);
      const announcement = await db.read(`announcements/${id}`);
      if (!announcement || !recent(announcement.createdAt, 60 * 24)) return reply({ error: 'Annonce introuvable.' }, 404);
      if (!await claim(db, `news-${id}`, { type: str('news'), uid: str(caller.localId) })) return reply({ skipped: 'sent' });
      try {
        const subscribers = await db.query({ from: [{ collectionId: 'mailPrefs' }], where: { fieldFilter: { field: { fieldPath: 'news' }, op: 'EQUAL', value: { booleanValue: true } } }, limit: 280 });
        let sent = 0;
        for (let i = 0; i < subscribers.length; i += 100) {
          const chunk = subscribers.slice(i, i + 100).map((s) => s.id);
          const emails = await accounts(env, db.account, chunk);
          const versions = [];
          for (const uid of chunk) {
            const to = emails.get(uid);
            if (!to) continue;
            const unsubscribeUrl = `${WORKER}/api/unsubscribe?u=${encodeURIComponent(uid)}&t=${await unsubscribeToken(db.account, uid)}`;
            const mail = newsMail({ name: to.name || 'membre', type: announcement.type, title: announcement.title, text: announcement.text, unsubscribeUrl });
            versions.push({ to: [{ email: to.email, name: to.name || undefined }], subject: mail.subject, htmlContent: mail.html, headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
          }
          if (!versions.length) continue;
          const first = versions[0];
          await brevo(env, { sender: SENDERS.news, replyTo: SENDERS.contact, subject: first.subject, htmlContent: first.htmlContent, messageVersions: versions });
          sent += versions.length;
        }
        return reply({ sent });
      } catch (error) { await release(db, `news-${id}`); throw error; }
    }

    return reply({ error: 'Type de mail inconnu.' }, 400);
  } catch (error) {
    console.log('mail error', String(error?.message || error));
    return reply({ error: 'Envoi du mail indisponible pour le moment.' }, 503);
  }
}

// ---------- /api/unsubscribe (lien dans les newsletters) ----------
const page = (title, text) => new Response(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#efedf9;font:15px/1.6 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#282639">
<div style="max-width:440px;margin:20px;padding:32px;border-radius:28px;background:#fff;box-shadow:0 18px 44px rgba(50,39,101,.14);text-align:center">
<h1 style="margin:0 0 10px;font-size:24px">${title}</h1>${text}</div></body></html>`, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });

export async function unsubscribe(request, env) {
  const url = new URL(request.url);
  const uid = url.searchParams.get('u') || '';
  const token = url.searchParams.get('t') || '';
  const db = firestore(env);
  if (!/^[A-Za-z0-9_:-]{1,128}$/.test(uid) || token !== await unsubscribeToken(db.account, uid)) return page('Lien invalide', '<p>Ce lien de désabonnement n’est pas valide.</p>');
  if (request.method === 'GET') {
    return page('Se désabonner ?', `<p>Tu ne recevras plus les nouveautés de Heivoli Network par mail.</p>
<form method="post"><button style="margin-top:8px;padding:13px 26px;border:0;border-radius:999px;background:#4a3dd0;color:#fff;font:700 15px/1 inherit;cursor:pointer">Me désabonner</button></form>`);
  }
  await db.commit([{ update: { name: `${ROOT}/mailPrefs/${uid}`, fields: { news: { booleanValue: false }, updatedAt: now() } }, updateMask: { fieldPaths: ['news', 'updatedAt'] } }]);
  return page('C’est fait', `<p>Tu es désabonné des nouveautés. Tu peux te réabonner à tout moment depuis <a href="${SITE}/profil.html" style="color:#5040b7">ton profil</a>.</p>`);
}

// ---------- Mails reçus sur contact@ : transfert vers Gmail + réponse automatique ----------
export const FORWARD_ADDRESS = FORWARD_TO;

/** Réponse automatique (une par expéditeur et par jour) aux mails reçus sur contact@. */
export async function autoReply(message, env) {
  try {
    const from = String(message.from || '').toLowerCase();
    const auto = (message.headers.get('auto-submitted') || 'no').toLowerCase();
    const precedence = (message.headers.get('precedence') || '').toLowerCase();
    const skip = auto !== 'no' ? 'auto-submitted' : /bulk|list|junk/.test(precedence) ? 'precedence' : message.headers.get('list-id') ? 'list'
      : /(no-?reply|mailer-daemon|postmaster|bounce)/.test(from) ? 'robot' : from.endsWith('@heivoli-network.fr') ? 'own-domain'
      : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from) ? 'bad-from' : '';
    if (skip) { console.log('autoreply skipped', skip, from.replace(/^[^@]{0,3}[^@]*/, '***')); return; }
    const db = firestore(env);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(from))).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
    const day = new Date().toISOString().slice(0, 10);
    if (!await claim(db, `auto-${digest}-${day}`, { type: str('autoreply') })) { console.log('autoreply skipped', 'already-replied-today'); return; } // une réponse par expéditeur et par jour
    const subject = String(message.headers.get('subject') || '').replace(/[\r\n]+/g, ' ').slice(0, 120);
    const mail = autoReplyMail({ subject });
    try { await brevo(env, { sender: SENDERS.contact, to: [{ email: from }], subject: mail.subject, htmlContent: mail.html, headers: { 'Auto-Submitted': 'auto-replied' } }); }
    catch (error) { await release(db, `auto-${digest}-${day}`); throw error; }
    console.log('autoreply sent');
  } catch (error) {
    console.log('autoreply error', String(error?.message || error));
  }
}
