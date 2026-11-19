# Menu Malin

Menus de la semaine construits sur les actions de Migros, Coop, Denner et Lidl, avec vue Actions, liste de courses, frigo et favoris.
Application web statique (HTML + JavaScript, aucun serveur), installable sur Android.

## Contenu

| Fichier | Rôle |
| --- | --- |
| `index.html` | L'application complète |
| `deals.json` | Actions de la semaine (relevé du 19.11.2026, valables jusqu'au 25.11) |
| `photos.json` | Liste des photos de plats disponibles (vide pour l'instant) |
| `manifest.webmanifest`, `icon-*.png` | Installation comme une appli sur Android |
| `sw.js` | Fonctionnement hors ligne (page en cache, actions rechargées dès qu'il y a du réseau) |
| `.nojekyll` | Évite que GitHub Pages retraite les fichiers |

## Mettre en ligne avec GitHub Pages

1. Crée un dépôt (ex. `menu-malin`) et ajoute tous les fichiers à la racine.
2. Dans le dépôt : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. Après une minute, l'app est en ligne sur `https://<ton-compte>.github.io/menu-malin/`.

## Installer sur Android

Ouvre l'adresse dans Chrome, puis menu **⋮ → Installer l'application** (ou « Ajouter à l'écran d'accueil »). L'app s'ouvre en plein écran et fonctionne aussi sans réseau.

## Mettre à jour les actions

Remplace `deals.json` par la nouvelle version chaque semaine (même format). La page recharge les actions à chaque ouverture.

## Limites de cette version GitHub

- **Liste partagée du foyer** : la synchronisation en direct passe par claude.ai. Sur GitHub Pages, la liste de courses, le frigo et les favoris sont enregistrés **sur l'appareil seulement**. Pour partager la liste hors de claude.ai, il faudra ajouter un service de synchronisation (par ex. Firebase ou Supabase).
- **Mise à jour automatique** : la tâche planifiée du mercredi soir met à jour la version claude.ai, pas ce dépôt. Pour automatiser ici, il faudra une GitHub Action qui régénère `deals.json`.
- Les prix d'action peuvent changer ou être épuisés : le prix en magasin fait foi. Prototype indépendant, sans lien avec les enseignes citées.
