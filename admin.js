import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { GoogleAuthProvider, browserSessionPersistence, setPersistence, getAuth, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { setupGoogleLogin } from "./google-login.js";
import { formatAnnouncementDate } from "./announcement-date.js";
import { addDoc, collection, deleteDoc, doc, getDoc, getFirestore, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";
import { watchBan } from './ban-status.js';
import { networkRequest } from './network-access.js';

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
let stopBanList = null, stopOwnBan = null, stopNetworkBans = null;
const banForm = document.querySelector('#ban-form');
const banStatus = document.querySelector('#ban-status');
const banList = document.querySelector('#ban-list');
const banUid = document.querySelector('#ban-uid');
banUid.value = new URLSearchParams(location.search).get('ban') || '';

function startBans() {
  stopNetworkBans = onSnapshot(query(collection(db, 'networkBans'), orderBy('createdAt', 'desc')), snapshot => {
    const list = document.querySelector('#network-ban-list'); list.replaceChildren();
    snapshot.forEach(item => {
      const data = item.data(), expiry = data.expiresAt?.toDate?.();
      const row = document.createElement('article'); row.className = 'admin-announcement';
      const text = document.createElement('p'); text.textContent = `${data.uid} · ${data.reason} · ${expiry ? 'Fin : ' + expiry.toLocaleString('fr-FR') : 'Permanent'}`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-announcement'; remove.textContent = 'Débloquer la connexion';
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try { await networkRequest(auth, 'network-unban', {id:item.id}); banStatus.textContent = 'Connexion débloquée. Le ban du compte se gère séparément.'; }
        catch(error) { banStatus.textContent = error.message; remove.disabled = false; }
      });
      row.append(text,remove); list.append(row);
    });
    if(snapshot.empty) list.textContent = 'Aucune connexion bannie.';
  }, () => { banStatus.textContent = 'Chargement des connexions bannies impossible.'; });
  stopBanList = onSnapshot(query(collection(db, 'bans'), orderBy('createdAt', 'desc')), snapshot => {
    banList.replaceChildren();
    snapshot.forEach(item => {
      const data = item.data(), expiry = data.expiresAt?.toDate?.();
      const row = document.createElement('article'); row.className = 'admin-announcement';
      const copy = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = item.id;
      const info = document.createElement('p');
      info.textContent = `${expiry ? (expiry > new Date() ? 'Jusqu’au ' : 'Expiré le ') + expiry.toLocaleString('fr-FR') : 'Permanent'} · ${data.reason}`;
      copy.append(title, info);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-announcement'; remove.textContent = 'Débannir';
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try { await deleteDoc(item.ref); banStatus.textContent = 'Compte débanni.'; }
        catch { banStatus.textContent = 'Débannissement impossible.'; remove.disabled = false; }
      });
      row.append(copy, remove); banList.append(row);
    });
    if (snapshot.empty) banList.textContent = 'Aucun bannissement.';
  }, () => { banStatus.textContent = 'Impossible de charger les bannissements. Vérifie les règles Firebase.'; });
}
banForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!isAdmin || !auth.currentUser) return;
  const uid = banUid.value.trim(), reason = document.querySelector('#ban-reason').value.trim();
  const duration = document.querySelector('#ban-duration').value;
  if (!uid || uid.includes('/') || uid === auth.currentUser.uid || !reason) {
    banStatus.textContent = 'Choisis un autre compte et indique un motif.'; return;
  }
  const button = banForm.querySelector('button'); button.disabled = true;
  try {
    if(document.querySelector('#ban-network').checked) await networkRequest(auth, 'network-ban', {uid,reason,hours:duration==='permanent'?'permanent':Number(duration)});
    else await setDoc(doc(db, 'bans', uid), { reason, expiresAt: duration === 'permanent' ? null : Timestamp.fromMillis(Date.now() + Number(duration) * 3600000), createdAt: serverTimestamp(), createdBy: auth.currentUser.uid });
    banForm.reset(); banStatus.textContent = 'Compte banni. Le motif lui sera affiché.';
  } catch (error) { banStatus.textContent = error.message || 'Bannissement refusé. Vérifie tes droits et les règles Firebase.'; }
  finally { button.disabled = false; }
});

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
    meta.textContent = `${data.type} · ${formatAnnouncementDate(data)}`;
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
  try {
    adminStatus.textContent = "Publication…";
    await addDoc(collection(db, "announcements"), {
      type: document.querySelector("#announcement-type").value,
      title: document.querySelector("#announcement-title").value.trim(),
      text: document.querySelector("#announcement-text").value.trim(),
      date: formatAnnouncementDate({ createdAt: { toDate: () => new Date() } }),
      featured: document.querySelector("#announcement-featured").checked,
      createdAt: serverTimestamp(),
      authorId: auth.currentUser.uid,
    });
    form.reset();
    adminStatus.textContent = "Annonce publiée.";
  } catch {
    const signedInEmail = auth.currentUser?.email?.toLowerCase() || "";
    if (signedInEmail === CREATOR_EMAIL && !auth.currentUser?.emailVerified) {
      adminStatus.textContent = "Cette adresse fondatrice doit être vérifiée dans Firebase avant de publier.";
    } else if (signedInEmail !== CREATOR_EMAIL) {
      adminStatus.textContent = "Publication réservée au compte fondateur configuré dans le site.";
    } else {
      adminStatus.textContent = "Publication bloquée par Firebase : publie les règles Firestore à jour puis reconnecte-toi.";
    }
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
  stopNetworkBans?.(); stopNetworkBans = null; document.querySelector('#network-ban-list').replaceChildren();
  stopBanList?.(); stopBanList = null; stopOwnBan?.(); stopOwnBan = null; banList.replaceChildren();
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
  if (isAdmin) {
    startBans();
    stopOwnBan = watchBan(db, user, state => {
      if (state.blocked) { adminContent.hidden = true; authStatus.textContent = state.message; }
      else adminContent.hidden = false;
    });
  }
  if (!user) {
    googleButton.hidden = false;
    return;
  }
  if (email === CREATOR_EMAIL && !user.emailVerified) {
    authStatus.textContent = "Adresse fondatrice non vérifiée : vérifie-la dans Firebase Authentication.";
  }
  if (!isAdmin) {
    authStatus.textContent = "Ce compte n’est pas autorisé à accéder à l’administration.";
    googleButton.hidden = true;
  }
});

onSnapshot(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(30)), renderAnnouncements, () => {
  if (isAdmin) adminStatus.textContent = "Active Firebase Firestore et ses règles pour publier des annonces.";
});
