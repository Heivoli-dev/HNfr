import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";
import { GAMES, badgesFor, renderPlayerCard } from "./players-ui.js?v=avatar-1";
import { setupPlayerCard } from "./player-card.js?v=avatar-1";

const firebaseConfig = {
  apiKey: "AIzaSyDKXFI0a1H1lnWIRI-qXor45RQ5R5qAMJk",
  authDomain: "heivoli-network-408f3.firebaseapp.com",
  projectId: "heivoli-network-408f3",
  storageBucket: "heivoli-network-408f3.firebasestorage.app",
  messagingSenderId: "761703200496",
  appId: "1:761703200496:web:967e8fd7330db657ca7435",
};
const CREATOR_EMAIL = "heivolipro@gmail.com";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const locked = document.querySelector("#players-locked");
const content = document.querySelector("#players-content");
const grid = document.querySelector("#players-grid");
const status = document.querySelector("#players-status");
const search = document.querySelector("#player-search");
const gameSelect = document.querySelector("#player-game");
const chips = [...document.querySelectorAll(".filter-chip")];
const calloutTitle = document.querySelector("#callout-title");
const calloutText = document.querySelector("#callout-text");
const calloutButton = document.querySelector("#callout-button");

GAMES.forEach(game => gameSelect.append(new Option(game, game)));
const playerCard = setupPlayerCard({ db, onChange: () => currentUser && load(currentUser) });
calloutButton.addEventListener("click", () => playerCard.focus());

let players = [];
let members = new Map();
let currentUser = null;
let isModerator = false;
let filter = "all";

function draw() {
  grid.replaceChildren();
  document.querySelector("#count-all").textContent = players.length;
  document.querySelector("#count-3ds").textContent = players.filter(p => p.friendCode).length;
  document.querySelector("#count-pnid").textContent = players.filter(p => p.pnid).length;
  const text = search.value.trim().toLowerCase();
  const game = gameSelect.value;
  const visible = players.filter(player =>
    (filter === "all" || player[filter])
    && (!game || player.games?.includes(game))
    && (!text || [player.displayName, player.lookingFor, player.pnid, ...(player.games || [])].some(value => String(value || "").toLowerCase().includes(text))));
  status.hidden = visible.length > 0;
  if (!players.length) status.textContent = "Personne n’a encore créé sa carte joueur. Sois le premier !";
  else if (!visible.length) status.textContent = "Aucun joueur ne correspond à ta recherche.";
  for (const player of visible) {
    const mine = player.uid === currentUser?.uid;
    grid.append(renderPlayerCard(player, { mine, badges: badgesFor(members.get(player.uid), player), onRemove: isModerator && !mine ? removeCard : undefined }));
  }
}

async function removeCard(player, button) {
  if (!confirm(`Retirer la carte joueur de ${player.displayName || "ce membre"} ?`)) return;
  button.disabled = true;
  try {
    await deleteDoc(doc(db, "players", player.uid));
    players = players.filter(item => item.uid !== player.uid);
    draw();
  } catch {
    button.disabled = false;
    button.textContent = "Suppression impossible";
  }
}

async function checkModerator(user) {
  const claims = (await user.getIdTokenResult()).claims;
  const email = user.emailVerified && !claims.discordId ? (user.email || "").toLowerCase() : "";
  if (!email) return false;
  if (email === CREATOR_EMAIL) return true;
  try { return (await getDoc(doc(db, "admins", email))).exists(); } catch { return false; }
}

async function load(user) {
  status.hidden = false;
  status.textContent = "Chargement des joueurs…";
  try {
    const [snapshot, memberSnapshot] = await Promise.all([
      getDocs(collection(db, "players")),
      getDocs(collection(db, "members")).catch(() => null),
    ]);
    members = new Map((memberSnapshot?.docs || []).map(item => [item.id, item.data()]));
    if (auth.currentUser !== user) return;
    players = snapshot.docs.map(item => ({ ...item.data(), uid: item.id }));
    players.sort((a, b) => (a.uid === user.uid ? -1 : b.uid === user.uid ? 1 : 0)
      || (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
    const mine = players.some(player => player.uid === user.uid);
    calloutTitle.textContent = mine ? "Ta carte est en ligne" : "Ta carte joueur";
    calloutText.textContent = mine ? "Change tes codes, tes jeux ou ce que tu cherches." : "Ajoute ton code ami et ton identifiant Pretendo en quelques secondes.";
    calloutButton.textContent = mine ? "Modifier ma carte" : "Créer ma carte";
    draw();
  } catch (error) {
    status.textContent = error.code === "permission-denied"
      ? "Ton compte n’a pas accès aux cartes joueur. Reconnecte-toi puis réessaie."
      : "Impossible de charger les joueurs. Vérifie ta connexion puis recharge la page.";
  }
}

chips.forEach(chip => chip.addEventListener("click", () => {
  filter = chip.dataset.filter;
  chips.forEach(other => other.classList.toggle("is-active", other === chip));
  draw();
}));
search.addEventListener("input", draw);
gameSelect.addEventListener("change", draw);

onAuthStateChanged(auth, async user => {
  currentUser = user;
  players = [];
  grid.replaceChildren();
  locked.hidden = Boolean(user);
  content.hidden = !user;
  document.querySelector("#account-trigger")?.setAttribute("aria-label", user ? `Mon compte : ${user.displayName || "Membre"}` : "Mon compte — Connexion");
  if (!user) { playerCard.hide(); return; }
  playerCard.show(user).then(() => { if (document.activeElement?.closest?.("#carte-joueur") === null && !location.hash.includes("carte")) document.querySelector("#carte-joueur").hidden = true; });
  isModerator = await checkModerator(user);
  if (auth.currentUser !== user) return;
  load(user);
});
