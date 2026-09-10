import { beginDiscordLogin, consumeDiscordToken } from "./security.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { GoogleAuthProvider, browserSessionPersistence, setPersistence, getAuth, onAuthStateChanged, signInWithCustomToken, signInWithPopup, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { setupGoogleLogin } from "./google-login.js";
import { doc, getDoc, getFirestore } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";

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
await setPersistence(auth, browserSessionPersistence);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();
const lockedProfile = document.querySelector("#profile-locked");
const profileContent = document.querySelector("#profile-content");
const googleButton = document.querySelector("#google-login");
const discordButton = document.querySelector("#discord-login");
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

setupGoogleLogin({ auth, provider, button: googleButton, status: authStatus, signInWithPopup });

discordButton.addEventListener("click", () => {
  beginDiscordLogin(DISCORD_LOGIN_URL);
});

finishDiscordLogin();
document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));

profileDescription.addEventListener("input", updateDescriptionCount);
document.querySelector("#profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!currentUser) return;
  localStorage.setItem(`heivoli-profile-${currentUser.uid}`, profileDescription.value.trim());
  profileSaveStatus.textContent = "Description enregistrée sur cet appareil.";
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  lockedProfile.hidden = Boolean(user);
  profileContent.hidden = !user;
  if (!user) {
    profileName.textContent = "";
    profileEmail.textContent = "";
    profileDescription.value = "";
    profilePhoto.removeAttribute("src");
    profileBadge.hidden = true;
    adminLink.hidden = true;
    return;
  }

  const name = user.displayName || user.email || "Membre";
  profileName.textContent = name;
  const tokenClaims = (await user.getIdTokenResult()).claims;
  if (auth.currentUser !== user) return;
  const isDiscordAccount = Boolean(tokenClaims.discordId);
  profileEmail.textContent = isDiscordAccount ? "Compte Discord" : (user.email || "Compte Google");
  profileInitial.textContent = name.charAt(0).toUpperCase();
  profileInitial.hidden = Boolean(user.photoURL);
  profilePhoto.hidden = !user.photoURL;
  profilePhoto.src = user.photoURL || "";
  profileDescription.value = localStorage.getItem(`heivoli-profile-${user.uid}`) || "";
  const email = !user.emailVerified || isDiscordAccount ? "" : (user.email?.toLowerCase() || "");
  const isCreator = email === CREATOR_EMAIL;
  let isAdmin = isCreator;
  if (!isAdmin && email) {
    try {
      isAdmin = (await getDoc(doc(db, "admins", email))).exists();
    } catch {
      isAdmin = false;
    }
  }
  if (auth.currentUser !== user) return;
  profileBadge.hidden = !isAdmin;
  profileBadge.textContent = isCreator ? "✦ Fondateur" : "✦ Administrateur";
  adminLink.hidden = !isAdmin;
  updateDescriptionCount();
});
