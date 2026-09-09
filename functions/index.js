const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { onRequest } = require("firebase-functions/v2/https");
const { defineJsonSecret } = require("firebase-functions/params");

initializeApp();

const discordOAuth = defineJsonSecret("DISCORD_OAUTH");
const SITE_ORIGIN = "https://heivoli-network.fr";
const CALLBACK_URL = "https://europe-west1-heivoli-network-408f3.cloudfunctions.net/discordCallback";
const STATE_COOKIE = "heivoli_discord_state";

function getConfig() {
  const config = discordOAuth.value();
  if (!config?.clientId || !config?.clientSecret) throw new Error("Configuration Discord absente.");
  return config;
}

function cookieOptions() {
  return { httpOnly: true, secure: true, sameSite: "lax", maxAge: 10 * 60 * 1000, path: "/" };
}

function getReturnPath(value) {
  return value === "tickets" ? "/tickets.html" : "/profil.html";
}

function readCookie(req, name) {
  const item = (req.headers.cookie || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}

exports.discordLogin = onRequest({ region: "europe-west1", secrets: [discordOAuth] }, (req, res) => {
  try {
    const { clientId } = getConfig();
    const state = crypto.randomBytes(32).toString("hex");
    const returnPath = getReturnPath(req.query.returnTo);
    res.cookie(STATE_COOKIE, `${state}.${returnPath}`, cookieOptions());
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: CALLBACK_URL,
      scope: "identify email",
      state,
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
  } catch {
    res.status(500).send("La connexion Discord est indisponible pour le moment.");
  }
});

exports.discordCallback = onRequest({ region: "europe-west1", secrets: [discordOAuth] }, async (req, res) => {
  const saved = readCookie(req, STATE_COOKIE);
  const separator = saved.indexOf(".");
  const savedState = separator > 0 ? saved.slice(0, separator) : "";
  const returnPath = separator > 0 ? saved.slice(separator + 1) : "/profil.html";
  res.clearCookie(STATE_COOKIE, { path: "/" });
  if (!req.query.code || !savedState || req.query.state !== savedState) {
    res.status(400).send("La demande de connexion Discord a expiré. Recommence depuis le site.");
    return;
  }

  try {
    const { clientId, clientSecret } = getConfig();
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code: req.query.code, redirect_uri: CALLBACK_URL }),
    });
    if (!tokenResponse.ok) throw new Error("Échange Discord refusé.");
    const tokens = await tokenResponse.json();
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userResponse.ok) throw new Error("Profil Discord indisponible.");
    const user = await userResponse.json();
    const name = user.global_name || user.username || "Membre Heivoli";
    const avatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256` : "";
    const customToken = await getAuth().createCustomToken(`discord-${user.id}`, {
      discordId: user.id,
      discordName: name.slice(0, 120),
      discordAvatar: avatar,
    });
    const target = new URL(`${SITE_ORIGIN}${returnPath}`);
    target.hash = `discordToken=${encodeURIComponent(customToken)}`;
    res.redirect(target.toString());
  } catch {
    res.status(500).send("La connexion Discord n’a pas pu aboutir. Réessaie dans un instant.");
  }
});
