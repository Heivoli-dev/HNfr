import { addDoc, collection, deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";
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
  const hint = node("small", "Les commentaires sont publics · 800 caractères maximum.");
  const send = node("button", "Publier", "button button-primary");
  send.type = "submit";
  form.append(label, input, hint, send);
  panel.append(summary, list, status, login, form);
  article.append(panel);
  let active = true, unsubscribe, user = auth.currentUser, moderator = false, records = [], busy = false;
  const ref = collection(db, "announcements", announcementId, "comments");
  function render() {
    form.hidden = !user;
    login.hidden = !!user;
    list.replaceChildren();
    for (const record of records) {
      const row = node("li", "", "comment-item");
      const avatar = node("span", (record.authorName || "M").slice(0, 1).toUpperCase(), "comment-avatar");
      avatar.setAttribute("aria-hidden", "true");
      if (typeof record.authorPhotoURL === "string" && /^https:\/\/(lh[3-6]\.googleusercontent\.com|cdn\.discordapp\.com)\//.test(record.authorPhotoURL)) {
        const image = node("img");
        image.src = record.authorPhotoURL; image.alt = ""; image.loading = "lazy"; image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => image.remove());
        avatar.append(image);
      }
      row.append(avatar);
      const meta = node("div", "", "comment-meta");
      meta.append(node("strong", record.authorName || "Membre"));
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
      list.append(row);
    }
  }
  const stopAuth = onAuthStateChanged(auth, async (nextUser) => {
    user = nextUser;
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
    if (!text) { status.textContent = "Écris un commentaire avant de le publier."; input.focus(); return; }
    busy = true; send.disabled = true; input.disabled = true;
    status.textContent = "Publication en cours…";
    try {
      const { claims } = await current.getIdTokenResult();
      const authorPhotoURL = claims.discordAvatar ?? claims.picture ?? "";
      await addDoc(ref, { authorId: current.uid, authorName: claims.discordName ?? claims.name ?? "Membre", authorPhotoURL, text, createdAt: serverTimestamp() });
      input.value = "";
      status.textContent = "Commentaire publié.";
    } catch { status.textContent = "Publication impossible. Ton texte est conservé ; réessaie dans un instant."; }
    finally { busy = false; send.disabled = false; input.disabled = false; }
  });
  render();
  panel.open = true;
  return () => { active = false; unsubscribe?.(); stopAuth(); };
}
