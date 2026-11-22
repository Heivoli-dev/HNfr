// Onglets « Règles de la communauté » / « Conditions d'utilisation »
const tabs = [...document.querySelectorAll(".legal-tab")];
const panels = [...document.querySelectorAll(".legal-panel")];
const anchorsOf = name => new Set([...document.querySelectorAll(`#${name} [id]`)].map(el => el.id));
const ANCHORS = { conditions: anchorsOf("conditions"), confidentialite: anchorsOf("confidentialite") };

function show(name, scroll) {
  tabs.forEach(tab => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  panels.forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
  if (scroll) document.getElementById(name)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function fromHash() {
  const hash = decodeURIComponent(location.hash.slice(1));
  const panel = Object.keys(ANCHORS).find(name => hash === name || ANCHORS[name].has(hash)) || "regles";
  show(panel, false);
  if (hash && hash !== panel && ANCHORS[panel]?.has(hash)) document.getElementById(hash)?.scrollIntoView({ block: "start" });
}
tabs.forEach(tab => tab.addEventListener("click", event => {
  event.preventDefault();
  history.replaceState(null, "", `#${tab.dataset.tab}`);
  show(tab.dataset.tab, false);
}));
document.querySelectorAll("[data-tab-link]").forEach(link => link.addEventListener("click", event => {
  event.preventDefault();
  history.replaceState(null, "", `#${link.dataset.tabLink}`);
  show(link.dataset.tabLink, true);
}));
addEventListener("hashchange", fromHash);
fromHash();
