// Bind the OAuth result to the tab that initiated login. Never accept unsolicited tokens.
const LOGIN_KEY = "heivoli-discord-login";
export function beginDiscordLogin(loginUrl) {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  sessionStorage.setItem(LOGIN_KEY, JSON.stringify({ state, createdAt: Date.now() }));
  const target = new URL(loginUrl);
  target.searchParams.set("clientState", state);
  window.location.assign(target.href);
}

export function consumeDiscordToken() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has("discordToken")) return null;
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  let pending;
  try { pending = JSON.parse(sessionStorage.getItem(LOGIN_KEY)); } catch { /* Reject malformed state. */ }
  sessionStorage.removeItem(LOGIN_KEY);
  if (!pending || typeof pending.state !== "string" || !Number.isFinite(pending.createdAt)
    || pending.state !== params.get("clientState") || Date.now() < pending.createdAt
    || Date.now() - pending.createdAt > 600000) return null;
  return params.get("discordToken");
}
