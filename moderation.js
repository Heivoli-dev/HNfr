// Fenêtre de modération en un clic : avertir, bannir, débannir, note privée + historique du membre.
// Utilisée depuis les profils, les cartes joueur, les commentaires, les tickets et l'Administration.
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, Timestamp, where, writeBatch } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";
import { networkRequest } from "./network-access.js";

const PRESETS = ["Insultes ou propos haineux", "Spam ou publicité", "Contenu inapproprié", "Harcèlement", "Arnaque ou triche", "Faux compte"];
const DURATIONS = [["1", "1 h"], ["24", "24 h"], ["168", "7 jours"], ["720", "30 jours"], ["permanent", "Définitif"]];
const TYPES = { warning: "Avertissement", ban: "Bannissement", unban: "Débannissement", note: "Note privée" };
const sound = name => document.dispatchEvent(new CustomEvent("hn-sound", { detail: name }));
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const when = ms => new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function loadStyles() {
  if (document.querySelector("link[data-moderation]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "moderation.css?v=1";
  link.dataset.moderation = "";
  document.head.append(link);
}

let current = null;

/**
 * @param {{ db, auth, uid: string, name?: string, action?: "warning"|"ban"|"note" }} options
 */
export function openModeration({ db, auth, uid, name = "", action = "warning" }) {
  if (!uid || current) return;
  loadStyles();
  const me = auth.currentUser;
  const self = me?.uid === uid;
  let banned = null;
  let mode = action;
  let duration = "24";

  const overlay = el("div", "mod-overlay");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `Modérer ${name || "ce membre"}`);
  const box = el("div", "mod-box");
  const close = el("button", "mod-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Fermer");

  const head = el("div", "mod-head");
  const title = el("h2", "", name || "Membre");
  const idLine = el("p", "mod-id");
  const idCode = el("code", "", uid);
  const copy = el("button", "mod-link", "Copier l’identifiant");
  copy.type = "button";
  copy.dataset.sound = "none";
  copy.addEventListener("click", () => navigator.clipboard?.writeText(uid).then(() => { copy.textContent = "Copié !"; sound("copy"); }));
  idLine.append(idCode, copy);
  const state = el("p", "mod-state", "Chargement…");
  const eyebrow = el("p", "eyebrow");
  eyebrow.append(el("span"), document.createTextNode(" Modération"));
  head.append(eyebrow, title, idLine, state);

  const tabs = el("div", "mod-tabs");
  tabs.setAttribute("role", "tablist");
  const tabButtons = {};
  for (const [key, label] of [["warning", "Avertir"], ["ban", "Bannir"], ["note", "Note privée"], ["unban", "Débannir"]]) {
    const button = el("button", "mod-tab", label);
    button.type = "button";
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => setMode(key));
    tabButtons[key] = button;
    tabs.append(button);
  }

  const form = el("form", "mod-form");
  const hint = el("p", "mod-hint");
  const presetRow = el("div", "mod-chips");
  const reason = el("textarea");
  reason.maxLength = 500;
  reason.required = true;
  reason.rows = 3;
  reason.setAttribute("aria-label", "Motif");
  PRESETS.forEach(text => {
    const chip = el("button", "mod-chip", text);
    chip.type = "button";
    chip.addEventListener("click", () => { reason.value = text; reason.focus(); });
    presetRow.append(chip);
  });
  const durationRow = el("div", "mod-chips mod-durations");
  const durationButtons = DURATIONS.map(([value, label]) => {
    const chip = el("button", "mod-chip", label);
    chip.type = "button";
    chip.addEventListener("click", () => { duration = value; durationButtons.forEach(b => b.classList.toggle("is-active", b === chip)); });
    if (value === duration) chip.classList.add("is-active");
    durationRow.append(chip);
    return chip;
  });
  const networkLabel = el("label", "mod-check");
  const network = el("input");
  network.type = "checkbox";
  networkLabel.append(network, document.createTextNode(" Bannir aussi sa dernière connexion (adresse IP) — peut toucher d’autres personnes sur le même réseau"));
  const status = el("p", "mod-status");
  status.setAttribute("role", "status");
  const submit = el("button", "mod-submit", "Valider");
  submit.type = "submit";
  form.append(hint, presetRow, reason, durationRow, networkLabel, status, submit);

  const historyTitle = el("h3", "", "Historique");
  const history = el("ol", "mod-history");
  history.append(el("li", "mod-empty", "Chargement…"));

  box.append(close, head, tabs, form, historyTitle, history);
  overlay.append(box);
  document.body.append(overlay);
  document.documentElement.classList.add("m3-lock");
  requestAnimationFrame(() => overlay.classList.add("is-on"));

  function setMode(next) {
    mode = next;
    Object.entries(tabButtons).forEach(([key, button]) => {
      button.classList.toggle("is-active", key === mode);
      button.setAttribute("aria-selected", String(key === mode));
    });
    const banMode = mode === "ban";
    durationRow.hidden = !banMode;
    networkLabel.hidden = !banMode;
    presetRow.hidden = mode === "note" || mode === "unban";
    hint.textContent = {
      warning: "Le membre verra cet avertissement à sa prochaine visite. Rien n’est bloqué.",
      ban: "Le membre ne pourra plus commenter, écrire de ticket ni modifier son profil ou sa carte. Il verra le motif et pourra contester.",
      note: "Visible uniquement par la modération. Pratique pour garder une trace.",
      unban: "Le membre retrouve immédiatement l’accès complet au site.",
    }[mode];
    reason.placeholder = mode === "note" ? "Ta note…" : mode === "unban" ? "Raison du débannissement (ex. contestation acceptée)" : "Motif visible par le membre";
    submit.textContent = { warning: "Envoyer l’avertissement", ban: "Bannir le membre", note: "Enregistrer la note", unban: "Débannir le membre" }[mode];
    submit.classList.toggle("is-danger", banMode);
    reason.maxLength = mode === "note" ? 500 : 300; // le motif d'un ban est limité à 300 caractères
    status.textContent = "";
  }

  function refreshState() {
    tabButtons.unban.hidden = !banned;
    tabButtons.ban.textContent = banned ? "Modifier le ban" : "Bannir";
    if (banned) {
      const until = banned.expiresAt?.toMillis?.();
      state.textContent = `⛔ Banni ${until ? `jusqu’au ${when(until)}` : "définitivement"} · ${banned.reason}`;
      state.className = "mod-state is-banned";
    } else {
      state.textContent = "✓ Aucun bannissement en cours";
      state.className = "mod-state is-ok";
    }
    if (mode === "unban" && !banned) setMode("warning");
  }

  async function loadHistory() {
    try {
      const snapshot = await getDocs(query(collection(db, "sanctions"), where("uid", "==", uid)));
      const items = snapshot.docs.map(item => item.data()).sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      history.replaceChildren();
      if (!items.length) history.append(el("li", "mod-empty", "Aucune sanction ni note pour ce membre."));
      for (const item of items) {
        const row = el("li", `mod-entry is-${item.type}`);
        const top = el("p", "mod-entry-top");
        top.append(el("strong", "", TYPES[item.type] || item.type));
        const until = item.expiresAt?.toMillis?.();
        if (item.type === "ban") top.append(el("span", "", until ? `jusqu’au ${when(until)}` : "définitif"));
        top.append(el("time", "", item.createdAt?.toMillis ? when(item.createdAt.toMillis()) : ""));
        row.append(top, el("p", "", item.reason));
        if (item.createdByName) row.append(el("p", "mod-by", `par ${item.createdByName}`));
        history.append(row);
      }
    } catch {
      history.replaceChildren(el("li", "mod-empty", "Historique indisponible."));
    }
  }

  const stopBan = onSnapshot(doc(db, "bans", uid), snapshot => {
    const data = snapshot.data();
    const until = data?.expiresAt?.toMillis?.();
    banned = snapshot.exists() && (data.expiresAt === null || until > Date.now()) ? data : null;
    refreshState();
  }, () => { state.textContent = "Statut indisponible."; });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const text = reason.value.trim();
    if (self) { status.textContent = "Tu ne peux pas te sanctionner toi-même."; return; }
    if (!text) { status.textContent = "Indique un motif."; sound("error"); return; }
    submit.disabled = true;
    status.textContent = "Enregistrement…";
    const entry = { uid, type: mode, reason: text, name: (name || "").slice(0, 120), createdAt: serverTimestamp(), createdBy: me.uid, createdByName: (me.displayName || "Modération").slice(0, 120) };
    try {
      if (mode === "ban") {
        const expiresAt = duration === "permanent" ? null : Timestamp.fromMillis(Date.now() + Number(duration) * 3600000);
        if (network.checked) {
          await networkRequest(auth, "network-ban", { uid, reason: text, hours: duration === "permanent" ? "permanent" : Number(duration) });
          await setDoc(doc(collection(db, "sanctions")), { ...entry, expiresAt });
        } else {
          const batch = writeBatch(db);
          batch.set(doc(db, "bans", uid), { reason: text, expiresAt, createdAt: serverTimestamp(), createdBy: me.uid });
          batch.set(doc(collection(db, "sanctions")), { ...entry, expiresAt });
          await batch.commit();
        }
        status.textContent = "Membre banni. Il voit maintenant l’écran de bannissement.";
      } else if (mode === "unban") {
        const batch = writeBatch(db);
        batch.delete(doc(db, "bans", uid));
        batch.set(doc(collection(db, "sanctions")), entry);
        await batch.commit();
        status.textContent = "Membre débanni.";
      } else {
        await setDoc(doc(collection(db, "sanctions")), entry);
        status.textContent = mode === "warning" ? "Avertissement envoyé." : "Note enregistrée.";
      }
      reason.value = "";
      sound("success");
      loadHistory();
    } catch (error) {
      status.textContent = error?.message && !error.code ? error.message : "Action refusée. Vérifie tes droits de modération.";
      sound("error");
    } finally {
      submit.disabled = false;
    }
  });

  function finish() {
    stopBan();
    document.removeEventListener("keydown", onKey, true);
    overlay.classList.remove("is-on");
    document.documentElement.classList.remove("m3-lock");
    setTimeout(() => overlay.remove(), 220);
    current = null;
  }
  const onKey = event => { if (event.key === "Escape") { event.preventDefault(); finish(); } };
  document.addEventListener("keydown", onKey, true);
  close.addEventListener("click", finish);
  overlay.addEventListener("click", event => { if (event.target === overlay) finish(); });

  current = { finish };
  setMode(action);
  loadHistory();
  if (self) { status.textContent = "C’est ton propre compte."; submit.disabled = true; }
  setTimeout(() => reason.focus(), 80);
  return current;
}

// Bouton « Modérer » réutilisable
export function moderateButton(label, options) {
  const button = el("button", "moderate-button", label);
  button.type = "button";
  button.addEventListener("click", () => openModeration(options()));
  return button;
}

// Recherche de membres (pseudo ou identifiant) pour l'Administration.
export async function listMembers(db) {
  const snapshot = await getDocs(collection(db, "members"));
  return snapshot.docs.map(item => ({ uid: item.id, ...item.data() }));
}

