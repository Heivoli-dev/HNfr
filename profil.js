import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { GoogleAuthProvider, getAuth, getRedirectResult, onAuthStateChanged, signInWithRedirect, signOut } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
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

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();
const lockedProfile = document.querySelector("#profile-locked");
const profileContent = document.querySelector("#profile-content");
const googleButton = document.querySelector("#google-login");
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

function showAuthError(error) {
  const messages = {
    "auth/operation-not-allowed": "La connexion Google doit être activée dans Firebase.",
    "auth/unauthorized-domain": "Ce domaine doit être ajouté aux domaines autorisés dans Firebase.",
  };
  authStatus.textContent = messages[error.code] || "La connexion n’a pas pu aboutir. Réessaie dans un instant.";
  googleButton.disabled = false;
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

getRedirectResult(auth).catch(showAuthError);
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
    profileBadge.hidden = true;
    adminLink.hidden = true;
    return;
  }

  const name = user.displayName || user.email || "Membre";
  profileName.textContent = name;
  profileEmail.textContent = user.email || "Compte Google";
  profileInitial.textContent = name.charAt(0).toUpperCase();
  profileInitial.hidden = Boolean(user.photoURL);
  profilePhoto.hidden = !user.photoURL;
  profilePhoto.src = user.photoURL || "";
  profileDescription.value = localStorage.getItem(`heivoli-profile-${user.uid}`) || "";
  const email = user.email?.toLowerCase() || "";
  const isCreator = email === CREATOR_EMAIL;
  let isAdmin = isCreator;
  if (!isAdmin && email) {
    try {
      isAdmin = (await getDoc(doc(db, "admins", email))).exists();
    } catch {
      isAdmin = false;
    }
  }
  profileBadge.hidden = !isAdmin;
  profileBadge.textContent = isCreator ? "✦ Fondateur" : "✦ Administrateur";
  adminLink.hidden = !isAdmin;
  updateDescriptionCount();
});
