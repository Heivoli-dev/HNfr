import { authorizeWrite } from './network-access.js';
import { safeProfilePhoto } from './profiles.js';
import { commentModerationError } from './comment-moderation.js';
import { beginDiscordLogin, consumeDiscordToken } from "./security.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { GoogleAuthProvider, browserLocalPersistence, browserSessionPersistence, setPersistence, getAuth, onAuthStateChanged, signInWithCustomToken, signInWithPopup, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { setupGoogleLogin } from "./google-login.js";
import { doc, getDoc, getFirestore, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDKXFI0a1H1lnWIRI-qXor45RQ5R5qAMJk",
  authDomain: "heivoli-network-408f3.firebaseapp.com",
  projectId: "heivoli-network-408f3",
  storageBucket: "heivoli-network-408f3.firebasestorage.app",
  messagingSenderId: "761703200496",
  appId: "1:761703200496:web:967e8fd7330db657ca7435",
};
const CREATOR_EMAIL = "heivolipro@gmail.com";
const DISCORD_LOGIN_URL = "https://heivoli-discord-auth.heivoli-discord-auth.workers.dev/login";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();
const lockedProfile = document.querySelector("#profile-locked");
const profileContent = document.querySelector("#profile-content");
const googleButton = document.querySelector("#google-login");
const discordButton = document.querySelector("#discord-login");
const rememberDevice = document.querySelector("#remember-device");
const authStatus = document.querySelector("#auth-status");
const profileName = document.querySelector("#profile-name");
const profileEmail = document.querySelector("#profile-email");
const profileInitial = document.querySelector("#profile-initial");
const profilePhoto = document.querySelector("#profile-photo");
const profileDescription = document.querySelector("#profile-description");
const descriptionCount = document.querySelector("#description-count");
const profileSaveStatus = document.querySelector("#profile-save-status");
const profileBadge = document.querySelector("#profile-badge");
const adminLink = document.querySelector("#admin-link");
let currentUser = null;

async function applySelectedPersistence() {
  await setPersistence(auth, rememberDevice.checked ? browserLocalPersistence : browserSessionPersistence);
}

rememberDevice.addEventListener("change", async () => {
  try {
    await applySelectedPersistence();
    authStatus.textContent = rememberDevice.checked
      ? "Compte mémorisé sur cet appareil."
      : "Compte conservé seulement pour cette session.";
  } catch {
    authStatus.textContent = "Le réglage de mémorisation n’a pas pu être appliqué.";
  }
});

function updateDescriptionCount() {
  descriptionCount.textContent = `${profileDescription.value.length} / 280`;
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

setupGoogleLogin({ auth, provider, button: googleButton, status: authStatus, signInWithPopup, beforeLogin: applySelectedPersistence });

discordButton.addEventListener("click", async () => {
  discordButton.disabled = true;
  authStatus.textContent = "Préparation de la connexion Discord…";
  await applySelectedPersistence();
  beginDiscordLogin(DISCORD_LOGIN_URL);
});

finishDiscordLogin();
document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));

profileDescription.addEventListener("input", updateDescriptionCount);
const targetUid = new URLSearchParams(location.search).get('uid');
const publicView = !!targetUid;
const displayNameInput = document.querySelector('#profile-display-name');
const photoInput = document.querySelector('#profile-photo-url');
const publicDescription = document.querySelector('#public-description');
const publicStatus = document.querySelector('#public-profile-status');
const profileForm = document.querySelector('#profile-form');
let loadedUid = null;
function showProfile(data) {
  const name = data.displayName || 'Membre';
  profileName.textContent = name;
  profileInitial.textContent = name.charAt(0).toUpperCase();
  const photo = safeProfilePhoto(data.photoURL);
  profileInitial.hidden = !!photo; profilePhoto.hidden = !photo;
  if (photo) profilePhoto.src = photo; else profilePhoto.removeAttribute('src');
  displayNameInput.value = name; photoInput.value = photo;
  profileDescription.value = data.bio || ''; publicDescription.textContent = data.bio || 'Ce membre ne s’est pas encore présenté.';
  updateDescriptionCount();
}
profilePhoto.addEventListener('error', () => { profilePhoto.hidden = true; profileInitial.hidden = false; });
profileForm.addEventListener('submit', async event => {
  event.preventDefault();
  const user = auth.currentUser;
  if (!user || (targetUid && targetUid !== user.uid) || loadedUid !== user.uid) return;
  const displayName = displayNameInput.value.trim(), bio = profileDescription.value.trim(), photoURL = photoInput.value.trim();
  if (!displayName || displayName.length > 60 || bio.length > 280) { profileSaveStatus.textContent = 'Pseudo : 1 à 60 caractères. Description : 280 caractères maximum.'; return; }
  if (photoURL && !safeProfilePhoto(photoURL)) { profileSaveStatus.textContent = 'Utilise un lien HTTPS d’image imgbb, Google ou Discord.'; return; }
  const moderation = commentModerationError(displayName) || (bio && commentModerationError(bio));
  if (moderation) { profileSaveStatus.textContent = 'Ton profil doit rester sans insultes ni liens dans le texte.'; return; }
  const button = profileForm.querySelector('button'); button.disabled = true;
  try {
    const batch = writeBatch(db);
    const networkPermit = await authorizeWrite(auth, db, batch, 'profile', user.uid);
    batch.set(doc(db, 'profiles', user.uid), { displayName, bio, photoURL, updatedAt: serverTimestamp(), networkPermit });
    await batch.commit();
    showProfile({displayName,bio,photoURL});
    profileSaveStatus.textContent = 'Profil enregistré en ligne.';
  } catch { profileSaveStatus.textContent = 'Enregistrement impossible. Vérifie ta connexion ; un compte banni ne peut pas modifier son profil.'; }
  finally { button.disabled = false; }
});
onAuthStateChanged(auth, async user => {
  currentUser = user;
  const uid = targetUid || user?.uid;
  const own = !!user && uid === user.uid;
  loadedUid = null; profileForm.hidden = true;
  profileContent.hidden = !uid; lockedProfile.hidden = !!uid;
  publicDescription.hidden = !publicView;
  profileEmail.hidden = !own; profileEmail.textContent = '';
  document.querySelector('#sign-out').hidden = !own;
  profileBadge.hidden = true; adminLink.hidden = true;
  document.querySelector('#profile-title').textContent = own ? 'Mon profil' : 'Profil du membre';
  if (!uid) return;
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) { publicStatus.textContent = 'Profil introuvable.'; return; }
  publicStatus.textContent = 'Chargement du profil…';
  try {
    const snapshot = await getDoc(doc(db, 'profiles', uid));
    if (auth.currentUser !== user) return;
    if (!snapshot.exists() && !own) { showProfile({}); publicStatus.textContent = 'Ce membre n’a pas encore créé son profil public.'; return; }
    const fallback = { displayName: user?.displayName || 'Membre', photoURL: user?.photoURL || '', bio: localStorage.getItem(`heivoli-profile-${uid}`) || '' };
    showProfile(snapshot.exists() ? snapshot.data() : fallback);
    loadedUid = uid; profileForm.hidden = !own; publicStatus.textContent = '';
    if (own) {
      const claims = (await user.getIdTokenResult()).claims;
      const email = user.emailVerified && !claims.discordId ? user.email : '';
      profileEmail.textContent = claims.discordId ? 'Compte Discord' : (user.email || 'Compte Google');
      let admin = email === CREATOR_EMAIL;
      if (!admin && email) { try { admin = (await getDoc(doc(db, 'admins', email))).exists(); } catch { admin = false; } }
      if (auth.currentUser !== user) return;
      adminLink.hidden = !admin; profileBadge.hidden = !admin;
      profileBadge.textContent = email === CREATOR_EMAIL ? '✦ Fondateur' : '✦ Administrateur';
    }
  } catch { publicStatus.textContent = 'Impossible de charger ce profil. Réessaie dans un instant.'; }
});
