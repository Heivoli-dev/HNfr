# Installation de la version 3DS

Adresse prévue : `3ds.heivoli-network.fr`.

Cette version fonctionne en lecture seule, sans JavaScript, sans Firebase chargé
dans le navigateur, sans animations, sans polices distantes et sans grande image.
La largeur du viewport est de 320 pixels conformément à la documentation Nintendo.
Seul le petit logo PNG est chargé. Les liens vers les services externes et vers
la connexion du site complet nécessitent généralement un appareil récent.

## Sur un hébergement web IONOS avec PHP

1. Dans IONOS, ouvrir l’espace **Hébergement / Espace Web**. Il faut un hébergement
   web ; posséder un domaine seul ne suffit pas. Aucun changement au site principal
   GitHub Pages n’est nécessaire.
2. Créer un dossier dédié, par exemple `hn-3ds`, et y envoyer le contenu de
   l’archive, y compris les fichiers `.htaccess` et le dossier `cache`.
3. Dans **Domaines et SSL**, choisir `3ds.heivoli-network.fr` et lui affecter ce
   dossier web. Éviter une simple redirection vers le site principal.
4. Choisir une version PHP maintenue (8.2 ou ultérieure). Le serveur doit pouvoir
   contacter `firestore.googleapis.com` en HTTPS. Aucune clé privée n’est utilisée.
5. Ouvrir `/index.php` : les six dernières annonces publiques sont préparées côté
   serveur, avec un cache de cinq minutes. Le dossier `cache` doit être inscriptible
   par PHP pour limiter les requêtes. Sans cache inscriptible, le site fonctionne
   mais refait la requête à chaque visite.
6. Vérifier l’ouverture depuis une vraie 3DS/2DS, puis une New 3DS si disponible.
   Le rendu léger ne garantit pas la compatibilité du certificat HTTPS : activer
   un certificat pour ce sous-domaine puis tester sa chaîne de confiance et TLS.
   Nintendo indique HTTP 1.0/1.1 et TLS jusqu’à 1.2. Ne pas modifier la sécurité du
   domaine principal pour résoudre un problème de la version 3DS.

Si les annonces ne peuvent pas être actualisées, la page utilise le dernier cache
disponible ou les annonces exportées dans `index.html`. Cette version ne permet
ni connexion, ni publication de commentaires, ni saisie de données personnelles.

## Version statique / aperçu

`index.html`, `style.css` et `logo.png` peuvent aussi être servis seuls.
Les annonces sont alors un instantané, sans mise à jour automatique. Le générateur
`scripts/update-3ds-announcements.mjs` dans le dépôt HNfr peut rafraîchir cet
instantané à partir de la collection publique avant de recréer l’archive.

La création du sous-domaine et l’existence d’une page IONOS par défaut ne prouvent
pas qu’un espace PHP est inclus dans l’abonnement. Vérifier l’offre avant toute
souscription. Si seul le domaine est disponible, choisir un hébergement séparé
puis utiliser le réglage DNS qu’il fournit.

Référence : https://en-americas-support.nintendo.com/app/answers/detail/a_id/13802
