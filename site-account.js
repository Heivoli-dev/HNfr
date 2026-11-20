// Chargé sur toutes les pages : pastille de notifications sur l'onglet Tickets
// et mise à jour du badge de membre (rôle, date d'arrivée) utilisé par les badges.
import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { Timestamp, collection, doc, getDoc, getFirestore, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";
import { RULES, RULES_VERSION } from "./rules-data.js?v=1";

const firebaseConfig = {
  apiKey: "AIzaSyDKXFI0a1H1lnWIRI-qXor45RQ5R5qAMJk",
  authDomain: "heivoli-network-408f3.firebaseapp.com",
  projectId: "heivoli-network-408f3",
  storageBucket: "heivoli-network-408f3.firebasestorage.app",
  messagingSenderId: "761703200496",
  appId: "1:761703200496:web:967e8fd7330db657ca7435",
};
const CREATOR_EMAIL = "heivolipro@gmail.com";
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ } },
};
const sound = name => document.dispatchEvent(new CustomEvent("hn-sound", { detail: name }));
const millis = value => value?.toMillis?.() ?? 0;
const onTicketsPage = /\/tickets(\.html)?$/.test(location.pathname);

async function accountRole(user) {
  const claims = (await user.getIdTokenResult()).claims;
  const email = user.emailVerified && !claims.discordId ? (user.email || "").toLowerCase() : "";
  if (!email) return "member";
  if (email === CREATOR_EMAIL) return "founder";
  try { return (await getDoc(doc(db, "admins", email))).exists() ? "moderator" : "member"; } catch { return "member"; }
}

// ---------- Badge de membre ----------
async function syncMember(user, role) {
  const day = new Date().toISOString().slice(0, 10);
  const cacheKey = `hn-member:${user.uid}`;
  if (store.get(cacheKey) === `${role}|${day}|2`) return;
  try {
    const ref = doc(db, "members", user.uid);
    const [current, profile, claims] = await Promise.all([
      getDoc(ref),
      getDoc(doc(db, "profiles", user.uid)).catch(() => null),
      user.getIdTokenResult().then(result => result.claims).catch(() => ({})),
    ]);
    const data = current.exists() ? current.data() : null;
    // Pseudo utilisé par la recherche de membres de la modération.
    const name = String((profile?.exists() && profile.data().displayName) || claims.discordName || user.displayName || "Membre").slice(0, 120);
    if (!data || data.role !== role || data.name !== name) {
      const launch = new Date("2026-01-01T00:00:00Z").getTime();
      const created = Date.parse(user.metadata?.creationTime || "") || Date.now();
      const since = data?.since ?? Timestamp.fromMillis(Math.min(Date.now() - 60000, Math.max(launch, created)));
      await setDoc(ref, { ...(data?.rulesVersion ? { rulesVersion: data.rulesVersion, rulesAcceptedAt: data.rulesAcceptedAt } : {}), role, since, name, updatedAt: serverTimestamp() });
    }
    store.set(cacheKey, `${role}|${day}|2`);
  } catch { /* réessayé à la prochaine visite */ }
}

// ---------- Notifications de tickets ----------
const ticketLinks = () => [...document.querySelectorAll('.site-nav a[href="tickets.html"]')];
function setBadge(count, label) {
  for (const link of ticketLinks()) {
    let dot = link.querySelector(".nav-dot");
    if (!count) { dot?.remove(); link.removeAttribute("aria-description"); continue; }
    if (!dot) { dot = document.createElement("span"); dot.className = "nav-dot"; link.append(dot); }
    dot.textContent = count > 9 ? "9+" : String(count);
    link.setAttribute("aria-description", label);
  }
}

let toast;
function showToast(ticket) {
  if (onTicketsPage || toast) return;
  const key = `hn-notified:${ticket.id}:${millis(ticket.lastReplyAt)}`;
  if (store.get(key)) return;
  store.set(key, "1");
  toast = document.createElement("div");
  toast.className = "notif-toast";
  toast.setAttribute("role", "status");
  const orb = document.createElement("span");
  orb.className = "notif-orb";
  orb.setAttribute("aria-hidden", "true");
  orb.textContent = "✉";
  const text = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = "La modération t’a répondu";
  const subject = document.createElement("p");
  subject.textContent = `« ${ticket.subject || "Ton ticket"} »`;
  text.append(title, subject);
  const read = document.createElement("a");
  read.href = "tickets.html";
  read.textContent = "Lire";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "notif-close";
  close.setAttribute("aria-label", "Fermer la notification");
  close.textContent = "×";
  close.addEventListener("click", () => { toast.remove(); toast = null; });
  toast.append(orb, text, read, close);
  document.body.append(toast);
  sound("open");
}

let stopTickets = null;
function watchTickets(user, role) {
  const moderator = role !== "member";
  const ticketsQuery = moderator
    ? query(collection(db, "tickets"), where("status", "==", "open"))
    : query(collection(db, "tickets"), where("creatorId", "==", user.uid));
  stopTickets = onSnapshot(ticketsQuery, snapshot => {
    const tickets = snapshot.docs.map(item => ({ ...item.data({ serverTimestamps: "estimate" }), id: item.id }));
    if (moderator) {
      const waiting = tickets.filter(ticket => ticket.lastReplyBy === "member");
      setBadge(waiting.length, `${waiting.length} ticket(s) en attente de réponse`);
      return;
    }
    const unread = tickets.filter(ticket => ticket.lastReplyBy === "moderation" && millis(ticket.lastReplyAt) > millis(ticket.memberSeenAt));
    setBadge(unread.length, `${unread.length} nouvelle(s) réponse(s)`);
    unread.sort((a, b) => millis(b.lastReplyAt) - millis(a.lastReplyAt));
    if (unread[0]) showToast(unread[0]);
  }, () => setBadge(0));
}


// ---------- Écran de bannissement ----------
const onContestPage = onTicketsPage || /\/conditions(\.html)?$/.test(location.pathname);
let banScreen = null;
let banTimer = null;
function remaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400), h = Math.floor(total % 86400 / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
  return [d && `${d} j`, (d || h) && `${h} h`, `${m} min`, !d && `${s} s`].filter(Boolean).join(" ");
}
function hideBan() {
  clearInterval(banTimer);
  banScreen?.remove();
  banScreen = null;
  document.documentElement.classList.remove("ban-lock");
}
function showBan(ban) {
  hideBan();
  const until = ban.expiresAt?.toMillis?.() ?? null;
  banScreen = document.createElement("div");
  banScreen.className = onContestPage ? "ban-banner" : "ban-screen";
  banScreen.setAttribute("role", onContestPage ? "status" : "alertdialog");
  banScreen.setAttribute("aria-label", "Compte banni");
  const box = document.createElement("div");
  box.className = "ban-box";
  const orb = document.createElement("span");
  orb.className = "ban-orb";
  orb.setAttribute("aria-hidden", "true");
  orb.textContent = "⛔";
  const title = document.createElement("h2");
  title.textContent = "Ton compte est banni";
  const reason = document.createElement("p");
  reason.className = "ban-reason";
  reason.textContent = `Motif : ${ban.reason || "non précisé"}`;
  const time = document.createElement("p");
  time.className = "ban-time";
  const help = document.createElement("p");
  help.className = "ban-help";
  help.textContent = onContestPage
    ? "Tu peux ouvrir un ticket « Contestation » ci-dessous pour expliquer ta situation à la modération."
    : "Pendant ce temps, tu ne peux plus commenter, écrire de ticket ni modifier ton profil ou ta carte joueur. Si tu penses que c’est une erreur, tu peux contester la décision.";
  const actions = document.createElement("div");
  actions.className = "ban-actions";
  if (!onTicketsPage) {
    const contest = document.createElement("a");
    contest.className = "ban-primary";
    contest.href = "tickets.html";
    contest.textContent = "Contester la décision";
    actions.append(contest);
  }
  const rules = document.createElement("a");
  rules.className = "ban-secondary";
  rules.href = "conditions.html";
  rules.textContent = "Lire les règles";
  const logout = document.createElement("button");
  logout.type = "button";
  logout.className = "ban-secondary";
  logout.textContent = "Se déconnecter";
  logout.addEventListener("click", () => signOut(auth));
  actions.append(rules, logout);
  box.append(orb, title, reason, time, help, actions);
  banScreen.append(box);
  const header = document.querySelector(".site-header");
  if (onContestPage && header) header.after(banScreen); else document.body.append(banScreen);
  if (!onContestPage) document.documentElement.classList.add("ban-lock");
  const tick = () => {
    if (until === null) { time.textContent = "Bannissement définitif."; return; }
    const left = until - Date.now();
    if (left <= 0) { hideBan(); return; }
    time.textContent = `Fin du bannissement dans ${remaining(left)} (le ${new Date(until).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}).`;
  };
  tick();
  banTimer = setInterval(tick, 1000);
}
let stopBan = null;
function watchOwnBan(user, role) {
  if (role === "founder") return;
  stopBan = onSnapshot(doc(db, "bans", user.uid), snapshot => {
    const data = snapshot.data();
    const until = data?.expiresAt?.toMillis?.();
    if (snapshot.exists() && (data.expiresAt === null || until > Date.now())) showBan(data);
    else hideBan();
  }, () => {});
}

// ---------- Avertissements ----------
let warningBox = null;
function watchWarnings(user) {
  return onSnapshot(query(collection(db, "sanctions"), where("uid", "==", user.uid), where("type", "==", "warning")), snapshot => {
    const unseen = snapshot.docs
      .map(item => ({ id: item.id, ...item.data({ serverTimestamps: "estimate" }) }))
      .filter(item => !store.get(`hn-warning-seen:${item.id}`))
      .sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
    if (!unseen.length || warningBox) return;
    const warning = unseen[0];
    warningBox = document.createElement("div");
    warningBox.className = "ban-screen is-warning";
    warningBox.setAttribute("role", "alertdialog");
    warningBox.setAttribute("aria-label", "Avertissement de la modération");
    const box = document.createElement("div");
    box.className = "ban-box";
    const orb = document.createElement("span");
    orb.className = "ban-orb";
    orb.setAttribute("aria-hidden", "true");
    orb.textContent = "!";
    const title = document.createElement("h2");
    title.textContent = "Avertissement de la modération";
    const reason = document.createElement("p");
    reason.className = "ban-reason";
    reason.textContent = warning.reason;
    const help = document.createElement("p");
    help.className = "ban-help";
    help.textContent = "Ce n’est pas une sanction : ton compte fonctionne normalement. En cas de récidive, la modération peut bannir ton compte.";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "ban-primary";
    ok.textContent = "J’ai compris";
    ok.addEventListener("click", () => {
      store.set(`hn-warning-seen:${warning.id}`, "1");
      warningBox.remove();
      warningBox = null;
      document.documentElement.classList.remove("ban-lock");
    });
    const actions = document.createElement("div");
    actions.className = "ban-actions";
    const rules = document.createElement("a");
    rules.className = "ban-secondary";
    rules.href = "conditions.html";
    rules.textContent = "Lire les règles";
    actions.append(ok, rules);
    box.append(orb, title, reason, help, actions);
    warningBox.append(box);
    document.body.append(warningBox);
    document.documentElement.classList.add("ban-lock");
    sound("error");
  }, () => {});
}
let stopWarnings = null;

// ---------- Règles de la communauté à accepter (première connexion ou nouvelle version) ----------
let rulesBox = null;
const saveRules = user => updateDoc(doc(db, "members", user.uid), { rulesVersion: RULES_VERSION, rulesAcceptedAt: serverTimestamp(), updatedAt: serverTimestamp() });
async function checkRules(user, synced) {
  const key = `hn-rules:${user.uid}`;
  const pendingKey = `hn-rules-pending:${user.uid}`;
  if (store.get(key) === RULES_VERSION) return;
  await synced;
  if (store.get(pendingKey) === RULES_VERSION) {
    // Déjà acceptées sur cet appareil : on réessaie juste de l'enregistrer.
    try { await saveRules(user); store.set(key, RULES_VERSION); } catch { /* réessayé plus tard */ }
    return;
  }
  let data = null;
  try { data = (await getDoc(doc(db, "members", user.uid))).data() || null; } catch { return; }
  if (auth.currentUser !== user) return;
  if (data?.rulesVersion === RULES_VERSION) { store.set(key, RULES_VERSION); return; }
  if (!data || rulesBox) return; // la fiche membre est créée juste avant ; on réessaiera à la prochaine page
  rulesBox = document.createElement("div");
  rulesBox.className = "ban-screen rules-screen";
  rulesBox.setAttribute("role", "dialog");
  rulesBox.setAttribute("aria-modal", "true");
  rulesBox.setAttribute("aria-label", "Règles de la communauté");
  const box = document.createElement("div");
  box.className = "ban-box rules-box";
  const orb = document.createElement("span");
  orb.className = "ban-orb";
  orb.setAttribute("aria-hidden", "true");
  orb.textContent = "✦";
  const title = document.createElement("h2");
  title.textContent = data.rulesVersion ? "Les règles ont changé" : "Bienvenue dans la communauté !";
  const intro = document.createElement("p");
  intro.className = "ban-help";
  intro.textContent = data.rulesVersion
    ? "Prends une minute pour relire les règles de Heivoli Network, puis accepte-les pour continuer."
    : "Avant de commencer, voici les règles de Heivoli Network. Elles sont simples et permettent à tout le monde de se sentir bien.";
  const list = document.createElement("ol");
  list.className = "rules-mini";
  RULES.forEach(rule => {
    const item = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = rule.title;
    const text = document.createElement("span");
    text.textContent = rule.text;
    item.append(name, text);
    list.append(item);
  });
  const agree = document.createElement("label");
  agree.className = "rules-agree";
  const check = document.createElement("input");
  check.type = "checkbox";
  const agreeText = document.createElement("span");
  agreeText.append("J’ai lu et j’accepte les règles de la communauté et les ");
  const terms = document.createElement("a");
  terms.href = "conditions.html#conditions";
  terms.target = "_blank";
  terms.rel = "noopener";
  terms.textContent = "conditions d’utilisation";
  agreeText.append(terms, ".");
  agree.append(check, agreeText);
  const status = document.createElement("p");
  status.className = "rules-status";
  status.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "ban-actions";
  const accept = document.createElement("button");
  accept.type = "button";
  accept.className = "ban-primary";
  accept.textContent = "Rejoindre la communauté";
  accept.disabled = true;
  check.addEventListener("change", () => { accept.disabled = !check.checked; });
  const logout = document.createElement("button");
  logout.type = "button";
  logout.className = "ban-secondary";
  logout.textContent = "Refuser et me déconnecter";
  logout.addEventListener("click", () => signOut(auth));
  accept.addEventListener("click", async () => {
    accept.disabled = true;
    status.textContent = "Enregistrement…";
    try {
      try {
        await saveRules(user);
        store.set(key, RULES_VERSION);
      } catch (error) {
        if (error?.code !== "permission-denied") throw error;
        store.set(pendingKey, RULES_VERSION); // enregistré à la prochaine visite
      }
      rulesBox.remove();
      rulesBox = null;
      if (!document.querySelector(".ban-screen:not(.rules-screen)")) document.documentElement.classList.remove("ban-lock");
      sound("success");
    } catch {
      status.textContent = "Impossible d’enregistrer pour l’instant. Réessaie dans un instant.";
      accept.disabled = false;
    }
  });
  actions.append(accept, logout);
  box.append(orb, title, intro, list, agree, status, actions);
  rulesBox.append(box);
  document.body.append(rulesBox);
  document.documentElement.classList.add("ban-lock");
}
function hideRules() { rulesBox?.remove(); rulesBox = null; }

onAuthStateChanged(auth, async user => {
  stopTickets?.();
  stopTickets = null;
  stopBan?.();
  stopBan = null;
  stopWarnings?.();
  stopWarnings = null;
  hideBan();
  hideRules();
  setBadge(0);
  if (!user) return;
  const role = await accountRole(user);
  if (auth.currentUser !== user) return;
  const synced = syncMember(user, role);
  checkRules(user, synced);
  watchTickets(user, role);
  watchOwnBan(user, role);
  stopWarnings = watchWarnings(user);
});
