// Signale un évènement au Worker pour qu'il envoie le mail automatique correspondant.
// Le Worker vérifie tout lui-même ; si l'envoi échoue, le site continue normalement.
const SERVER = "https://heivoli-discord-auth.heivoli-discord-auth.workers.dev";
export async function sendMail(auth, type, id) {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    const response = await fetch(`${SERVER}/api/mail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(id ? { type, id } : { type }),
    });
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}
