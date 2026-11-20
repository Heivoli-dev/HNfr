// Sons du site : petits sons originaux générés par le navigateur (Web Audio), activés par défaut.
// Les autres scripts peuvent jouer un son avec : document.dispatchEvent(new CustomEvent("hn-sound", { detail: "success" }))
const STORAGE_KEY = "hn-sounds";
const INTRO_KEY = "hn-sounds-intro";
const VOLUME = 0.5;
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ } },
};
let enabled = store.get(STORAGE_KEY) !== "off";
let context;

function audio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  context ??= new AudioContext();
  if (context.state === "suspended") context.resume();
  return context;
}
function note(freq, start, length = 0.18, gain = 0.22, type = "sine") {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const out = a.createGain();
  out.connect(a.destination);
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(gain * VOLUME, t + 0.008);
  out.gain.exponentialRampToValueAtTime(0.0001, t + length);
  for (const [mult, level] of [[1, 1], [2, 0.18], [3.01, 0.06]]) {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = mult === 1 ? type : "sine";
    osc.frequency.setValueAtTime(freq * mult, t);
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }
}
function glide(from, to, start, length, gain = 0.18) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const out = a.createGain();
  const osc = a.createOscillator();
  out.connect(a.destination);
  osc.connect(out);
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + length);
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(gain * VOLUME, t + 0.01);
  out.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.start(t);
  osc.stop(t + length + 0.05);
}
const SOUNDS = {
  tap: () => note(1760, 0, 0.07, 0.16),
  tab: () => { glide(880, 1320, 0, 0.09, 0.14); note(1975.5, 0.05, 0.16, 0.12); },
  open: () => { note(1046.5, 0, 0.12, 0.16); note(1568, 0.07, 0.2, 0.14); },
  copy: () => { note(2093, 0, 0.06, 0.14); note(2637, 0.07, 0.1, 0.12); },
  success: () => [1046.5, 1318.5, 1568, 2093].forEach((f, i) => note(f, i * 0.07, 0.32, 0.15)),
  error: () => { note(392, 0, 0.16, 0.2, "triangle"); note(311.1, 0.13, 0.24, 0.2, "triangle"); },
};
export function play(name) {
  if (!enabled || !SOUNDS[name]) return;
  try { SOUNDS[name](); } catch { /* audio indisponible */ }
}
document.addEventListener("hn-sound", event => play(event.detail));

// Bouton haut-parleur dans la barre d'onglets
const ICON_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="m16 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const nav = document.querySelector(".site-nav");
let toggle;
function render() {
  if (!toggle) return;
  toggle.classList.toggle("is-off", !enabled);
  toggle.setAttribute("aria-pressed", String(enabled));
  toggle.setAttribute("aria-label", enabled ? "Sons du site : activés. Cliquer pour couper." : "Sons du site : coupés. Cliquer pour activer.");
  toggle.title = enabled ? "Couper les sons" : "Activer les sons";
  toggle.innerHTML = enabled ? ICON_ON : ICON_OFF;
}
function setEnabled(value) {
  enabled = value;
  store.set(STORAGE_KEY, value ? "on" : "off");
  render();
}
if (nav) {
  toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "sound-toggle";
  toggle.dataset.sound = "none";
  toggle.addEventListener("click", () => { setEnabled(!enabled); if (enabled) play("open"); });
  nav.append(toggle);
  render();
}

// Message à la première visite
if (nav && !store.get(INTRO_KEY)) {
  const toast = document.createElement("div");
  toast.className = "sound-toast";
  toast.setAttribute("role", "status");
  const icon = document.createElement("span");
  icon.className = "sound-toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = ICON_ON;
  const text = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = "Les sons sont activés";
  const body = document.createElement("p");
  body.textContent = "De petits sons accompagnent tes clics. Tu peux les couper avec le haut-parleur, en haut.";
  text.append(title, body);
  const actions = document.createElement("div");
  actions.className = "sound-toast-actions";
  const mute = document.createElement("button");
  mute.type = "button";
  mute.className = "sound-toast-mute";
  mute.dataset.sound = "none";
  mute.textContent = "Couper";
  const ok = document.createElement("button");
  ok.type = "button";
  ok.className = "sound-toast-ok";
  ok.textContent = "OK";
  actions.append(mute, ok);
  toast.append(icon, text, actions);
  const close = () => { store.set(INTRO_KEY, "1"); toast.remove(); };
  ok.addEventListener("click", close);
  mute.addEventListener("click", () => { setEnabled(false); close(); });
  document.body.append(toast);
}

// Sons automatiques sur les clics
function soundFor(target) {
  const element = target.closest("a, button, summary, input[type=checkbox], input[type=radio], select, label.game-check");
  if (!element || element.dataset.sound === "none") return null;
  if (element.dataset.sound) return element.dataset.sound;
  if (element.matches(".site-nav a")) return "tab";
  if (element.matches(".copy-button")) return null; // joué par le script de copie
  if (element.matches("summary") || element.matches("[aria-expanded]")) return "open";
  if (element.matches("button:disabled")) return null;
  return "tap";
}
document.addEventListener("click", event => {
  const name = soundFor(event.target);
  if (!name) return;
  play(name);
  // Laisse le temps au son de démarrer avant de changer de page depuis la barre d'onglets.
  const link = event.target.closest(".site-nav a[href]");
  if (enabled && link && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
      && link.target !== "_blank" && link.origin === location.origin && link.pathname !== location.pathname) {
    event.preventDefault();
    setTimeout(() => { location.href = link.href; }, 140);
  }
}, true);
