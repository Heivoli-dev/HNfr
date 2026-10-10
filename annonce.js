import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";
import { attachComments } from "./comments.js?v=moderation-4";
import { formatAnnouncementDate } from "./announcement-date.js";
const firebaseConfig = {
  apiKey: "AIzaSyDKXFI0a1H1lnWIRI-qXor45RQ5R5qAMJk",
  authDomain: "heivoli-network-408f3.firebaseapp.com",
  projectId: "heivoli-network-408f3",
  storageBucket: "heivoli-network-408f3.firebasestorage.app",
  messagingSenderId: "761703200496",
  appId: "1:761703200496:web:967e8fd7330db657ca7435",
};
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
const id = new URLSearchParams(location.search).get('id');
const status = document.querySelector('#announcement-status');
const content = document.querySelector('#announcement-content');
const discussion = document.querySelector('#discussion');
let cleanup;
onAuthStateChanged(auth, user => document.querySelector('#account-trigger').setAttribute('aria-label', user ? `Mon compte : ${user.displayName || 'Membre'}` : 'Mon compte — Connexion'));
if (!id || id.includes('/') || id.length > 1500) status.textContent = 'Cette annonce est introuvable.';
else onSnapshot(doc(db, 'announcements', id), snapshot => {
  if (!snapshot.exists()) {
    cleanup?.(); cleanup = undefined; content.replaceChildren(); discussion.replaceChildren();
    status.textContent = 'Cette annonce n’existe plus.'; return;
  }
  status.textContent = '';
  const data = snapshot.data();
  content.replaceChildren();
  for (const [tag, text, cls] of [['p', data.type, 'announcement-type'], ['h1', data.title, ''], ['p', formatAnnouncementDate(data), 'announcement-date'], ['p', data.text, 'announcement-body']]) {
    const el = document.createElement(tag); el.textContent = typeof text === 'string' ? text : ''; el.className = cls; content.append(el);
  }
  if (typeof data.imageData === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data.imageData)) {
    const image = document.createElement('img'); image.src = data.imageData; image.alt = data.title || 'Illustration de l’annonce'; image.className = 'announcement-full-image'; content.append(image);
  }
  document.title = `${data.title || 'Annonce'} — Heivoli Network`;
  if (!cleanup) cleanup = attachComments(discussion, id, { db, auth });
}, () => { status.textContent = 'Impossible de charger cette annonce. Recharge la page pour réessayer.'; });
