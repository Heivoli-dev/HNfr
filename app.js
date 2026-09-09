// Configuration à compléter lorsque l'invitation Discord Heivoli sera prête.
const CONFIG = {
  discordInvite: "",
};

const announcements = [
  {
    type: "Bienvenue",
    title: "Heivoli Network prend vie.",
    text: "Le nouveau point de rendez-vous des fans Nintendo ouvre ses portes.",
    date: "Aujourd'hui",
    featured: true,
  },
  {
    type: "Événement",
    title: "Des sessions de jeu à venir.",
    text: "Les premiers rendez-vous communautaires seront annoncés ici.",
    date: "Bientôt",
  },
  {
    type: "Communauté",
    title: "Le futur bot Heivoli arrive.",
    text: "Il reliera progressivement ton compte au serveur Discord.",
    date: "En développement",
  },
];

const announcementList = document.querySelector("#announcements-list");
announcementList.innerHTML = announcements
  .map(
    (announcement) => `
      <article class="announcement ${announcement.featured ? "featured" : ""}">
        <p class="announcement-type">${announcement.type}</p>
        <h3>${announcement.title}</h3>
        <p>${announcement.text}</p>
        <p class="announcement-date">${announcement.date}</p>
      </article>
    `,
  )
  .join("");

document.querySelector("#year").textContent = new Date().getFullYear();

const menuButton = document.querySelector(".menu-button");
const nav = document.querySelector(".site-nav");
menuButton.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

document.querySelectorAll(".site-nav a").forEach((link) =>
  link.addEventListener("click", () => {
    nav.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
  }),
);

const modal = document.querySelector("#notice-modal");
const modalTitle = document.querySelector("#modal-title");
const modalMessage = document.querySelector("#modal-message");
const modalAction = document.querySelector("#modal-action");

function showNotice(kind) {
  const discordIsReady = Boolean(CONFIG.discordInvite);

  if (kind === "discord" && discordIsReady) {
    window.open(CONFIG.discordInvite, "_blank", "noopener,noreferrer");
    return;
  }

  if (kind === "discord") {
    modalTitle.textContent = "Le portail Discord arrive.";
    modalMessage.textContent = "L'invitation officielle de Heivoli Network sera ajoutée ici très bientôt. Reviens vite pour rejoindre la communauté !";
    modalAction.hidden = true;
  } else {
    modalTitle.textContent = "Connexion en préparation.";
    modalMessage.textContent = "Les connexions Discord et Google seront activées avec le futur bot Heivoli. Aucun compte n'est créé ni relié pour l'instant.";
    modalAction.hidden = true;
  }

  modal.showModal();
}

document.querySelectorAll(".discord-trigger").forEach((button) =>
  button.addEventListener("click", () => showNotice("discord")),
);
document.querySelectorAll(".account-trigger").forEach((button) =>
  button.addEventListener("click", () => showNotice("account")),
);
document.querySelector(".modal-close").addEventListener("click", () => modal.close());
modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.close();
});
