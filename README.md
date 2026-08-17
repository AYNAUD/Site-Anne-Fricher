# Atelier Anne Fricher — site vitrine

Site de l'**Atelier Anne Fricher**, couture d'ameublement et décoration
d'intérieur et d'extérieur à Nîmes. Refonte locale du site Wix d'origine, en
HTML / CSS / JavaScript statiques, sans dépendance ni étape de build.

## Lancer le site

```bash
node serve.mjs
```

Le site est alors servi sur <http://localhost:5173>. Pour changer de port :

```bash
node serve.mjs 8080
```

Ouvrir `index.html` directement dans un navigateur fonctionne également, mais la
carte de la page Contact et le chargement des polices se comportent mieux via
`http://`.

## Modifier le site sans écrire de code

```bash
node admin.mjs
```

Puis <http://localhost:5174/admin> : une interface locale pour ajouter des
pages, et ajouter, modifier, déplacer ou supprimer les textes et les images.
Elle écrit directement dans les fichiers `.html` du dossier — le site reste
strictement statique. Chaque action est sauvegardée et annulable.

Voir la section 13 de [CLAUDE.md](CLAUDE.md) pour le détail.

## Pages

| Fichier | Page |
|---|---|
| `index.html` | Accueil |
| `services.html` | Nos services |
| `portfolio.html` | Portfolio |
| `projet-coussinage.html` | Fiche projet — Coussinage |
| `projet-rideaux-voilages.html` | Fiche projet — Rideaux, voilages |
| `atelier.html` | L'atelier |
| `contact.html` | Contact |
| `mentions-legales.html` | Mentions légales |

## Structure

```
assets/css/style.css     feuille de style unique, variables CSS
assets/css/fonts.css     @font-face des polices auto-hébergées
assets/fonts/            Cormorant Garamond + Jost (woff2)
assets/js/main.js        menu mobile, visionneuse, apparitions, formulaire
assets/img/              photographies de l'atelier et logos partenaires
admin.mjs · admin/       interface d'administration locale (non publiée)
```

## Caractéristiques

- Aucune dépendance externe : polices et images hébergées localement.
- Aucun cookie, aucun script tiers, aucune mesure d'audience.
- Responsive de 320 px à grand écran, menu plein écran sur mobile.
- Galerie avec visionneuse accessible : clavier, balayage tactile, piège de focus.
- Balises SEO complètes, données structurées JSON-LD, `sitemap.xml`, `robots.txt`.
- `prefers-reduced-motion` respecté, feuille de style d'impression.

## Avant mise en ligne

Voir la section 7 de [CLAUDE.md](CLAUDE.md) : mentions légales à compléter,
domaine à confirmer, coordonnées GPS de la carte à préciser, et choix d'une
solution d'envoi pour le formulaire de contact (actuellement en `mailto:`).

## Déploiement

Le dossier est directement publiable tel quel sur n'importe quel hébergement
statique — GitHub Pages, Netlify, Cloudflare Pages, ou un simple espace FTP.
Aucune commande de build n'est nécessaire ; `serve.mjs`, `admin.mjs`, `admin/`
et `.claude/` ne servent qu'au travail local et n'ont pas à être mis en ligne.
