// Menu secret façon console à deux écrans.
// Ordinateur : ↑ ↑ ↓ ↓ ← → ← → B A. Mobile : appui long sur le logo.
// Design original (aucun visuel ni son de Nintendo).
const APPS = [
  { name: "Accueil", text: "Le hub du réseau : vidéo, annonces et communauté.", href: "index.html", tone: "t-violet", icon: "M4 11 12 4l8 7v9h-5v-6H9v6H4z" },
  { name: "Annonces", text: "Les dernières nouvelles et les événements du réseau.", href: "index.html#annonces", tone: "t-yellow", icon: "M4 10v4h3l8 5V5l-8 5H4z M18 9a4 4 0 0 1 0 6" },
  { name: "Joueurs", text: "Codes ami 3DS et identifiants Pretendo des membres.", href: "joueurs.html", tone: "t-indigo", icon: "M7 8h10a4 4 0 0 1 4 4.5l-.5 3.5a2 2 0 0 1-3.5 1L15 15H9l-2 2a2 2 0 0 1-3.5-1L3 12.5A4 4 0 0 1 7 8z M8 10.5v3 M6.5 12h3 M16 11.5h.01 M17.8 13.2h.01" },
  { name: "Tickets", text: "Une discussion privée avec la modération.", href: "tickets.html", tone: "t-pink", icon: "M4 6h16v12H4z M4 7l8 6 8-6" },
  { name: "Logiciels", text: "ScreenLink 3DS et 3DS Theme Studio, à télécharger.", href: "logiciels.html", tone: "t-blue", icon: "M12 4v10 M8 10l4 4 4-4 M5 19h14" },
  { name: "Projets 3DS", text: "Les projets homebrew de la communauté.", href: "projets.html", tone: "t-green", icon: "M12 3 20 7.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12 4 7.5" },
  { name: "Réseaux", text: "Discord, Reddit, X : retrouve-nous partout.", href: "reseaux.html", tone: "t-teal", icon: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18" },
  { name: "Mon profil", text: "Ton profil, ta carte joueur et tes badges.", href: "profil.html", tone: "t-orange", icon: "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M5 20a7 7 0 0 1 14 0" },
  { name: "Discord", text: "Rejoins le serveur Heivoli Network.", href: "https://discord.gg/Z7kZ3WWZxw", tone: "t-discord", icon: "M5 5h14v10H10l-4 4v-4H5z", external: true },
];
const COLUMNS = 4;
const SLOTS = 12;
const CODE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const sound = name => document.dispatchEvent(new CustomEvent("hn-sound", { detail: name }));
const svg = (path, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

let overlay = null;
let selected = 0;
let clockTimer = null;
let lastFocus = null;

function loadStyles() {
  if (document.querySelector("link[data-menu3ds]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "menu3ds.css?v=1";
  link.dataset.menu3ds = "";
  document.head.append(link);
}

function currentIndex() {
  const page = location.pathname.split("/").pop() || "index.html";
  const found = APPS.findIndex(app => app.href === page);
  return found >= 0 ? found : 0;
}

function build() {
  overlay = document.createElement("div");
  overlay.className = "m3-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Menu Heivoli Network");
  const slots = Array.from({ length: SLOTS }, (_, i) => {
    const app = APPS[i];
    if (!app) return '<span class="m3-slot is-empty" aria-hidden="true"></span>';
    return `<button type="button" class="m3-slot m3-app ${app.tone}" data-index="${i}" data-sound="none" aria-label="${app.name}">${svg(app.icon)}</button>`;
  }).join("");
  overlay.innerHTML = `
    <div class="m3-console">
      <div class="m3-lid">
        <span class="m3-camera" aria-hidden="true"></span>
        <span class="m3-speaker is-left" aria-hidden="true"></span>
        <div class="m3-screen m3-top">
          <div class="m3-status">
            <span class="m3-wifi" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="m3-clock"></span>
            <span class="m3-battery" aria-hidden="true"><i></i></span>
          </div>
          <div class="m3-depth">
            <span class="m3-bubble b1"></span><span class="m3-bubble b2"></span><span class="m3-bubble b3"></span><span class="m3-bubble b4"></span>
            <div class="m3-banner">
              <span class="m3-banner-icon"></span>
              <div><strong class="m3-banner-title"></strong><p class="m3-banner-text"></p></div>
            </div>
          </div>
        </div>
        <span class="m3-speaker is-right" aria-hidden="true"></span>
        <span class="m3-slider" aria-hidden="true"><i></i></span>
      </div>
      <div class="m3-hinge" aria-hidden="true"><span class="m3-led"></span></div>
      <div class="m3-base">
        <div class="m3-left" aria-hidden="true">
          <span class="m3-pad"><i></i></span>
          <span class="m3-dpad"><button type="button" class="m3-d up" data-move="up" data-sound="none" tabindex="-1"></button><button type="button" class="m3-d down" data-move="down" data-sound="none" tabindex="-1"></button><button type="button" class="m3-d left" data-move="left" data-sound="none" tabindex="-1"></button><button type="button" class="m3-d right" data-move="right" data-sound="none" tabindex="-1"></button></span>
        </div>
        <div class="m3-screen m3-bottom">
          <div class="m3-toolbar" aria-hidden="true"><i class="m3-tool">☀</i><i class="m3-tool">♪</i><i class="m3-tool">✉</i><i class="m3-tool">⌂</i><i class="m3-tool is-right">▦</i></div>
          <div class="m3-grid" role="listbox" aria-label="Pages du site">${slots}</div>
          <button type="button" class="m3-open" data-sound="none">Ouvrir</button>
        </div>
        <div class="m3-right">
          <span class="m3-buttons">
            <button type="button" class="m3-btn top" data-sound="none" tabindex="-1" aria-hidden="true"></button>
            <button type="button" class="m3-btn left" data-sound="none" tabindex="-1" aria-hidden="true"></button>
            <button type="button" class="m3-btn right" data-action="open" data-sound="none" aria-label="Ouvrir"></button>
            <button type="button" class="m3-btn bottom" data-action="close" data-sound="none" aria-label="Fermer le menu"></button>
          </span>
        </div>
        <div class="m3-row">
          <button type="button" class="m3-small" data-action="close" data-sound="none" tabindex="-1" aria-hidden="true"></button>
          <button type="button" class="m3-home" data-action="home" data-sound="none" aria-label="Retour à l’accueil">${svg(APPS[0].icon)}</button>
          <button type="button" class="m3-small" data-action="open" data-sound="none" tabindex="-1" aria-hidden="true"></button>
        </div>
      </div>
    </div>
    <p class="m3-help">Flèches pour choisir · Entrée pour ouvrir · Échap pour quitter</p>`;
  document.body.append(overlay);

  overlay.addEventListener("click", event => {
    if (event.target === overlay) return close();
    const app = event.target.closest(".m3-app");
    if (app) {
      const index = Number(app.dataset.index);
      if (index === selected) launch(); else select(index, true);
      return;
    }
    const move = event.target.closest("[data-move]");
    if (move) return step(move.dataset.move);
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "open" || event.target.closest(".m3-open")) return launch();
    if (action === "close") return close();
    if (action === "home") { selected = 0; return launch(); }
  });
  // Effet de profondeur sur l'écran du haut
  overlay.addEventListener("pointermove", event => {
    const x = event.clientX / innerWidth - 0.5;
    const y = event.clientY / innerHeight - 0.5;
    overlay.style.setProperty("--m3-x", x.toFixed(3));
    overlay.style.setProperty("--m3-y", y.toFixed(3));
  });
}

function select(index, withSound) {
  selected = Math.max(0, Math.min(APPS.length - 1, index));
  const app = APPS[selected];
  overlay.querySelectorAll(".m3-app").forEach(button => {
    const active = Number(button.dataset.index) === selected;
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-selected", String(active));
    if (active) button.focus({ preventScroll: true });
  });
  const icon = overlay.querySelector(".m3-banner-icon");
  icon.className = `m3-banner-icon ${app.tone}`;
  icon.innerHTML = svg(app.icon);
  overlay.querySelector(".m3-banner-title").textContent = app.name;
  overlay.querySelector(".m3-banner-text").textContent = app.text;
  const banner = overlay.querySelector(".m3-banner");
  banner.classList.remove("is-swap");
  void banner.offsetWidth;
  banner.classList.add("is-swap");
  if (withSound) sound("tap");
}

function step(direction) {
  const delta = { left: -1, right: 1, up: -COLUMNS, down: COLUMNS }[direction] ?? 0;
  const next = selected + delta;
  if (next < 0 || next >= APPS.length) return;
  select(next, true);
}

function tick() {
  const now = new Date();
  overlay.querySelector(".m3-clock").textContent = `${now.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}  ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function launch() {
  const app = APPS[selected];
  sound("open");
  overlay.classList.add("is-launching");
  setTimeout(() => {
    if (app.external) {
      window.open(app.href, "_blank", "noopener");
      overlay.classList.remove("is-launching");
      return;
    }
    location.href = app.href;
  }, 520);
}

function onKey(event) {
  if (!overlay) return;
  const moves = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
  if (moves[event.key]) { event.preventDefault(); step(moves[event.key]); }
  else if (event.key === "Enter" || event.key === " " || event.key.toLowerCase() === "a") { event.preventDefault(); launch(); }
  else if (event.key === "Escape" || event.key.toLowerCase() === "b") { event.preventDefault(); close(); }
  else if (event.key === "Tab") { event.preventDefault(); step(event.shiftKey ? "left" : "right"); }
}

export function open() {
  if (overlay) return;
  loadStyles();
  lastFocus = document.activeElement;
  build();
  document.documentElement.classList.add("m3-lock");
  select(currentIndex(), false);
  tick();
  clockTimer = setInterval(tick, 15000);
  document.addEventListener("keydown", onKey, true);
  requestAnimationFrame(() => overlay.classList.add("is-on"));
  sound("success");
}

function close() {
  if (!overlay) return;
  const closing = overlay;
  overlay = null;
  clearInterval(clockTimer);
  document.removeEventListener("keydown", onKey, true);
  closing.classList.remove("is-on");
  document.documentElement.classList.remove("m3-lock");
  setTimeout(() => closing.remove(), 280);
  sound("tap");
  lastFocus?.focus?.({ preventScroll: true });
}

// Code secret au clavier
let progress = 0;
document.addEventListener("keydown", event => {
  if (overlay || event.target.closest?.("input, textarea, select, [contenteditable]")) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  progress = key === CODE[progress] ? progress + 1 : key === CODE[0] ? 1 : 0;
  if (progress === CODE.length) { progress = 0; open(); }
});

// Appui long sur le logo (mobile)
const brand = document.querySelector(".brand");
if (brand) {
  let timer = null;
  let opened = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  brand.addEventListener("touchstart", () => {
    opened = false;
    timer = setTimeout(() => { opened = true; navigator.vibrate?.(30); open(); }, 650);
  }, { passive: true });
  ["touchend", "touchmove", "touchcancel"].forEach(type => brand.addEventListener(type, cancel, { passive: true }));
  brand.addEventListener("click", event => { if (opened) { event.preventDefault(); opened = false; } });
  brand.addEventListener("contextmenu", event => { if (timer || opened) event.preventDefault(); });
}
