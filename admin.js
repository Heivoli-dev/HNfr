import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { GoogleAuthProvider, browserSessionPersistence, setPersistence, getAuth, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { setupGoogleLogin } from "./google-login.js";
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
await setPersistence(auth, browserSessionPersistence);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const lockedPanel = document.querySelector("#admin-locked");
const adminContent = document.querySelector("#admin-content");
const googleButton = document.querySelector("#google-login");
const authStatus = document.querySelector("#auth-status");
const form = document.querySelector("#announcement-form");
const imageInput = document.querySelector("#announcement-image");
const adminStatus = document.querySelector("#admin-status");
const announcementList = document.querySelector("#admin-announcements");
const adminManagement = document.querySelector("#admin-management");
const adminAddForm = document.querySelector("#admin-add-form");
const adminEmailInput = document.querySelector("#admin-email");
const adminManagementStatus = document.querySelector("#admin-management-status");
const adminList = document.querySelector("#admin-list");
let isAdmin = false;
let isFounder = false;
let stopAdminList = null;

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
    if (typeof data.imageData === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data.imageData)) {
      const image = document.createElement("img");
      image.className = "admin-announcement-image";
      image.src = data.imageData;
      image.alt = data.title ? `Illustration : ${data.title}` : "Illustration de l’annonce";
      image.loading = "lazy";
      copy.append(image);
    }
    copy.append(title, meta);
    if (isFounder) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-announcement";
      remove.textContent = "Supprimer";
      remove.addEventListener("click", async () => {
        if (!confirm(`Supprimer « ${data.title} » ?`)) return;
        await deleteDoc(doc(db, "announcements", item.id));
      });
      row.append(copy, remove);
    } else {
      row.append(copy);
    }
    announcementList.append(row);
  });
}

function prepareAnnouncementImage(file) {
  if (!file) return Promise.resolve("");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return Promise.reject(new Error("format"));
  if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error("size"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("image"));
      image.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        let quality = 0.82;
        let output = canvas.toDataURL("image/jpeg", quality);
        while (output.length > 235000 && quality > 0.42) {
          quality -= 0.08;
          output = canvas.toDataURL("image/jpeg", quality);
        }
        if (output.length > 240000) reject(new Error("too-large"));
        else resolve(output);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
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
  if (stopAdminList) return;
  stopAdminList = onSnapshot(query(collection(db, "admins"), orderBy("email", "asc")), renderAdmins, () => {
    adminManagementStatus.textContent = "Impossible de charger les administrateurs : vérifie les règles Firebase.";
  });
}

setupGoogleLogin({ auth, provider, button: googleButton, status: authStatus, signInWithPopup });
document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isFounder) return;
  adminStatus.textContent = "Publication…";
  let imageData = "";
  try {
    adminStatus.textContent = imageInput.files[0] ? "Préparation de l’image…" : "Publication…";
    imageData = await prepareAnnouncementImage(imageInput.files[0]);
  } catch {
    adminStatus.textContent = "Image invalide ou trop lourde : choisis un PNG, JPG ou WebP plus léger.";
    return;
  }
  try {
    adminStatus.textContent = "Publication…";
    await addDoc(collection(db, "announcements"), {
      type: document.querySelector("#announcement-type").value,
      title: document.querySelector("#announcement-title").value.trim(),
      text: document.querySelector("#announcement-text").value.trim(),
      date: document.querySelector("#announcement-date").value.trim(),
      featured: document.querySelector("#announcement-featured").checked,
      imageData,
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
  if (stopAdminList) stopAdminList();
  stopAdminList = null;
  adminList.replaceChildren();
  isAdmin = false;
  isFounder = false;
  adminContent.hidden = true;
  const email = user?.emailVerified ? (user.email?.toLowerCase() || "") : "";
  const founderRole = email === CREATOR_EMAIL;
  let adminRole = founderRole;
  if (!adminRole && email) {
    try {
      adminRole = (await getDoc(doc(db, "admins", email))).exists();
    } catch {
      adminRole = false;
    }
  }
  if (auth.currentUser !== user) return;
  isFounder = founderRole;
  isAdmin = adminRole;
  lockedPanel.hidden = isAdmin;
  adminContent.hidden = !isAdmin;
  form.hidden = !isFounder;
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
