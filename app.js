import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { browserSessionPersistence, setPersistence, getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { collection, getFirestore, limit, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";

const CONFIG = {
  discordInvite: "https://discord.gg/nXDYpkWTDV",
};

const firebaseConfig = {
  apiKey: "AIzaSyDKXFI0a1H1lnWIRI-qXor45RQ5R5qAMJk",
  authDomain: "heivoli-network-408f3.firebaseapp.com",
  projectId: "heivoli-network-408f3",
  storageBucket: "heivoli-network-408f3.firebasestorage.app",
  messagingSenderId: "761703200496",
  appId: "1:761703200496:web:967e8fd7330db657ca7435",
};

const announcements = [
  { type: "Bienvenue", title: "Heivoli Network prend vie.", text: "Le nouveau point de rendez-vous des fans Nintendo ouvre ses portes.", date: "Aujourd'hui", featured: true },
  { type: "Événement", title: "Des sessions de jeu à venir.", text: "Les premiers rendez-vous communautaires seront annoncés ici.", date: "Bientôt" },
  { type: "Communauté", title: "Le futur bot Heivoli arrive.", text: "Il reliera progressivement ton compte au serveur Discord.", date: "En développement" },
];

const announcementList = document.querySelector("#announcements-list");
function renderAnnouncements(items) {
  announcementList.replaceChildren();
  for (const announcement of items) {
    const article = document.createElement("article");
    article.className = announcement.featured ? "announcement featured" : "announcement";
    for (const [tag, className, value] of [
      ["p", "announcement-type", announcement.type],
      ["h3", "", announcement.title],
      ["p", "", announcement.text],
      ["p", "announcement-date", announcement.date],
    ]) {
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = typeof value === "string" ? value : "";
      article.append(element);
    }
    announcementList.append(article);
  }
}
renderAnnouncements(announcements);
document.querySelector("#year").textContent = new Date().getFullYear();

const menuButton = document.querySelector(".menu-button");
const nav = document.querySelector(".site-nav");
menuButton.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});
document.querySelectorAll(".site-nav a").forEach((link) => link.addEventListener("click", () => {
  nav.classList.remove("is-open");
  menuButton.setAttribute("aria-expanded", "false");
}));

const modal = document.querySelector("#notice-modal");
document.querySelectorAll(".discord-trigger").forEach((button) => button.addEventListener("click", () => {
  window.open(CONFIG.discordInvite, "_blank", "noopener,noreferrer");
}));
document.querySelector(".modal-close").addEventListener("click", () => modal.close());
modal.addEventListener("click", (event) => { if (event.target === modal) modal.close(); });

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
await setPersistence(auth, browserSessionPersistence);
const db = getFirestore(firebaseApp);
const accountTrigger = document.querySelector("#account-trigger");
onAuthStateChanged(auth, (user) => {
  accountTrigger.textContent = user ? (user.displayName || "Profil").split(" ")[0] : "Connexion";
});

onSnapshot(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(12)), (snapshot) => {
  if (snapshot.empty) return;
  renderAnnouncements(snapshot.docs.map((doc) => doc.data()));
}, () => {
  // Les annonces de présentation restent visibles tant que la base n'est pas activée.
});
