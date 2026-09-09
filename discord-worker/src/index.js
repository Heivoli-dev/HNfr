const SITE_ORIGIN = "https://heivoli-network.fr";
const COOKIE_NAME = "heivoli_discord_state";
const FIREBASE_AUDIENCE = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";

function getReturnPath(value) {
  return value === "tickets" ? "/tickets.html" : "/profil.html";
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function encodeJson(value) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function privateKeyToBytes(privateKey) {
  const body = privateKey.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function readCookie(request, name) {
  const item = (request.headers.get("Cookie") || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}

function sessionCookie(value) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

async function createFirebaseCustomToken(serviceAccount, uid, claims) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const payload = encodeJson({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: FIREBASE_AUDIENCE,
    iat: now,
    exp: now + 3600,
    uid,
    claims,
  });
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyToBytes(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

function error(message, status = 500) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
}

async function login(request, env) {
  if (!env.DISCORD_CLIENT_SECRET || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID || !env.FIREBASE_SERVICE_ACCOUNT) {
    return error("La connexion Discord est en cours de configuration.");
  }
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const requestUrl = new URL(request.url);
  const returnPath = getReturnPath(requestUrl.searchParams.get("returnTo"));
  const callbackUrl = `${requestUrl.origin}/callback`;
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: callbackUrl,
    scope: "identify email guilds.join",
    state,
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://discord.com/oauth2/authorize?${params}`,
      "Set-Cookie": sessionCookie(`${state}.${returnPath}`),
    },
  });
}

async function callback(request, env) {
  const requestUrl = new URL(request.url);
  const saved = readCookie(request, COOKIE_NAME);
  const separator = saved.indexOf(".");
  const savedState = separator > 0 ? saved.slice(0, separator) : "";
  const returnPath = separator > 0 ? saved.slice(separator + 1) : "/profil.html";
  if (!requestUrl.searchParams.get("code") || !savedState || requestUrl.searchParams.get("state") !== savedState) {
    return new Response("La demande de connexion Discord a expiré. Recommence depuis le site.", { status: 400, headers: { "Set-Cookie": clearCookie() } });
  }

  try {
    const callbackUrl = `${requestUrl.origin}/callback`;
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${env.DISCORD_CLIENT_ID}:${env.DISCORD_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code: requestUrl.searchParams.get("code"), redirect_uri: callbackUrl }),
    });
    if (!tokenResponse.ok) throw new Error("Discord a refusé la connexion.");
    const tokens = await tokenResponse.json();
    const userResponse = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!userResponse.ok) throw new Error("Profil Discord indisponible.");
    const user = await userResponse.json();
    const joinResponse = await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}`, {
      method: "PUT",
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: tokens.access_token }),
    });
    if (!joinResponse.ok && joinResponse.status !== 204) throw new Error("Ajout au serveur Discord refusé.");

    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const name = user.global_name || user.username || "Membre Heivoli";
    const avatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256` : "";
    const customToken = await createFirebaseCustomToken(serviceAccount, `discord-${user.id}`, {
      discordId: user.id,
      discordName: name.slice(0, 120),
      discordAvatar: avatar,
    });
    const target = new URL(`${SITE_ORIGIN}${returnPath}`);
    target.hash = `discordToken=${encodeURIComponent(customToken)}`;
    return new Response(null, { status: 302, headers: { Location: target.toString(), "Set-Cookie": clearCookie() } });
  } catch {
    return new Response("La connexion Discord n’a pas pu aboutir. Réessaie dans un instant.", { status: 500, headers: { "Set-Cookie": clearCookie() } });
  }
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (request.method === "GET" && pathname === "/login") return login(request, env);
    if (request.method === "GET" && pathname === "/callback") return callback(request, env);
    return new Response("Heivoli Discord authentication service", { status: 200 });
  },
};
