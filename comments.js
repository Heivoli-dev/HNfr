import { profileIdentity } from './profiles.js';
import { collection, deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";
import { commentModerationError } from "./comment-moderation.js";
import { watchBan } from './ban-status.js';
import { authorizeWrite } from './network-access.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";

const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
};

export function attachComments(article, announcementId, { db, auth }) {
  const panel = node("details", "", "comments");
  const summary = node("summary", "Commentaires");
  const list = node("ul", "", "comment-list");
  const status = node("p", "", "comment-status");
  status.setAttribute("role", "status");
  const login = node("a", "Se connecter pour écrire un commentaire", "comment-login");
  login.href = "profil.html";
  const form = node("form", "", "comment-form");
  const label = node("label", "Ton commentaire");
  const input = node("textarea");
  input.id = `comment-${announcementId}`;
  input.maxLength = 800;
  input.required = true;
  input.rows = 3;
  input.placeholder = "Partage ton avis avec la communauté…";
  label.htmlFor = input.id;
  const hint = node("small", "Commentaires publics · 800 caractères maximum · Sans insultes ni liens · 30 secondes entre deux envois. La connexion est vérifiée pour limiter les contournements de bannissement.");
  const send = node("button", "Publier", "button button-primary");
  send.type = "submit";
  form.append(label, input, hint, send);
  panel.append(summary, list, status, login, form);
  article.append(panel);
  let active = true, unsubscribe, user = auth.currentUser, moderator = false, records = [], busy = false;
  let stopBan, blocked = true;
  const banNotice = node('p', '', 'comment-status'); banNotice.setAttribute('role', 'status');
  panel.insertBefore(banNotice, form);
  const ref = collection(db, "announcements", announcementId, "comments");
  function render() {
    form.hidden = !user || blocked;
    login.hidden = !!user;
    list.replaceChildren();
    for (const record of records) {
      const row = node("li", "", "comment-item");
      const meta = node("div", "", "comment-meta");
      meta.append(profileIdentity(db, record.authorId, record.authorName || "Membre", record.authorPhotoURL));
      const date = record.createdAt?.toDate?.();
      if (date) {
        const time = node("time", new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(date));
        time.dateTime = date.toISOString();
        meta.append(time);
      }
      row.append(meta, node("p", record.text, "comment-text"));
      if (user && (record.authorId === user.uid || moderator)) {
        const remove = node("button", "Supprimer", "comment-delete");
        remove.type = "button";
        remove.addEventListener("click", async () => {
          if (!window.confirm("Supprimer ce commentaire ?")) return;
          remove.disabled = true;
          try { await deleteDoc(doc(ref, record.id)); }
          catch { status.textContent = "Suppression impossible. Vérifie ta connexion et réessaie."; remove.disabled = false; }
        });
        row.append(remove);
      }
      if (moderator && record.authorId !== user?.uid) {
        const ban = node('a', 'Bannir ce compte', 'comment-delete');
        ban.href = `admin.html?ban=${encodeURIComponent(record.authorId)}`; row.append(ban);
      }
      list.append(row);
    }
  }
  const stopAuth = onAuthStateChanged(auth, async (nextUser) => {
    stopBan?.(); stopBan = undefined; blocked = true; banNotice.textContent = '';
    user = nextUser;
    if (user) stopBan = watchBan(db, user, state => { blocked = state.blocked; banNotice.textContent = state.message; render(); });
    moderator = !!user?.emailVerified && user.email === "heivolipro@gmail.com";
    render();
    if (user?.emailVerified && user.email && !moderator) {
      const uid = user.uid;
      try {
        const admin = await getDoc(doc(db, "admins", user.email));
        if (active && user?.uid === uid) { moderator = admin.exists(); render(); }
      } catch { /* Membership does not depend on moderator access. */ }
    }
  });
  panel.addEventListener("toggle", () => {
    if (!panel.open) { unsubscribe?.(); unsubscribe = undefined; return; }
    if (unsubscribe) return;
    status.textContent = "Chargement des commentaires…";
    unsubscribe = onSnapshot(query(ref, orderBy("createdAt", "desc"), limit(50)), snapshot => {
      records = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      status.textContent = records.length === 0 ? "Aucun commentaire pour le moment. Lance la discussion !" : records.length === 50 ? "Les 50 commentaires les plus récents sont affichés." : "";
      render();
    }, () => { status.textContent = "Les commentaires sont indisponibles. Referme puis rouvre cette section pour réessayer."; unsubscribe?.(); unsubscribe = undefined; });
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const current = auth.currentUser;
    const text = input.value.trim();
    if (!current) { status.textContent = "Connecte-toi pour publier un commentaire."; return; }
    if (blocked) { status.textContent = banNotice.textContent; return; }
    const moderationError = commentModerationError(text);
    if (moderationError) { status.textContent = moderationError; input.focus(); return; }
    busy = true; send.disabled = true; input.disabled = true;
    status.textContent = "Publication en cours…";
    try {
      const { claims } = await current.getIdTokenResult();
      const authorPhotoURL = claims.discordAvatar ?? claims.picture ?? "";
      const throttleRef = doc(db, "commentThrottle", current.uid);
      const previous = await getDoc(throttleRef);
      if (previous.exists()) {
        const data = previous.data();
        const elapsed = Date.now() - (data.createdAt?.toMillis?.() || 0);
        if (elapsed < 30000) { status.textContent = `Attends encore ${Math.max(1, Math.ceil((30000 - elapsed) / 1000))} secondes avant de commenter.`; return; }
        if (data.lastText === text.toLowerCase()) { status.textContent = "Ce commentaire est identique à ton dernier message. Évite les doublons."; return; }
      }
      const commentRef = doc(ref);
      const batch = writeBatch(db);
      const networkPermit = await authorizeWrite(auth, db, batch, 'comment', `${announcementId}/${commentRef.id}`);
      batch.set(commentRef, { authorId: current.uid, authorName: claims.discordName ?? claims.name ?? "Membre", authorPhotoURL, text, createdAt: serverTimestamp(), networkPermit });
      batch.set(throttleRef, { createdAt: serverTimestamp(), lastText: text.toLowerCase(), commentId: commentRef.id, announcementId });
      await batch.commit();
      input.value = "";
      status.textContent = "Commentaire publié.";
    } catch (error) { status.textContent = error.code === "permission-denied" ? "Envoi refusé. Respecte les règles des commentaires et attends 30 secondes avant de réessayer. Ton texte est conservé." : error.message || "Publication impossible. Ton texte est conservé ; réessaie dans un instant."; }
    finally { busy = false; send.disabled = false; input.disabled = false; }
  });
  render();
  panel.open = true;
  return () => { active = false; unsubscribe?.(); stopBan?.(); stopAuth(); };
}
