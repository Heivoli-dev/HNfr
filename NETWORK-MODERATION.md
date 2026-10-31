# Modération des connexions

Le Worker Discord fournit aussi une API de contrôle des écritures. Chaque
commentaire, nouveau ticket ou réponse nécessite un permis serveur valable
60 secondes, lié au compte et au document cible. Le permis est consommé dans
la même opération atomique Firestore que la publication et n'est pas réutilisable.
Les règles continuent de valider l'identité, les contenus et le délai des commentaires.

L'API vérifie les jetons Firebase via accounts:lookup avant toute opération.
L'adresse reçue de Cloudflare est représentée par un HMAC SHA-256 avec une clé
secrète côté serveur. Elle n'est jamais affichée ou enregistrée en clair. Les
documents networkUsers sont privés et leur historique n'est plus utilisé après
30 jours. Les documents ne sont pas automatiquement supprimés : configurer une
politique de nettoyage séparée si nécessaire. Une rotation de la clé du compte
de service change les empreintes IP et nécessite de recréer les bans réseau.

Dans l'administration, « Bannir aussi sa dernière connexion » crée un ban compte
et un ban réseau de même durée. Chaque ban se lève séparément. Sans participation
récente après installation du contrôle, aucun historique IP n'est disponible.
Les anciennes publications ne permettent pas de reconstituer l'adresse IP.

Ce contrôle bloque les comptes qui tentent de publier via la même connexion,
pas la lecture du site. Une IP partagée peut concerner plusieurs personnes ; une
autre IP, un VPN ou une connexion mobile peut contourner le blocage.

Déploiement : serveur Cloudflare d'abord, vérifier /api/health depuis l'origine
officielle, puis les fichiers du site et les règles Firestore testées. Le compte
de service du Worker doit avoir accès à Firestore. Ne jamais placer ses secrets
dans le dépôt ou les pages. La CSP autorise l'API du Worker pour les écritures.

## Cloudflare Turnstile

L’intégration protège la délivrance des permis d’écriture (commentaires, profils,
tickets et messages). Aucun permis n’est délivré si Turnstile est activé et que
le jeton est absent, refusé, réutilisé, d’un autre domaine ou d’une autre action.
Les règles Firestore existantes restent nécessaires pour empêcher les écritures directes.

Activation coordonnée :
1. Créer un widget Turnstile « Managed » dans Cloudflare pour le domaine exact
   `heivoli-network.fr`.
2. Définir `TURNSTILE_SITE_KEY` dans les variables du Worker Discord et ajouter
   `TURNSTILE_SECRET_KEY` comme secret (`npx wrangler secret put TURNSTILE_SECRET_KEY`
   depuis `discord-worker`). Ne jamais mettre la clé secrète dans Git ou le navigateur.
3. Publier d’abord les fichiers statiques incluant `turnstile.js`, `network-access.js`
   et les CSP mises à jour. Publier ensuite le Worker avec `TURNSTILE_ENABLED=true`
   et la clé publique dans ses variables persistantes (wrangler.jsonc ou configuration
   de déploiement). Les clés ne sont pas fournies dans ce dépôt.
4. Vérifier un commentaire, un ticket, un message et un profil, puis une requête sans
   jeton : elle doit être refusée. Tester aussi annulation et nouvelle tentative.

Sans `TURNSTILE_ENABLED=true`, les contrôles de modération précédents continuent
à fonctionner mais Turnstile n’est pas actif. Une configuration activée sans clés
refuse les écritures. Chaque envoi utilise un nouveau jeton validé côté serveur.
Documentation : https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
