import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";
export function safeProfilePhoto(value) {
  return typeof value === 'string' && /^https:\/\/(i\.ibb\.co|lh[3-6]\.googleusercontent\.com|cdn\.discordapp\.com)\/[^\s]+$/.test(value) ? value : '';
}
const cache = new Map();
export function profileIdentity(db, uid, fallback = 'Membre', fallbackPhoto = '') {
  const link = document.createElement('a');
  link.className = 'member-profile-link'; link.href = `profil.html?uid=${encodeURIComponent(uid)}`;
  const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.hidden = true;
  const initial = document.createElement('span'); initial.className = 'member-initial';
  const name = document.createElement('span'); name.textContent = fallback; initial.textContent = fallback.slice(0,1).toUpperCase();
  image.addEventListener('error', () => { image.hidden = true; initial.hidden = false; });
  const originalPhoto = safeProfilePhoto(fallbackPhoto);
  if (originalPhoto) { image.src = originalPhoto; image.hidden = false; initial.hidden = true; }
  link.append(image,initial,name);
  if (!cache.has(uid)) cache.set(uid, getDoc(doc(db,'profiles',uid)).then(s => s.exists() ? s.data() : null).catch(() => null));
  cache.get(uid).then(data => {
    if (!data) return;
    name.textContent = data.displayName || fallback; initial.textContent = name.textContent.slice(0,1).toUpperCase();
    const photo = safeProfilePhoto(data.photoURL);
    if (photo) { image.src = photo; image.hidden = false; initial.hidden = true; }
  });
  return link;
}
