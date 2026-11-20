// Bulle « Discord en direct » de l'accueil.
// Le nombre de membres vient du lien d'invitation (toujours disponible) ;
// les avatars, pseudos et jeux viennent du widget du serveur, s'il est activé dans Discord.
const INVITE = "Z7kZ3WWZxw";
const GUILD_ID = "1530607283015389274";
const box = document.querySelector("#discord-live");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const safeAvatar = url => (typeof url === "string" && /^https:\/\/cdn\.discordapp\.com\/[^\s]+$/.test(url) ? url : "");

async function getJson(url) {
  const response = await fetch(url, { referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

async function load() {
  if (!box) return;
  let invite;
  try {
    invite = await getJson(`https://discord.com/api/v10/invites/${INVITE}?with_counts=true`);
  } catch {
    return; // Discord injoignable : la bulle reste masquée, la barre de réseaux suffit.
  }
  const widget = await getJson(`https://discord.com/api/guilds/${GUILD_ID}/widget.json`).catch(() => null);

  const online = widget?.presence_count ?? invite.approximate_presence_count ?? 0;
  const total = invite.approximate_member_count ?? 0;
  box.querySelector(".discord-live-name").textContent = invite.guild?.name || "Heivoli Network";
  box.querySelector(".discord-live-count-text").textContent =
    `${plural(online, "membre en ligne", "membres en ligne")}${total ? ` · ${total} au total` : ""}`;

  const icon = invite.guild?.icon;
  if (icon && /^[a-z0-9_]+$/i.test(icon)) {
    const image = el("img");
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.src = `https://cdn.discordapp.com/icons/${invite.guild.id}/${icon}.${icon.startsWith("a_") ? "gif" : "png"}?size=96`;
    image.addEventListener("error", () => image.remove());
    box.querySelector(".discord-live-logo").append(image);
  }

  const members = Array.isArray(widget?.members) ? widget.members : [];
  const row = box.querySelector(".discord-live-members");
  if (members.length) {
    const stack = el("span", "avatar-stack");
    members.slice(0, 6).forEach((member, index) => {
      const avatar = el("i", `av a${(index % 6) + 1}`, String(member.username || "?").charAt(0).toUpperCase());
      const url = safeAvatar(member.avatar_url);
      if (url) {
        const image = el("img");
        image.alt = "";
        image.referrerPolicy = "no-referrer";
        image.src = url;
        image.addEventListener("error", () => image.remove());
        avatar.append(image);
      }
      stack.append(avatar);
    });
    const names = el("span", "discord-live-names", members.slice(0, 3).map(member => member.username).join(", "));
    if (online > 3) names.append(" ", el("em", "", `et ${online - 3} autre${online - 3 > 1 ? "s" : ""}`));
    row.replaceChildren(stack, names);
    row.hidden = false;

    const games = [...new Set(members.map(member => member.game?.name).filter(Boolean))];
    const players = members.filter(member => member.game?.name).length;
    const activity = box.querySelector(".discord-live-activity");
    if (games.length) {
      activity.textContent = `🎮 ${plural(players, "membre joue", "membres jouent")} en ce moment : ${games.slice(0, 3).join(", ")}`;
      activity.hidden = false;
    }
  }
  box.hidden = false;
}

load();
