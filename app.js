import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";

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
  measurementId: "G-DJCSXJRJ84",
};

const announcements = [
  {
    type: "Bienvenue",
    title: "Heivoli Network prend vie.",
    text: "Le nouveau point de rendez-vous des fans Nintendo ouvre ses portes.",
    date: "Aujourd'hui",
    featured: true,
  },
  {
    type: "Événement",
    title: "Des sessions de jeu à venir.",
    text: "Les premiers rendez-vous communautaires seront annoncés ici.",
    date: "Bientôt",
  },
  {
    type: "Communauté",
    title: "Le futur bot Heivoli arrive.",
    text: "Il reliera progressivement ton compte au serveur Discord.",
    date: "En développement",
  },
];

const announcementList = document.querySelector("#announcements-list");
announcementList.innerHTML = announcements
  .map(
    (announcement) => `
      <article class="announcement ${announcement.featured ? "featured" : ""}">
        <p class="announcement-type">${announcement.type}</p>
        <h3>${announcement.title}</h3>
        <p>${announcement.text}</p>
        <p class="announcement-date">${announcement.date}</p>
      </article>
    `,
  )
  .join("");

document.querySelector("#year").textContent = new Date().getFullYear();

const menuButton = document.querySelector(".menu-button");
const nav = document.querySelector(".site-nav");
menuButton.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

document.querySelectorAll(".site-nav a").forEach((link) =>
  link.addEventListener("click", () => {
    nav.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
  }),
);

const modal = document.querySelector("#notice-modal");
const modalTitle = document.querySelector("#modal-title");
const modalMessage = document.querySelector("#modal-message");
const modalAction = document.querySelector("#modal-action");
const accountTrigger = document.querySelector("#account-trigger");
const googleButton = document.querySelector(".google-login");
const authStatus = document.querySelector("#auth-status");

function showNotice(kind) {
  if (kind === "discord" && CONFIG.discordInvite) {
    window.open(CONFIG.discordInvite, "_blank", "noopener,noreferrer");
    return;
  }

  modalTitle.textContent = "Discord arrive bientôt.";
  modalMessage.textContent = "La connexion Discord sera activée quand le bot Heivoli sera prêt. Tu peux déjà te connecter avec Google.";
  modalAction.hidden = true;
  modal.showModal();
}

document.querySelectorAll(".discord-trigger").forEach((button) =>
  button.addEventListener("click", () => showNotice("discord")),
);
document.querySelectorAll(".account-trigger").forEach((button) =>
  button.addEventListener("click", () => showNotice("account")),
);
document.querySelector(".modal-close").addEventListener("click", () => modal.close());
modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.close();
});

const auth = getAuth(initializeApp(firebaseConfig));
const googleProvider = new GoogleAuthProvider();

function setGoogleButton(isLoading) {
  googleButton.disabled = isLoading;
  googleButton.innerHTML = isLoading
    ? '<span class="google-icon">…</span> Connexion en cours…'
    : '<span class="google-icon">G</span> Continuer avec Google';
}

function showAuthError(error) {
  const messages = {
    "auth/operation-not-allowed": "La connexion Google doit encore être activée dans Firebase.",
    "auth/unauthorized-domain": "Ce domaine doit être ajouté aux domaines autorisés dans Firebase.",
    "auth/popup-closed-by-user": "La fenêtre de connexion a été fermée.",
  };
  authStatus.textContent = messages[error.code] || "La connexion Google n’a pas pu aboutir. Réessaie dans un instant.";
  setGoogleButton(false);
}

async function startGoogleLogin() {
  setGoogleButton(true);
  authStatus.textContent = "";
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (error) {
    showAuthError(error);
  }
}

googleButton.addEventListener("click", startGoogleLogin);
getRedirectResult(auth).catch(showAuthError);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    accountTrigger.textContent = "Connexion";
    googleButton.hidden = false;
    setGoogleButton(false);
    return;
  }

  const name = user.displayName || user.email || "Membre";
  accountTrigger.textContent = name.split(" ")[0];
  authStatus.innerHTML = `Connecté·e en tant que <strong>${name}</strong> · <button class="sign-out" type="button">Se déconnecter</button>`;
  googleButton.hidden = true;
  authStatus.querySelector(".sign-out").addEventListener("click", () => signOut(auth));
});
