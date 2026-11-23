/* Édition Noël — Heivoli Network
   Active automatiquement du 1er décembre au 6 janvier.
   Forcer pour tester : ?noel=1 (ou ?noel=0 pour couper). */
(() => {
  const DEBUT = { mois: 12, jour: 1 };  // 1er décembre
  const FIN = { mois: 1, jour: 6 };     // 6 janvier (inclus)

  const params = new URLSearchParams(location.search);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } }
  };
  if (params.has("noel")) store.set("hn-noel-force", params.get("noel"));
  const force = store.get("hn-noel-force");

  const now = new Date();
  const m = now.getMonth() + 1, d = now.getDate();
  const enPeriode = (m === DEBUT.mois && d >= DEBUT.jour) || (m === FIN.mois && d <= FIN.jour);
  if (force === "0" || (!enPeriode && force !== "1")) return;

  const root = document.documentElement;
  root.classList.add("noel");
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";
  const svg = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  /* ---------- Neige posée sur les bulles ---------- */
  const CIBLES = ".intro-card, .social-bar, .announcement, .community-card, .video-frame, .discord-live, .software-card, .project-list, .software-help, .mac-guide, .site-nav, .tickets-panel, .profile-panel, .profile-gate, .player-form-card, .legal-panel, .my-card-callout";
  let gradId = 0;

  function graine(n) { let s = n * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

  function dessinerChapeau(card, cap, seed) {
    const W = card.offsetWidth;
    if (!W) return;
    const r = Math.min(parseFloat(getComputedStyle(card).borderTopLeftRadius) || 20, 40);
    const rnd = graine(seed);
    const petit = card.classList.contains("site-nav") || card.classList.contains("social-bar");
    const hMax = petit ? 10 : 22, base = petit ? 5 : 10;
    const H = hMax + 30;
    cap.replaceChildren();
    cap.setAttribute("viewBox", `0 ${-hMax - 4} ${W} ${H}`);
    cap.setAttribute("width", W);
    cap.setAttribute("height", H);

    const x0 = Math.max(2, r * 0.18), x1 = W - x0, yBout = Math.min(r * 0.55, 16);
    // Dessus bosselé
    const pts = [[x0, yBout]];
    const pas = petit ? 34 : 58;
    for (let x = x0 + r * 0.5; x < x1 - r * 0.5; x += pas * (0.7 + rnd() * 0.6)) {
      pts.push([x, -(hMax * 0.55 + rnd() * hMax * 0.45)]);
    }
    pts.push([x1 - r * 0.45, -hMax * 0.5], [x1, yBout]);
    let p = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const bombe = Math.min(10, Math.abs(bx - ax) * 0.18);
      p += ` Q${(ax + bx) / 2},${Math.min(ay, by) - bombe} ${bx},${by}`;
    }
    // Dessous avec petites coulures, de droite à gauche
    const coulures = [];
    if (!petit) {
      const n = Math.max(1, Math.round(W / 120));
      for (let i = 0; i < n; i++) coulures.push(x0 + r + rnd() * (W - 2 * (x0 + r)));
      coulures.sort((a, b) => b - a);
    }
    p += ` Q${x1 - 2},${base + 2} ${x1 - r * 0.6},${base}`;
    for (const cx of coulures) {
      const w = 12 + rnd() * 10, L = 9 + rnd() * 16;
      p += ` L${cx + w / 2},${base} C${cx + w / 2},${base + L} ${cx - w / 2},${base + L} ${cx - w / 2},${base}`;
    }
    p += ` L${x0 + r * 0.6},${base} Q${x0 + 2},${base + 2} ${x0},${yBout} Z`;

    const id = `hn-neige-${gradId++}`;
    const defs = svg("defs");
    const lg = svg("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.append(svg("stop", { offset: "0", "stop-color": "#ffffff" }), svg("stop", { offset: ".7", "stop-color": "#fbfbff" }), svg("stop", { offset: "1", "stop-color": "#e4e2fb" }));
    defs.append(lg);
    cap.append(defs, svg("path", { d: p, fill: `url(#${id})` }));
    // Reflets scintillants
    const nb = petit ? 1 : 3;
    for (let i = 0; i < nb; i++) {
      const sx = x0 + r + rnd() * (W - 2 * (x0 + r));
      const c = svg("circle", { cx: sx, cy: -hMax * 0.2, r: 1.3, class: "hn-scintille" });
      c.style.animationDelay = `${(rnd() * 3).toFixed(2)}s`; // via CSSOM : compatible avec la CSP
      cap.append(c);
    }
  }

  const chapeaux = new Map();
  const ro = "ResizeObserver" in window ? new ResizeObserver((entries) => {
    for (const e of entries) { const c = chapeaux.get(e.target); if (c) dessinerChapeau(e.target, c.el, c.seed); }
  }) : null;

  function enneiger(scope = document) {
    scope.querySelectorAll(CIBLES).forEach((card) => {
      if (chapeaux.has(card)) return;
      const cap = svg("svg", { class: "hn-neige-chapeau", "aria-hidden": "true", focusable: "false" });
      const seed = chapeaux.size + 7;
      card.prepend(cap);
      chapeaux.set(card, { el: cap, seed });
      dessinerChapeau(card, cap, seed);
      ro?.observe(card);
    });
  }

  /* ---------- Guirlande lumineuse en haut de page ---------- */
  function guirlande() {
    const wrap = document.createElement("div");
    wrap.className = "hn-guirlande";
    wrap.setAttribute("aria-hidden", "true");
    const s = svg("svg", { preserveAspectRatio: "none" });
    wrap.append(s);
    document.body.prepend(wrap);
    const couleurs = ["#ff5709", "#ffb10a", "#9dd209", "#605cff", "#f2365a"];
    const ampoule = (k) => {
      const e = svg("ellipse", { cx: 0, cy: 10, rx: 4.6, ry: 7, fill: couleurs[k % couleurs.length], class: "hn-ampoule" });
      e.style.color = couleurs[k % couleurs.length];
      e.style.animationDelay = `${((k * 0.37) % 2.4).toFixed(2)}s`;
      return e;
    };
    const dessiner = () => {
      const W = window.innerWidth, arc = W < 700 ? 130 : 190, creux = 20;
      s.setAttribute("viewBox", `0 0 ${W} 46`);
      s.replaceChildren();
      let d = "M0,4", k = 0;
      for (let x = 0; x < W; x += arc) d += ` Q${x + arc / 2},${4 + creux * 2} ${x + arc},4`;
      s.append(svg("path", { d, class: "hn-fil" }));
      for (let x = 0; x < W; x += arc) {
        for (const t of [0.2, 0.5, 0.8]) {
          const bx = x + arc * t, by = 4 + 2 * t * (1 - t) * creux * 2;
          const g = svg("g", { transform: `translate(${bx},${by})` });
          g.append(
            svg("rect", { x: -2.5, y: -1, width: 5, height: 5, rx: 1, class: "hn-douille" }),
            ampoule(k),
            svg("ellipse", { cx: -1.4, cy: 7.5, rx: 1.3, ry: 2.4, class: "hn-reflet" })
          );
          s.append(g);
          k++;
        }
      }
    };
    dessiner();
    addEventListener("resize", dessiner, { passive: true });
  }

  /* ---------- Petits éléments festifs ---------- */
  function decorations() {
    const kicker = document.querySelector(".hero-kicker");
    if (kicker) {
      const badge = document.createElement("p");
      badge.className = "hn-noel-badge";
      badge.textContent = "❄ Édition de Noël · Joyeuses fêtes à toute la communauté";
      kicker.before(badge);
    }
    const footer = document.querySelector(".site-footer");
    if (footer) {
      const banc = document.createElement("div");
      banc.className = "hn-congere";
      banc.setAttribute("aria-hidden", "true");
      const s = svg("svg", { viewBox: "0 0 1200 70", preserveAspectRatio: "none" });
      s.append(svg("path", { d: "M0,70 L0,38 C80,18 160,30 240,26 C340,20 400,6 520,16 C620,24 700,34 800,22 C900,10 980,14 1060,24 C1120,30 1170,22 1200,18 L1200,70 Z", class: "hn-congere-fond" }));
      s.append(svg("path", { d: "M0,70 L0,50 C120,36 220,46 330,40 C450,33 560,44 680,38 C800,32 900,42 1010,36 C1100,32 1160,40 1200,36 L1200,70 Z", class: "hn-congere-avant" }));
      banc.append(s);
      footer.before(banc);
    }
  }

  /* ---------- Flocons qui tombent ---------- */
  let animation = null;
  function neigeQuiTombe() {
    const c = document.createElement("canvas");
    c.className = "hn-flocons";
    c.setAttribute("aria-hidden", "true");
    document.body.append(c);
    const ctx = c.getContext("2d");
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 32;
    const sc = sprite.getContext("2d");
    const g = sc.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(250,249,255,.95)");
    g.addColorStop(0.6, "rgba(196,191,240,.45)");
    g.addColorStop(1, "rgba(196,191,240,0)");
    sc.fillStyle = g; sc.fillRect(0, 0, 32, 32);

    let W, H, flocons = [], dpr = Math.min(devicePixelRatio || 1, 2);
    const taille = () => {
      W = innerWidth; H = innerHeight;
      c.width = W * dpr; c.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(120, Math.round(W * H / 13000));
      while (flocons.length < n) flocons.push(nouveau(true));
      flocons.length = n;
    };
    const nouveau = (partout) => ({
      x: Math.random() * W, y: partout ? Math.random() * H : -10,
      r: 1.5 + Math.random() * 3.5, v: 0.35 + Math.random() * 0.9,
      o: Math.random() * Math.PI * 2, a: 0.4 + Math.random() * 0.9
    });
    taille();
    addEventListener("resize", taille, { passive: true });
    let t = 0;
    const boucle = () => {
      t += 0.01;
      ctx.clearRect(0, 0, W, H);
      for (const f of flocons) {
        f.y += f.v; f.x += Math.sin(t * f.a + f.o) * 0.45;
        if (f.y > H + 10) Object.assign(f, nouveau(false));
        ctx.drawImage(sprite, f.x - f.r * 1.6, f.y - f.r * 1.6, f.r * 3.2, f.r * 3.2);
      }
      animation = requestAnimationFrame(boucle);
    };
    const start = () => { if (!animation) { c.hidden = false; boucle(); } };
    const stop = () => { cancelAnimationFrame(animation); animation = null; c.hidden = true; };

    // Bouton pour couper la neige qui tombe
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hn-neige-toggle";
    const maj = (on) => {
      btn.setAttribute("aria-pressed", String(on));
      const ico = document.createElement("span"), txt = document.createElement("span");
      ico.textContent = "❄"; ico.setAttribute("aria-hidden", "true");
      txt.className = "hn-neige-texte"; txt.textContent = on ? " Neige" : " Neige coupée";
      btn.replaceChildren(ico, txt);
      btn.title = on ? "Arrêter la neige qui tombe" : "Relancer la neige";
      btn.setAttribute("aria-label", btn.title);
    };
    let actif = store.get("hn-neige") !== "off";
    maj(actif);
    if (actif) start(); else c.hidden = true;
    btn.addEventListener("click", () => {
      actif = !actif; store.set("hn-neige", actif ? "on" : "off"); maj(actif);
      actif ? start() : stop();
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (actif) start(); });
    document.body.append(btn);
  }

  const lancer = () => {
    guirlande();
    decorations();
    enneiger();
    // Les annonces et autres blocs arrivent après coup (Firestore)
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) {
        if (n.matches?.(CIBLES)) enneiger(n.parentElement || document); else enneiger(n);
      }
    }).observe(document.body, { childList: true, subtree: true });
    if (!reduit) neigeQuiTombe();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lancer); else lancer();
})();
