import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { formatAnnouncementDate } from "./announcement-date.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { collection, getFirestore, limit, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";

const CONFIG = {
  discordInvite: "https://discord.gg/J4HkUzrNdu",
};

const firebaseConfig = {
  apiKey: "AIzaSyDKXFI0a1H1lnWIRI-qXor45RQ5R5qAMJk",
  authDomain: "heivoli-network-408f3.firebaseapp.com",
  projectId: "heivoli-network-408f3",
  storageBucket: "heivoli-network-408f3.firebasestorage.app",
  messagingSenderId: "761703200496",
  appId: "1:761703200496:web:967e8fd7330db657ca7435",
};

const announcementList = document.querySelector("#announcements-list");
function renderAnnouncements(items) {
  const articles = [];
  for (const announcement of items) {
    const article = document.createElement("article");
    article.className = announcement.featured ? "announcement featured" : "announcement";
    if (typeof announcement.imageData === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(announcement.imageData)) {
      const image = document.createElement("img");
      image.className = "announcement-image";
      image.src = announcement.imageData;
      image.alt = announcement.title ? `Illustration : ${announcement.title}` : "Illustration de l’annonce";
      image.loading = "lazy";
      article.append(image);
    }
    for (const [tag, className, value] of [
      ["p", "announcement-type", announcement.type],
      ["h3", "", announcement.title],
      ["p", "", announcement.text],
      ["p", "announcement-date", formatAnnouncementDate(announcement)],
    ]) {
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = typeof value === "string" ? value : "";
      article.append(element);
    }
    if (announcement.id) {
      const link = document.createElement("a");
      link.className = "comment-login";
      link.href = `annonce.html?id=${encodeURIComponent(announcement.id)}#discussion`;
      link.textContent = "Lire et écrire les commentaires ↗";
      article.append(link);
    }
    articles.push(article);
  }
  announcementList.replaceChildren(...articles);
}
function showAnnouncementStatus(message) {
  renderAnnouncements([]);
  const status = document.createElement("p");
  status.textContent = message;
  announcementList.append(status);
}
document.querySelector("#year").textContent = new Date().getFullYear();

const modal = document.querySelector("#notice-modal");
document.querySelectorAll(".discord-trigger").forEach((button) => button.addEventListener("click", () => {
  window.open(CONFIG.discordInvite, "_blank", "noopener,noreferrer");
}));
document.querySelector(".modal-close").addEventListener("click", () => modal.close());
modal.addEventListener("click", (event) => { if (event.target === modal) modal.close(); });

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const accountTrigger = document.querySelector("#account-trigger");
onAuthStateChanged(auth, (user) => {
  accountTrigger.setAttribute("aria-label", user ? `Mon compte : ${user.displayName || "Profil"}` : "Mon compte — Connexion");
});

onSnapshot(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(12)), (snapshot) => {
  if (snapshot.empty) showAnnouncementStatus("Aucune annonce pour le moment.");
  else renderAnnouncements(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
}, () => {
  showAnnouncementStatus("Impossible de charger les annonces. Vérifie ta connexion puis recharge la page.");
});
