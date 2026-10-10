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
