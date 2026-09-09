import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { GoogleAuthProvider, getAuth, getRedirectResult, onAuthStateChanged, signInWithRedirect, signOut } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDoc, getFirestore, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";

const CREATOR_EMAIL = "heivolipro@gmail.com";
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
const lockedPanel = document.querySelector("#admin-locked");
const adminContent = document.querySelector("#admin-content");
const googleButton = document.querySelector("#google-login");
const authStatus = document.querySelector("#auth-status");
const form = document.querySelector("#announcement-form");
const adminStatus = document.querySelector("#admin-status");
const announcementList = document.querySelector("#admin-announcements");
const adminManagement = document.querySelector("#admin-management");
const adminAddForm = document.querySelector("#admin-add-form");
const adminEmailInput = document.querySelector("#admin-email");
const adminManagementStatus = document.querySelector("#admin-management-status");
const adminList = document.querySelector("#admin-list");
let isAdmin = false;
let isFounder = false;
let adminListListening = false;

function renderAnnouncements(snapshot) {
  announcementList.replaceChildren();
  if (snapshot.empty) {
    announcementList.textContent = "Aucune annonce publiée pour l’instant.";
    return;
  }
  snapshot.forEach((item) => {
    const data = item.data();
    const row = document.createElement("article");
    row.className = "admin-announcement";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = data.title;
    const meta = document.createElement("p");
    meta.textContent = `${data.type} · ${data.date}`;
    copy.append(title, meta);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-announcement";
    remove.textContent = "Supprimer";
    remove.addEventListener("click", async () => {
      if (!confirm(`Supprimer « ${data.title} » ?`)) return;
      await deleteDoc(doc(db, "announcements", item.id));
    });
    row.append(copy, remove);
    announcementList.append(row);
  });
}

function renderAdmins(snapshot) {
  adminList.replaceChildren();
  if (snapshot.empty) {
    adminList.textContent = "Aucun administrateur ajouté pour l’instant.";
    return;
  }
  snapshot.forEach((item) => {
    const data = item.data();
    const row = document.createElement("article");
    row.className = "admin-announcement";
    const email = document.createElement("strong");
    email.textContent = data.email || item.id;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-announcement";
    remove.textContent = "Retirer";
    remove.addEventListener("click", async () => {
      if (!confirm(`Retirer les droits admin de ${email.textContent} ?`)) return;
      await deleteDoc(doc(db, "admins", item.id));
    });
    row.append(email, remove);
    adminList.append(row);
  });
}

function startAdminList() {
  if (adminListListening) return;
  adminListListening = true;
  onSnapshot(query(collection(db, "admins"), orderBy("email", "asc")), renderAdmins, () => {
    adminManagementStatus.textContent = "Impossible de charger les administrateurs : vérifie les règles Firebase.";
  });
}

googleButton.addEventListener("click", async () => {
  googleButton.disabled = true;
  googleButton.textContent = "Connexion en cours…";
  try {
    await signInWithRedirect(auth, provider);
  } catch {
    authStatus.textContent = "La connexion n’a pas pu aboutir. Réessaie dans un instant.";
    googleButton.disabled = false;
  }
});

getRedirectResult(auth).catch(() => {
  authStatus.textContent = "La connexion n’a pas pu aboutir. Réessaie dans un instant.";
});
document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAdmin) return;
  adminStatus.textContent = "Publication…";
  try {
    await addDoc(collection(db, "announcements"), {
      type: document.querySelector("#announcement-type").value,
      title: document.querySelector("#announcement-title").value.trim(),
      text: document.querySelector("#announcement-text").value.trim(),
      date: document.querySelector("#announcement-date").value.trim(),
      featured: document.querySelector("#announcement-featured").checked,
      createdAt: serverTimestamp(),
    });
    form.reset();
    document.querySelector("#announcement-date").value = "Aujourd'hui";
    adminStatus.textContent = "Annonce publiée.";
  } catch {
    adminStatus.textContent = "Publication bloquée : vérifie les règles Firebase.";
  }
});

adminAddForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isFounder) return;
  const email = adminEmailInput.value.trim().toLowerCase();
  if (!email || email === CREATOR_EMAIL) {
    adminManagementStatus.textContent = "Ce compte est déjà le fondateur.";
    return;
  }
  adminManagementStatus.textContent = "Ajout…";
  try {
    await setDoc(doc(db, "admins", email), { email, createdAt: serverTimestamp() });
    adminAddForm.reset();
    adminManagementStatus.textContent = "Administrateur ajouté.";
  } catch {
    adminManagementStatus.textContent = "Ajout bloqué : vérifie les règles Firebase.";
  }
});

onAuthStateChanged(auth, async (user) => {
  const email = user?.email?.toLowerCase() || "";
  isFounder = email === CREATOR_EMAIL;
  isAdmin = isFounder;
  if (!isAdmin && email) {
    try {
      isAdmin = (await getDoc(doc(db, "admins", email))).exists();
    } catch {
      isAdmin = false;
    }
  }
  lockedPanel.hidden = isAdmin;
  adminContent.hidden = !isAdmin;
  adminManagement.hidden = !isFounder;
  if (isFounder) startAdminList();
  if (!user) {
    googleButton.hidden = false;
    return;
  }
  if (!isAdmin) {
    authStatus.textContent = "Ce compte n’est pas autorisé à accéder à l’administration.";
    googleButton.hidden = true;
  }
});

onSnapshot(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(30)), renderAnnouncements, () => {
  if (isAdmin) adminStatus.textContent = "Active Firebase Firestore et ses règles pour publier des annonces.";
});
