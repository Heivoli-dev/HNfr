// Chargé sur toutes les pages : pastille de notifications sur l'onglet Tickets
// et mise à jour du badge de membre (rôle, date d'arrivée) utilisé par les badges.
import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { Timestamp, collection, doc, getDoc, getFirestore, onSnapshot, query, serverTimestamp, setDoc, where } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";

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
  if (store.get(cacheKey) === `${role}|${day}`) return;
  try {
    const ref = doc(db, "members", user.uid);
    const current = await getDoc(ref);
    const data = current.exists() ? current.data() : null;
    if (!data || data.role !== role) {
      const launch = new Date("2026-01-01T00:00:00Z").getTime();
      const created = Date.parse(user.metadata?.creationTime || "") || Date.now();
      const since = data?.since ?? Timestamp.fromMillis(Math.min(Date.now() - 60000, Math.max(launch, created)));
      await setDoc(ref, { role, since, updatedAt: serverTimestamp() });
    }
    store.set(cacheKey, `${role}|${day}`);
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

onAuthStateChanged(auth, async user => {
  stopTickets?.();
  stopTickets = null;
  setBadge(0);
  if (!user) return;
  const role = await accountRole(user);
  if (auth.currentUser !== user) return;
  syncMember(user, role);
  watchTickets(user, role);
});
