import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { GoogleAuthProvider, getAuth, getRedirectResult, onAuthStateChanged, signInWithCustomToken, signInWithRedirect, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { addDoc, collection, doc, getDoc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";

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

let currentUser = null;
let isModerator = false;
let selectedTicket = null;
let stopTickets = null;
let stopMessages = null;

function formatDate(timestamp) {
  if (!timestamp?.toDate) return "À l’instant";
  return timestamp.toDate().toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function showAuthError(error) {
  const messages = {
    "auth/operation-not-allowed": "La connexion Google doit être activée dans Firebase.",
    "auth/unauthorized-domain": "Ce domaine doit être ajouté aux domaines autorisés dans Firebase.",
  };
  authStatus.textContent = messages[error.code] || "La connexion n’a pas pu aboutir. Réessaie dans un instant.";
  googleButton.disabled = false;
}

async function finishDiscordLogin() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const customToken = params.get("discordToken");
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

function setSelectedTicket(ticket) {
  selectedTicket = ticket;
  emptyConversation.hidden = Boolean(ticket);
  conversationContent.hidden = !ticket;
  if (stopMessages) stopMessages();
  stopMessages = null;
  if (!ticket) return;

  conversationCategory.replaceChildren();
  conversationCategory.append(document.createElement("span"), document.createTextNode(` ${ticket.category || "Ticket"}`));
  conversationSubject.textContent = ticket.subject;
  const isOpen = ticket.status !== "closed";
  conversationStatus.textContent = isOpen ? "Ticket ouvert · La modération peut te répondre ici." : "Ticket fermé · Cette discussion est terminée.";
  conversationStatus.classList.toggle("is-closed", !isOpen);
  closeTicket.hidden = !isModerator || !isOpen;
  messageText.disabled = !isOpen;
  messageSubmit.disabled = !isOpen;
  messageText.placeholder = isOpen ? "Écris ton message…" : "Ce ticket est fermé.";
  messageList.replaceChildren();

  stopMessages = onSnapshot(query(collection(db, "tickets", ticket.id, "messages"), orderBy("createdAt", "asc")), (snapshot) => {
    messageList.replaceChildren();
    if (snapshot.empty) {
      const empty = document.createElement("p");
      empty.className = "messages-empty";
      empty.textContent = "Explique ta demande en envoyant le premier message.";
      messageList.append(empty);
      return;
    }
    snapshot.forEach((item) => {
      const data = item.data();
      const article = document.createElement("article");
      const mine = data.authorId === currentUser?.uid;
      article.className = `message ${mine ? "is-mine" : ""}`;
      const meta = document.createElement("p");
      meta.className = "message-meta";
      const author = mine ? "Vous" : (data.authorName || "Modération");
      meta.textContent = `${author}${data.authorIsModerator ? " · Modération" : ""} · ${formatDate(data.createdAt)}`;
      const body = document.createElement("p");
      body.className = "message-body";
      body.textContent = data.text || "";
      article.append(meta, body);
      messageList.append(article);
    });
    messageList.scrollTop = messageList.scrollHeight;
  }, () => {
    messageStatus.textContent = "Impossible de charger cette discussion.";
  });
}

function renderTickets(snapshot) {
  ticketList.replaceChildren();
  if (snapshot.empty) {
    const empty = document.createElement("p");
    empty.className = "tickets-empty";
    empty.textContent = isModerator ? "Aucun ticket ouvert pour l’instant." : "Tu n’as pas encore ouvert de ticket.";
    ticketList.append(empty);
    setSelectedTicket(null);
    return;
  }
  let matchingSelected = null;
  snapshot.forEach((item) => {
    const data = { id: item.id, ...item.data() };
    if (selectedTicket?.id === item.id) matchingSelected = data;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ticket-item ${selectedTicket?.id === item.id ? "is-selected" : ""}`;
    const top = document.createElement("strong");
    top.textContent = data.subject;
    const bottom = document.createElement("span");
    bottom.textContent = `${data.status === "closed" ? "Fermé" : "Ouvert"}${isModerator ? ` · ${data.creatorName || data.creatorEmail || "Membre"}` : ""}`;
    button.append(top, bottom);
    button.addEventListener("click", () => setSelectedTicket(data));
    ticketList.append(button);
  });
  if (matchingSelected) setSelectedTicket(matchingSelected);
}

function listenToTickets() {
  if (stopTickets) stopTickets();
  const ticketsQuery = isModerator
    ? query(collection(db, "tickets"), orderBy("updatedAt", "desc"))
    : query(collection(db, "tickets"), where("creatorId", "==", currentUser.uid), orderBy("updatedAt", "desc"));
  stopTickets = onSnapshot(ticketsQuery, renderTickets, () => {
    ticketList.textContent = "Impossible de charger les tickets. Vérifie les règles Firebase.";
  });
}

googleButton.addEventListener("click", async () => {
  googleButton.disabled = true;
  googleButton.textContent = "Connexion en cours…";
  try {
    await signInWithRedirect(auth, provider);
  } catch (error) {
    showAuthError(error);
  }
});

discordButton.addEventListener("click", () => {
  window.location.assign(DISCORD_LOGIN_URL);
});

getRedirectResult(auth).catch(showAuthError);
finishDiscordLogin();
document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));

ticketForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  ticketCreateStatus.textContent = "Création…";
  try {
    const ticket = await addDoc(collection(db, "tickets"), {
      creatorId: currentUser.uid,
      creatorName: currentUser.displayName || "Membre Heivoli",
      creatorEmail: currentUser.email || "",
      subject: document.querySelector("#ticket-subject").value.trim(),
      category: document.querySelector("#ticket-category").value,
      status: "open",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    ticketForm.reset();
    ticketCreateStatus.textContent = "Ticket créé. Explique maintenant ta demande à droite.";
    setSelectedTicket({ id: ticket.id, subject: "Nouveau ticket", category: "Ticket", status: "open" });
  } catch {
    ticketCreateStatus.textContent = "Création bloquée : vérifie les règles Firebase.";
  }
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || !selectedTicket || selectedTicket.status === "closed") return;
  const text = messageText.value.trim();
  if (!text) return;
  messageStatus.textContent = "Envoi…";
  try {
    await addDoc(collection(db, "tickets", selectedTicket.id, "messages"), {
      authorId: currentUser.uid,
      authorName: currentUser.displayName || currentUser.email || "Membre Heivoli",
      authorIsModerator: isModerator,
      text,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "tickets", selectedTicket.id), { updatedAt: serverTimestamp() });
    messageText.value = "";
    messageStatus.textContent = "";
  } catch {
    messageStatus.textContent = "Envoi bloqué : vérifie les règles Firebase.";
  }
});

closeTicket.addEventListener("click", async () => {
  if (!isModerator || !selectedTicket || !confirm(`Fermer « ${selectedTicket.subject} » ?`)) return;
  try {
    await updateDoc(doc(db, "tickets", selectedTicket.id), { status: "closed", updatedAt: serverTimestamp() });
  } catch {
    messageStatus.textContent = "Impossible de fermer ce ticket.";
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (stopTickets) stopTickets();
  if (stopMessages) stopMessages();
  stopTickets = null;
  stopMessages = null;
  selectedTicket = null;
  locked.hidden = Boolean(user);
  content.hidden = !user;
  if (!user) return;

  const email = user.email?.toLowerCase() || "";
  isModerator = email === CREATOR_EMAIL;
  if (!isModerator && email) {
    try {
      isModerator = (await getDoc(doc(db, "admins", email))).exists();
    } catch {
      isModerator = false;
    }
  }
  moderatorBadge.hidden = !isModerator;
  ticketListTitle.textContent = isModerator ? "Tous les tickets" : "Mes tickets";
  ticketListNote.textContent = isModerator ? "Tu peux répondre aux membres et fermer un ticket." : "Seuls toi et la modération peuvent les lire.";
  emptyConversation.hidden = false;
  conversationContent.hidden = true;
  listenToTickets();
});
