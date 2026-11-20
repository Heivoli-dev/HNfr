// Formulaire « Ma carte joueur » sur la page Profil.
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";
import { commentModerationError } from "./comment-moderation.js";
import { GAMES, MAX_GAMES, formatFriendCode, renderPlayerCard, safePhoto, validFriendCode, validPnid } from "./players-ui.js?v=avatar-2";

// Même logique que la règle /players : le pseudo et la photo viennent du profil, sinon du compte Google/Discord.
const sound = name => document.dispatchEvent(new CustomEvent("hn-sound", { detail: name }));

export async function accountIdentity(db, user) {
  const claims = (await user.getIdTokenResult()).claims;
  const profile = await getDoc(doc(db, "profiles", user.uid)).catch(() => null);
  if (profile?.exists()) {
    const data = profile.data();
    return { displayName: data.displayName, photoURL: safePhoto(data.photoURL) };
  }
  return {
    displayName: claims.discordName ?? claims.name ?? "Membre",
    photoURL: safePhoto(claims.discordAvatar ?? claims.picture ?? ""),
  };
}

export function setupPlayerCard({ db, onChange } = {}) {
  const section = document.querySelector("#carte-joueur");
  const form = document.querySelector("#player-form");
  const friendCode = document.querySelector("#player-friend-code");
  const pnid = document.querySelector("#player-pnid");
  const lookingFor = document.querySelector("#player-looking-for");
  const gameBox = document.querySelector("#player-games");
  const preview = document.querySelector("#player-preview");
  const status = document.querySelector("#player-status");
  const removeButton = document.querySelector("#player-remove");
  const saveButton = document.querySelector("#player-save");
  let user = null;
  let identity = { displayName: "Membre", photoURL: "" };
  let exists = false;

  GAMES.forEach(game => {
    const label = document.createElement("label");
    label.className = "game-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = game;
    const text = document.createElement("span");
    text.textContent = game;
    label.append(input, text);
    gameBox.append(label);
  });
  const gameInputs = () => [...gameBox.querySelectorAll("input")];
  const selectedGames = () => gameInputs().filter(input => input.checked).map(input => input.value);

  function current() {
    return {
      uid: user?.uid,
      ...identity,
      friendCode: friendCode.value.trim(),
      pnid: pnid.value.trim(),
      lookingFor: lookingFor.value.trim(),
      games: selectedGames(),
    };
  }
  function refreshPreview() {
    const data = current();
    const card = renderPlayerCard({
      ...data,
      uid: undefined,
      friendCode: validFriendCode(data.friendCode) ? data.friendCode : "",
      pnid: validPnid(data.pnid) ? data.pnid : "",
    });
    card.classList.add("is-preview");
    const label = document.createElement("span");
    label.className = "preview-label";
    label.textContent = "Aperçu";
    card.append(label);
    preview.replaceChildren(card);
    const full = selectedGames().length >= MAX_GAMES;
    gameInputs().forEach(input => { input.disabled = full && !input.checked; });
  }

  friendCode.addEventListener("input", () => { friendCode.value = formatFriendCode(friendCode.value); refreshPreview(); });
  [pnid, lookingFor].forEach(field => field.addEventListener("input", refreshPreview));
  gameBox.addEventListener("change", refreshPreview);

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!user) return;
    const data = current();
    if (!data.friendCode && !data.pnid) { status.textContent = "Remplis au moins ton code ami 3DS ou ton identifiant Pretendo."; sound("error"); return; }
    if (data.friendCode && !validFriendCode(data.friendCode)) { status.textContent = "Le code ami doit contenir 12 chiffres (0000-0000-0000)."; sound("error"); return; }
    if (data.pnid && !validPnid(data.pnid)) { status.textContent = "L’identifiant Pretendo doit faire 6 à 16 caractères : lettres, chiffres, tiret, point ou tiret bas."; sound("error"); return; }
    if (data.lookingFor && commentModerationError(data.lookingFor)) { status.textContent = "« Je cherche » doit rester sans insultes ni liens."; sound("error"); return; }
    saveButton.disabled = true;
    status.textContent = "Enregistrement…";
    try {
      identity = await accountIdentity(db, user);
      await setDoc(doc(db, "players", user.uid), {
        displayName: identity.displayName,
        photoURL: identity.photoURL,
        friendCode: data.friendCode,
        pnid: data.pnid,
        lookingFor: data.lookingFor,
        games: data.games,
        updatedAt: serverTimestamp(),
      });
      exists = true;
      removeButton.hidden = false;
      status.textContent = "Carte enregistrée ! Elle est visible sur la page Joueurs.";
      sound("success");
      refreshPreview();
      onChange?.();
    } catch {
      status.textContent = "Enregistrement impossible. Vérifie ta connexion ; un compte banni ne peut pas créer de carte.";
      sound("error");
    } finally {
      saveButton.disabled = false;
    }
  });

  removeButton.addEventListener("click", async () => {
    if (!user || !exists || !confirm("Retirer ta carte joueur de la page Joueurs ?")) return;
    removeButton.disabled = true;
    try {
      await deleteDoc(doc(db, "players", user.uid));
      exists = false;
      removeButton.hidden = true;
      form.reset();
      status.textContent = "Ta carte a été retirée.";
      refreshPreview();
      onChange?.();
    } catch {
      status.textContent = "Impossible de retirer ta carte pour l’instant.";
    } finally {
      removeButton.disabled = false;
    }
  });

  return {
    async show(signedInUser) {
      user = signedInUser;
      section.hidden = false;
      status.textContent = "";
      try {
        identity = await accountIdentity(db, user);
        const snapshot = await getDoc(doc(db, "players", user.uid));
        exists = snapshot.exists();
        const data = exists ? snapshot.data() : {};
        friendCode.value = data.friendCode || "";
        pnid.value = data.pnid || "";
        lookingFor.value = data.lookingFor || "";
        gameInputs().forEach(input => { input.checked = (data.games || []).includes(input.value); });
        removeButton.hidden = !exists;
      } catch {
        status.textContent = "Impossible de charger ta carte joueur.";
      }
      refreshPreview();
      if (location.hash === "#carte-joueur") section.scrollIntoView({ behavior: "smooth" });
    },
    get exists() { return exists; },
    focus() { section.hidden = false; section.scrollIntoView({ behavior: "smooth", block: "start" }); friendCode.focus({ preventScroll: true }); },
    hide() { user = null; section.hidden = true; },
    // Appelé après l’enregistrement du profil : garde le pseudo et la photo de la carte à jour.
    profileBatch(batch, displayName, photoURL) {
      if (!user || !exists) return;
      identity = { displayName, photoURL: safePhoto(photoURL) };
      batch.update(doc(db, "players", user.uid), { displayName, photoURL: identity.photoURL, updatedAt: serverTimestamp() });
    },
    refresh: refreshPreview,
  };
}
