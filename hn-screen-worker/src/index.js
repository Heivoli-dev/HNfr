// Hn screen ! — partage des captures d'écran de la 3DS.
//
// POST /upload        corps = PNG 400 x 480 (écran du haut + écran du bas) envoyé par la console
//                     réponse {"id":"A7K2Q9XB","expires":…}
// GET  /i/<id>.png    l'image, pour la galerie https://heivoli-network.fr/s/?<id>
//
// Chaque capture ne peut être récupérée qu'une seule fois : elle est effacée du serveur dès
// que la galerie l'a chargée, et au plus tard 10 minutes après l'envoi si personne ne la scanne.
// Rien d'autre n'est enregistré (pas de compte, pas d'adresse IP en clair).

const SITE = "https://heivoli-network.fr";
const TTL = 10 * 60; // 10 minutes maximum sur le serveur
const MAX_BYTES = 1024 * 1024;
const PER_HOUR = 30;
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sans 0/O, 1/I/L
const ID_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

const baseHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Access-Control-Allow-Origin": SITE,
  Vary: "Origin",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...baseHeaders, "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store" },
  });
}

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function isScreenPng(buf) {
  const b = new Uint8Array(buf);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || sig.some((v, i) => b[i] !== v)) return false;
  if (String.fromCharCode(...b.subarray(12, 16)) !== "IHDR") return false;
  if (String.fromCharCode(...b.subarray(b.length - 8, b.length - 4)) !== "IEND") return false;
  const view = new DataView(buf);
  return view.getUint32(16) === 400 && view.getUint32(20) === 480;
}

// Compteur par heure, sur une empreinte de l'adresse IP (jamais l'adresse elle-même).
async function rateLimited(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "?";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`hn-screen:${ip}`));
  const key = `rl:${btoa(String.fromCharCode(...new Uint8Array(digest).subarray(0, 12)))}:${Math.floor(Date.now() / 3600000)}`;
  const n = Number((await env.SHOTS.get(key)) || 0);
  if (n >= PER_HOUR) return true;
  await env.SHOTS.put(key, String(n + 1), { expirationTtl: 3700 });
  return false;
}

async function upload(request, env) {
  if (!request.headers.get("X-HnScreen")) return json({ error: "Envoi réservé à l'appli Hn screen !" }, 403);
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_BYTES) return json({ error: "Image trop lourde." }, 413);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return json({ error: "Image trop lourde." }, 413);
  if (!isScreenPng(buf)) return json({ error: "Ce n'est pas une capture Hn screen !" }, 400);
  if (await rateLimited(request, env)) return json({ error: "Trop d'envois, réessaie dans une heure." }, 429);
  const id = newId(); // 31^8 possibilités : collision négligeable sur 10 min
  await env.SHOTS.put(`s:${id}`, buf, { expirationTtl: TTL });
  return json({ id, expires: Date.now() + TTL * 1000 });
}

async function image(id, env) {
  if (!ID_RE.test(id)) return json({ error: "Lien invalide." }, 404);
  const key = `s:${id}`;
  const data = await env.SHOTS.get(key, { type: "arrayBuffer" });
  if (!data) return json({ error: "Cette capture a déjà été récupérée ou a expiré." }, 404);
  await env.SHOTS.delete(key); // une seule récupération : la photo part sur l'appareil et quitte le serveur
  return new Response(data, {
    headers: {
      ...baseHeaders,
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...baseHeaders, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" },
      });
    }
    if (request.method === "POST" && url.pathname === "/upload") return upload(request, env);
    const m = url.pathname.match(/^\/i\/([A-Za-z0-9]+)\.png$/);
    if (request.method === "GET" && m) return image(m[1].toUpperCase(), env);
    if (request.method === "GET" && url.pathname === "/") return Response.redirect(`${SITE}/s/`, 302);
    return json({ error: "Introuvable." }, 404);
  },
};
