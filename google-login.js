// Keep the result on the site's origin: cross-domain redirects can lose
// their session when the browser partitions third-party storage.
export function setupGoogleLogin({ auth, provider, button, status, signInWithPopup }) {
  provider.setCustomParameters({ prompt: "select_account" });
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    const pendingMessage = "Choisis ton compte dans la fenêtre Google. Si aucune fenêtre ne s’affiche dans le navigateur intégré, ouvre le site dans Safari ou Chrome.";
    status.textContent = pendingMessage;
    try {
      // Start directly in the click handler so browsers allow the popup.
      await signInWithPopup(auth, provider);
      if (status.textContent === pendingMessage) status.textContent = "Connexion réussie.";
    } catch (error) {
      const messages = {
        "auth/popup-blocked": "Autorise les fenêtres pop-up pour ce site, puis clique à nouveau sur Continuer avec Google. Si tu utilises un navigateur intégré, ouvre le site dans Safari ou Chrome.",
        "auth/popup-closed-by-user": "La fenêtre Google a été fermée avant la fin. Tu peux réessayer.",
        "auth/cancelled-popup-request": "Une autre connexion Google est déjà en cours. Termine-la puis réessaie si nécessaire.",
        "auth/unauthorized-domain": "Cette adresse du site n’est pas encore autorisée pour la connexion Google.",
        "auth/operation-not-allowed": "La connexion Google n’est pas encore activée pour ce site.",
        "auth/network-request-failed": "La connexion a été interrompue. Vérifie ton réseau puis réessaie.",
      };
      status.textContent = messages[error.code] || "La connexion n’a pas pu aboutir. Réessaie dans un instant.";
    } finally {
      button.disabled = false;
    }
  });
}
