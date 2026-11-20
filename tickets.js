import { beginDiscordLogin, consumeDiscordToken } from "./security.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithCustomToken, signInWithPopup, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { setupGoogleLogin } from "./google-login.js";
import { watchBan } from './ban-status.js';
import { authorizeWrite } from './network-access.js';
import { collection, doc, getDoc, getDocs, getFirestore, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";

const CREATOR_EMAIL = "heivolipro@gmail.com";
const DISCORD_LOGIN_URL = "https://heivoli-discord-auth.heivoli-discord-auth.workers.dev/login?returnTo=tickets";
const firebaseConfig = {
  apiKey: "AIzaSyDKXFI0a1H1lnWIRI-qXor45RQ5R5qAMJk",
  authDomain: "heivoli-network-408f3.firebaseapp.com",
  projectId: "heivoli-network-408f3",
  storageBucket: "heivoli-network-408f3.firebasestorage.app",
  messagingSenderId: "761703200496",
  appId: "1:761703200496:web:967e8fd7330db657ca7435",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const locked = document.querySelector("#tickets-locked");
const content = document.querySelector("#tickets-content");
const googleButton = document.querySelector("#google-login");
const discordButton = document.querySelector("#discord-login");
const authStatus = document.querySelector("#auth-status");
const ticketForm = document.querySelector("#ticket-form");
const ticketCreateStatus = document.querySelector("#ticket-create-status");
const ticketList = document.querySelector("#ticket-list");
const ticketListTitle = document.querySelector("#ticket-list-title");
const ticketListNote = document.querySelector("#ticket-list-note");
const emptyConversation = document.querySelector("#conversation-empty");
const conversationContent = document.querySelector("#conversation-content");
const conversationCategory = document.querySelector("#conversation-category");
const conversationSubject = document.querySelector("#conversation-subject");
const conversationStatus = document.querySelector("#conversation-status");
const closeTicket = document.querySelector("#close-ticket");
const messageList = document.querySelector("#message-list");
const messageForm = document.querySelector("#message-form");
const messageText = document.querySelector("#message-text");
const messageSubmit = document.querySelector("#message-submit");
const messageStatus = document.querySelector("#message-status");
const moderatorBadge = document.querySelector("#moderator-badge");
const reopenTicket = document.querySelector("#reopen-ticket");
const deleteTicket = document.querySelector("#delete-ticket");
const banAuthor = document.querySelector("#ban-author");
const conversationMeta = document.querySelector("#conversation-meta");
const quickReplies = document.querySelector("#quick-replies");
const messageCount = document.querySelector("#message-count");
const firstMessage = document.querySelector("#ticket-first-message");
const firstMessageCount = document.querySelector("#first-message-count");
const categorySelect = document.querySelector("#ticket-category");
const categoryHint = document.querySelector("#category-hint");
const newTicket = document.querySelector("#new-ticket");
const ticketsTitle = document.querySelector("#tickets-title");
const ticketHowto = document.querySelector("#ticket-howto");
const modStats = document.querySelector("#mod-stats");
const ticketSearch = document.querySelector("#ticket-search");
const categoryFilter = document.querySelector("#ticket-category-filter");
const filterChips = [...document.querySelectorAll(".filter-chip")];
const sound = name => document.dispatchEvent(new CustomEvent("hn-sound", { detail: name }));
const CATEGORY_HINTS = {
  Question: "Une question sur le serveur, le site ou un logiciel.",
  Signalement: "Signale un membre, un message ou un contenu. Donne le pseudo, le salon, la date et une capture si possible.",
  Partenariat: "Propose une collaboration ou un partenariat avec Heivoli Network.",
  Autre: "Tout ce qui ne rentre pas dans les autres catégories.",
};

let currentUser = null;
let isModerator = false;
let selectedTicket = null;
let stopTickets = null;
let stopMessages = null;
let stopBan = null, blocked = true;
const banNotice = document.createElement('p'); banNotice.className = 'auth-status'; banNotice.setAttribute('role', 'status');
ticketForm.before(banNotice);

function formatDate(timestamp) {
  if (!timestamp?.toDate) return "À l’instant";
  return timestamp.toDate().toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function finishDiscordLogin() {
  const customToken = consumeDiscordToken();
  if (!customToken) return;
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  authStatus.textContent = "Connexion Discord en cours…";
  try {
    const credential = await signInWithCustomToken(auth, customToken);
    const claims = (await credential.user.getIdTokenResult(true)).claims;
    await updateProfile(credential.user, {
      displayName: claims.discordName || "Membre Heivoli",
      photoURL: claims.discordAvatar || null,
    });
    window.location.reload();
  } catch {
    authStatus.textContent = "La connexion Discord n’a pas pu aboutir. Réessaie dans un instant.";
  }
}

function describeTicket(ticket, lastFromModeration) {
  if (ticket.status === "closed") return { text: "Ticket fermé · Cette discussion est terminée. Si tu as encore besoin d’aide, ouvre un nouveau ticket.", tone: "is-closed" };
  if (lastFromModeration === undefined) return { text: "Ticket ouvert · Écris le premier message pour expliquer ta demande.", tone: "is-waiting" };
  if (isModerator) return lastFromModeration
    ? { text: "Ticket ouvert · Réponse envoyée, en attente du membre.", tone: "is-answered" }
    : { text: "Ticket ouvert · Le membre attend une réponse de la modération.", tone: "is-waiting" };
  return lastFromModeration
    ? { text: "Ticket ouvert · La modération t’a répondu. Tu peux continuer la discussion ci-dessous.", tone: "is-answered" }
    : { text: "Ticket ouvert · Ta demande est bien reçue, la modération va te répondre ici.", tone: "is-waiting" };
}

function updateConversationHeader(ticket, lastFromModeration) {
  conversationCategory.replaceChildren();
  conversationCategory.append(document.createElement("span"), document.createTextNode(` ${ticket.category || "Ticket"}`));
  conversationSubject.textContent = ticket.subject || "Ticket";
  const opened = ticket.createdAt?.toDate ? `ouvert le ${formatDate(ticket.createdAt)}` : "ouvert à l’instant";
  const who = isModerator ? `Par ${ticket.creatorName || "Membre"}${ticket.creatorEmail ? ` (${ticket.creatorEmail})` : ""} · ` : "";
  conversationMeta.textContent = `${who}${opened}`;
  const isOpen = ticket.status !== "closed";
  const state = describeTicket(ticket, lastFromModeration);
  conversationStatus.textContent = state.text;
  conversationStatus.className = `ticket-state ${state.tone}`;
  closeTicket.hidden = !isModerator || !isOpen;
  reopenTicket.hidden = !isModerator || isOpen;
  deleteTicket.hidden = !isModerator;
  const canBan = isModerator && ticket.creatorId && ticket.creatorId !== currentUser?.uid;
  banAuthor.hidden = !canBan;
  if (canBan) banAuthor.href = `admin.html?ban=${encodeURIComponent(ticket.creatorId)}`;
  quickReplies.hidden = !isModerator || !isOpen;
  messageText.disabled = !isOpen || blocked;
  messageSubmit.disabled = !isOpen || blocked;
  messageText.placeholder = isOpen ? (isModerator ? "Réponds au membre…" : "Écris ton message…") : "Ce ticket est fermé.";
}

const seenRequests = new Map();
function markSeen(ticket) {
  if (!ticket || isModerator || ticket.creatorId !== currentUser?.uid) return;
  const lastReply = ticket.lastReplyAt?.toMillis?.() ?? 0;
  const seen = ticket.memberSeenAt?.toMillis?.() ?? 0;
  if (ticket.lastReplyBy !== "moderation" || lastReply <= seen || seenRequests.get(ticket.id) === lastReply) return;
  seenRequests.set(ticket.id, lastReply);
  updateDoc(doc(db, "tickets", ticket.id), { memberSeenAt: serverTimestamp() }).catch(() => seenRequests.delete(ticket.id));
}

function setSelectedTicket(ticket) {
  const sameTicket = Boolean(ticket && selectedTicket?.id === ticket.id && stopMessages);
  selectedTicket = ticket;
  emptyConversation.hidden = Boolean(ticket);
  conversationContent.hidden = !ticket;
  markSeen(ticket);
  if (sameTicket) { updateConversationHeader(ticket, selectedTicket.lastFromModeration); return; }
  if (stopMessages) stopMessages();
  stopMessages = null;
  if (!ticket) return;
  updateConversationHeader(ticket);
  messageList.replaceChildren();
  messageStatus.textContent = "";

  stopMessages = onSnapshot(query(collection(db, "tickets", ticket.id, "messages"), orderBy("createdAt", "asc")), (snapshot) => {
    messageList.replaceChildren();
    if (snapshot.empty) {
      const empty = document.createElement("p");
      empty.className = "messages-empty";
      empty.textContent = isModerator ? "Aucun message pour l’instant." : "Explique ta demande en envoyant le premier message.";
      messageList.append(empty);
      if (selectedTicket?.id === ticket.id) { selectedTicket.lastFromModeration = undefined; updateConversationHeader(selectedTicket); }
      return;
    }
    let lastFromModeration;
    snapshot.forEach((item) => {
      const data = item.data();
      const article = document.createElement("article");
      const mine = data.authorId === currentUser?.uid;
      article.className = `message${mine ? " is-mine" : ""}${data.authorIsModerator ? " is-moderation" : ""}`;
      const meta = document.createElement("p");
      meta.className = "message-meta";
      const name = document.createElement("strong");
      name.textContent = mine ? "Toi" : (data.authorName || "Modération");
      meta.append(name);
      if (data.authorIsModerator) {
        const badge = document.createElement("span");
        badge.className = "message-badge";
        badge.textContent = "Modération";
        meta.append(badge);
      }
      const time = document.createElement("time");
      time.textContent = formatDate(data.createdAt);
      meta.append(time);
      const body = document.createElement("p");
      body.className = "message-body";
      body.textContent = data.text || "";
      article.append(meta, body);
      messageList.append(article);
      lastFromModeration = Boolean(data.authorIsModerator);
    });
    if (selectedTicket?.id === ticket.id) { selectedTicket.lastFromModeration = lastFromModeration; updateConversationHeader(selectedTicket, lastFromModeration); }
    messageList.scrollTop = messageList.scrollHeight;
  }, () => {
    messageStatus.textContent = "Impossible de charger cette discussion.";
  });
}

function renderTickets(snapshot) {
  if (snapshot.empty) {
    allTickets = [];
    drawTicketList();
    setSelectedTicket(null);
    return;
  }
  allTickets = snapshot.docs.map(item => ({ ...item.data({ serverTimestamps: "estimate" }), id: item.id }));
  allTickets.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0) || a.id.localeCompare(b.id));
  drawTicketList();
  const matchingSelected = allTickets.find(ticket => ticket.id === selectedTicket?.id);
  if (matchingSelected) setSelectedTicket({ ...matchingSelected, lastFromModeration: selectedTicket.lastFromModeration });
}

let allTickets = [];
let ticketFilter = "open";
let ticketSearchText = "";
let ticketCategoryFilter = "";

function ticketDate(timestamp) {
  if (!timestamp?.toDate) return "";
  return timestamp.toDate().toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const millis = value => value?.toMillis?.() ?? 0;
function ticketUnread(ticket) {
  return !isModerator && ticket.lastReplyBy === "moderation" && millis(ticket.lastReplyAt) > millis(ticket.memberSeenAt);
}
function ticketWaiting(ticket) {
  return isModerator && ticket.status !== "closed" && ticket.lastReplyBy === "member";
}

function drawTicketList() {
  ticketList.replaceChildren();
  const counts = { open: 0, closed: 0, all: allTickets.length, reports: 0, waiting: 0, unread: 0 };
  for (const ticket of allTickets) {
    if (ticket.status === "closed") counts.closed++; else counts.open++;
    if (ticket.status !== "closed" && ticket.category === "Signalement") counts.reports++;
    if (ticketWaiting(ticket)) counts.waiting++;
    if (ticketUnread(ticket)) counts.unread++;
  }
  if (typeof updateTicketCounts === "function") updateTicketCounts(counts);
  const search = ticketSearchText.trim().toLowerCase();
  const visible = allTickets.filter(ticket =>
    (ticketFilter === "all" || (ticketFilter === "closed") === (ticket.status === "closed"))
    && (!ticketCategoryFilter || ticket.category === ticketCategoryFilter)
    && (!search || [ticket.subject, ticket.creatorName, ticket.creatorEmail].some(value => String(value || "").toLowerCase().includes(search))));
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "tickets-empty";
    empty.textContent = !allTickets.length
      ? (isModerator ? "Aucun ticket pour l’instant." : "Tu n’as pas encore ouvert de ticket. Utilise le formulaire ci-dessus.")
      : "Aucun ticket ne correspond à ce filtre.";
    ticketList.append(empty);
    return;
  }
  for (const data of visible) {
    const closed = data.status === "closed";
    const button = document.createElement("button");
    button.type = "button";
    const unread = ticketUnread(data);
    const waiting = ticketWaiting(data);
    button.className = `ticket-item${selectedTicket?.id === data.id ? " is-selected" : ""}${unread || waiting ? " is-unread" : ""}`;
    const top = document.createElement("strong");
    top.textContent = data.subject;
    const bottom = document.createElement("span");
    bottom.className = "ticket-item-meta";
    const date = ticketDate(data.updatedAt);
    bottom.textContent = `${data.category || "Ticket"}${isModerator ? ` · ${data.creatorName || data.creatorEmail || "Membre"}` : ""}${date ? ` · ${date}` : ""}`;
    const pill = document.createElement("em");
    pill.className = `ticket-pill ${unread || waiting ? "is-new" : closed ? "is-closed" : "is-open"}`;
    pill.textContent = unread ? "Nouvelle réponse" : waiting ? "À répondre" : closed ? "Fermé" : "Ouvert";
    button.append(top, bottom, pill);
    button.addEventListener("click", () => { setSelectedTicket(data); if (typeof revealConversation === "function") revealConversation(); });
    ticketList.append(button);
  }
}

function listenToTickets() {
  if (stopTickets) stopTickets();
  const ticketsQuery = isModerator
    ? query(collection(db, "tickets"), orderBy("updatedAt", "desc"))
    : query(collection(db, "tickets"), where("creatorId", "==", currentUser.uid));
  stopTickets = onSnapshot(ticketsQuery, renderTickets, (error) => {
    const messages = {
      'permission-denied': 'Ton compte n’a pas accès à ces tickets. Reconnecte-toi puis réessaie.',
      'unavailable': 'Connexion au service des tickets indisponible. Vérifie ta connexion Internet.',
      'failed-precondition': 'Le service des tickets est en cours de configuration. Réessaie dans un instant.'
    };
    ticketList.textContent = messages[error.code] || 'Impossible de charger les tickets. Recharge la page pour réessayer.';
  });
}

setupGoogleLogin({ auth, provider, button: googleButton, status: authStatus, signInWithPopup });

discordButton.addEventListener("click", () => {
  beginDiscordLogin(DISCORD_LOGIN_URL);
});

finishDiscordLogin();
document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));

function revealConversation() {
  if (window.matchMedia("(max-width: 900px)").matches) document.querySelector(".conversation-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateTicketCounts(counts) {
  document.querySelector("#count-open").textContent = counts.open;
  document.querySelector("#count-closed").textContent = counts.closed;
  document.querySelector("#count-all").textContent = counts.all;
  document.querySelector("#stat-waiting").textContent = counts.waiting;
  document.querySelector("#stat-reports").textContent = counts.reports;
  document.querySelector("#stat-closed").textContent = counts.closed;
}

filterChips.forEach(chip => chip.addEventListener("click", () => {
  ticketFilter = chip.dataset.filter;
  filterChips.forEach(other => other.classList.toggle("is-active", other === chip));
  drawTicketList();
}));
ticketSearch.addEventListener("input", () => { ticketSearchText = ticketSearch.value; drawTicketList(); });
categoryFilter.addEventListener("change", () => { ticketCategoryFilter = categoryFilter.value; drawTicketList(); });

categorySelect.addEventListener("change", () => { categoryHint.textContent = CATEGORY_HINTS[categorySelect.value] || ""; });
const counter = (field, output) => field.addEventListener("input", () => { output.textContent = `${field.value.length} / 800`; });
counter(firstMessage, firstMessageCount);
counter(messageText, messageCount);

quickReplies.addEventListener("click", (event) => {
  const reply = event.target.closest("button[data-reply]");
  if (!reply) return;
  messageText.value = messageText.value.trim() ? `${messageText.value.trim()}\n\n${reply.dataset.reply}` : reply.dataset.reply;
  messageText.dispatchEvent(new Event("input"));
  messageText.focus();
});
messageText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); messageForm.requestSubmit(); }
});

// replyMarker : false tant que les nouvelles règles Firestore ne sont pas publiées (repli automatique).
async function sendMessage(ticketId, text, replyMarker = true) {
  try {
    await writeMessage(ticketId, text, replyMarker);
  } catch (error) {
    if (!replyMarker || error?.code !== 'permission-denied') throw error;
    await writeMessage(ticketId, text, false);
  }
}

async function writeMessage(ticketId, text, replyMarker) {
  const message = doc(collection(db, 'tickets', ticketId, 'messages'));
  const batch = writeBatch(db);
  const networkPermit = await authorizeWrite(auth, db, batch, 'message', `${ticketId}/${message.id}`);
  batch.set(message, {
    authorId: currentUser.uid,
    authorName: (currentUser.displayName || currentUser.email || "Membre Heivoli").slice(0, 120),
    authorIsModerator: isModerator,
    text,
    createdAt: serverTimestamp(),
    networkPermit,
  });
  batch.update(doc(db, 'tickets', ticketId), replyMarker
    ? { updatedAt: serverTimestamp(), lastReplyBy: isModerator ? 'moderation' : 'member', lastReplyAt: serverTimestamp() }
    : { updatedAt: serverTimestamp() });
  await batch.commit();
}

ticketForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || blocked) return;
  const subject = document.querySelector("#ticket-subject").value.trim();
  const category = categorySelect.value;
  const text = firstMessage.value.trim();
  if (!subject || !text) return;
  const submit = ticketForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  ticketCreateStatus.textContent = "Création du ticket (vérification 1/2)…";
  let ticketId = null;
  try {
    const ticket = doc(collection(db, 'tickets'));
    const batch = writeBatch(db);
    const networkPermit = await authorizeWrite(auth, db, batch, 'ticket', ticket.id);
    batch.set(ticket, {
      creatorId: currentUser.uid,
      creatorName: (currentUser.displayName || "Membre Heivoli").slice(0, 120),
      creatorEmail: currentUser.email || "",
      subject,
      category,
      status: "open",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      networkPermit,
    });
    await batch.commit();
    ticketId = ticket.id;
    ticketFilter = "open";
    filterChips.forEach(chip => chip.classList.toggle("is-active", chip.dataset.filter === "open"));
    setSelectedTicket({ id: ticket.id, subject, category, status: "open", creatorId: currentUser.uid, creatorName: currentUser.displayName || "", creatorEmail: currentUser.email || "" });
    ticketCreateStatus.textContent = "Envoi de ton message (vérification 2/2)…";
    await sendMessage(ticket.id, text);
    ticketForm.reset();
    firstMessageCount.textContent = "0 / 800";
    categoryHint.textContent = CATEGORY_HINTS.Question;
    ticketCreateStatus.textContent = "Ticket envoyé ! La modération te répondra dans la discussion.";
    sound("success");
  } catch (error) {
    sound("error");
    if (ticketId) {
      messageText.value = text;
      messageText.dispatchEvent(new Event("input"));
      ticketCreateStatus.textContent = "Le ticket est créé mais ton message n’est pas parti. Il a été recopié à droite : clique sur Envoyer.";
    } else {
      ticketCreateStatus.textContent = error.message || "Création bloquée : réessaie dans un instant.";
    }
  } finally {
    submit.disabled = false;
  }
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || blocked || !selectedTicket || selectedTicket.status === "closed") return;
  const text = messageText.value.trim();
  if (!text) return;
  messageSubmit.disabled = true;
  messageStatus.textContent = "Envoi…";
  try {
    await sendMessage(selectedTicket.id, text);
    messageText.value = "";
    messageCount.textContent = "0 / 800";
    messageStatus.textContent = "";
  } catch (error) {
    messageStatus.textContent = error.message || "Envoi bloqué : réessaie dans un instant.";
    sound("error");
  } finally {
    messageSubmit.disabled = blocked || selectedTicket?.status === "closed";
  }
});

async function setTicketStatus(status) {
  if (!isModerator || !selectedTicket) return;
  try {
    await updateDoc(doc(db, "tickets", selectedTicket.id), { status, updatedAt: serverTimestamp() });
  } catch {
    messageStatus.textContent = status === "closed" ? "Impossible de fermer ce ticket." : "Impossible de rouvrir ce ticket.";
  }
}
closeTicket.addEventListener("click", () => {
  if (selectedTicket && confirm(`Fermer « ${selectedTicket.subject} » ? Le membre ne pourra plus y répondre.`)) setTicketStatus("closed");
});
reopenTicket.addEventListener("click", () => setTicketStatus("open"));
deleteTicket.addEventListener("click", async () => {
  if (!isModerator || !selectedTicket) return;
  if (!confirm(`Supprimer définitivement « ${selectedTicket.subject} » et tous ses messages ? Cette action est irréversible.`)) return;
  const ticketId = selectedTicket.id;
  try {
    const messages = await getDocs(collection(db, "tickets", ticketId, "messages"));
    const batch = writeBatch(db);
    messages.forEach(item => batch.delete(item.ref));
    batch.delete(doc(db, "tickets", ticketId));
    await batch.commit();
    setSelectedTicket(null);
  } catch {
    messageStatus.textContent = "Impossible de supprimer ce ticket.";
  }
});

onAuthStateChanged(auth, async (user) => {
  stopBan?.(); stopBan = null; blocked = true; banNotice.textContent = ''; ticketForm.hidden = true;
  currentUser = user;
  isModerator = false;
  allTickets = [];
  ticketList.replaceChildren();
  messageList.replaceChildren();
  messageText.value = "";
  conversationSubject.textContent = "";
  conversationContent.hidden = true;
  if (stopTickets) stopTickets();
  if (stopMessages) stopMessages();
  stopTickets = null;
  stopMessages = null;
  selectedTicket = null;
  locked.hidden = Boolean(user);
  content.hidden = !user;
  moderatorBadge.hidden = true;
  if (!user) return;
  stopBan = watchBan(db, user, state => {
    blocked = state.blocked; banNotice.textContent = state.message; ticketForm.hidden = blocked;
    messageText.disabled = blocked || !selectedTicket || selectedTicket.status === 'closed';
    messageSubmit.disabled = messageText.disabled;
  });

  const tokenClaims = (await user.getIdTokenResult()).claims;
  const email = !user.emailVerified || tokenClaims.discordId ? "" : (user.email?.toLowerCase() || "");
  let moderatorRole = email === CREATOR_EMAIL;
  if (!moderatorRole && email) {
    try {
      moderatorRole = (await getDoc(doc(db, "admins", email))).exists();
    } catch {
      moderatorRole = false;
    }
  }
  if (auth.currentUser !== user) return;
  isModerator = moderatorRole;
  moderatorBadge.hidden = !isModerator;
  modStats.hidden = !isModerator;
  ticketHowto.hidden = isModerator;
  categoryFilter.hidden = !isModerator;
  newTicket.open = !isModerator;
  ticketsTitle.replaceChildren(document.createTextNode(isModerator ? "Tous les" : "Mes"), document.createElement("br"));
  const em = document.createElement("em"); em.textContent = "tickets."; ticketsTitle.append(em);
  ticketListTitle.textContent = isModerator ? "Tous les tickets" : "Mes tickets";
  ticketListNote.textContent = isModerator ? "Réponds aux membres, ferme, rouvre ou supprime un ticket." : "Seuls toi et la modération peuvent les lire.";
  ticketSearch.placeholder = isModerator ? "Rechercher un sujet, un membre, un e-mail…" : "Rechercher un sujet…";
  emptyConversation.hidden = false;
  conversationContent.hidden = true;
  listenToTickets();
});
