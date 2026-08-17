# CLAUDE.md — Site Atelier Anne Fricher

Contexte et conventions pour toute intervention future sur ce dépôt.

---

## 1. Ce qu'est ce projet

Site vitrine de **l'Atelier Anne Fricher** (couture d'ameublement, décoration
d'intérieur et d'extérieur, Nîmes). Il s'agit d'une **refonte locale** du site Wix
d'origine — <https://aynaud.wixsite.com/anne-fricher> — avec une mise en page
retravaillée. Le contenu textuel et les photographies proviennent du site Wix.

Le site Wix reste la source des contenus d'origine, mais **ce dépôt est désormais
la référence** : ne pas re-synchroniser depuis Wix sans demande explicite.

## 2. Pile technique

**HTML / CSS / JavaScript statiques. Aucune dépendance, aucune étape de build.**

C'est un choix délibéré, validé avec le propriétaire du dépôt. N'introduis pas de
framework, de bundler, de préprocesseur CSS ni de `package.json` sans qu'on te le
demande explicitement. Le site doit rester ouvrable en double-cliquant sur
`index.html`.

- CSS : un seul fichier, variables CSS natives, pas de Sass.
- JS : un seul fichier, IIFE, ES5-compatible dans le style, sans dépendance.
- Polices : Cormorant Garamond + Jost, **auto-hébergées** dans `assets/fonts/`
  (aucun appel à Google Fonts à l'exécution).
- Images : toutes locales dans `assets/img/` (aucun lien vers le CDN Wix).

## 3. Arborescence

```
.
├── index.html                      Accueil
├── services.html                   Nos services (ancres #rideaux #coussinage #conseils)
├── portfolio.html                  Liste des projets + galerie « autres réalisations »
├── projet-coussinage.html          Fiche projet
├── projet-rideaux-voilages.html    Fiche projet
├── atelier.html                    Page « L'atelier » (nouvelle, absente du site Wix)
├── contact.html                    Coordonnées, carte, formulaire
├── mentions-legales.html           ⚠️ contient des champs [à compléter]
├── robots.txt · sitemap.xml
├── serve.mjs                       Serveur statique local, sans dépendance
├── .claude/launch.json             Configuration de prévisualisation
└── assets/
    ├── css/style.css               Feuille de style unique (12 sections numérotées)
    ├── css/fonts.css               @font-face générés, chemins réécrits en local
    ├── fonts/*.woff2               13 sous-ensembles (latin, latin-ext, cyrillique…)
    ├── js/main.js                  Menu, en-tête, apparitions, visionneuse, formulaire
    └── img/
        ├── anne-atelier-1.jpg      Portrait vertical (accueil, atelier)
        ├── anne-atelier-2.jpg      Portrait horizontal (services, atelier)
        ├── logo.png                Logo détouré, version fond clair (620×208)
        ├── logo-clair.png          Logo détouré, version fond sombre (620×208)
        ├── logoVectorise.jpeg      Source du logo (fond blanc) — non servie au site
        ├── favicon.svg
        ├── logos/                  4 logos partenaires
        ├── realisations/           r01–r09, galerie générale
        ├── coussinage/             c01–c09, fiche projet
        └── rideaux/                v01–v14, fiche projet
```

## 4. Lancer le site

```bash
node serve.mjs
```

Puis <http://localhost:5173>. Un port peut être passé en argument :
`node serve.mjs 8080`.

Ouvrir `index.html` directement en `file://` fonctionne aussi, mais l'iframe de la
carte et le chargement des polices se comportent mieux via `http://`.

## 5. Conventions à respecter

### Langue
**Tout est en français** : contenu, commentaires du code, noms de classes
métier, messages de commit. Utiliser les apostrophes typographiques (`'`) dans
le contenu visible et les espaces insécables avant `?` `!` `:` `;` (`&nbsp;`).

### CSS
- Nommage **BEM** : `.bloc`, `.bloc__element`, `.bloc--modificateur`.
- **Aucun style en ligne** dans le HTML. Le site en est actuellement exempt ;
  si un besoin ponctuel apparaît, créer une classe utilitaire dans `style.css`.
- Toutes les couleurs, tailles et espacements passent par les variables `--c-*`,
  `--t-*`, `--sp-*` définies dans `:root`. Ne pas écrire de valeur en dur.
- La feuille est organisée en 12 sections numérotées ; ajouter une règle dans la
  section qui lui correspond, pas à la fin du fichier.

### HTML
- L'en-tête et le pied de page sont **dupliqués dans chaque page** (pas de
  templating). **Toute modification de l'un doit être répercutée dans les 8
  pages.** Vérifier ensuite avec :
  ```bash
  grep -c "footer__grid" *.html
  ```
- Marquer la page courante avec `aria-current="page"` sur le bon `.nav__link`.
- Chaque page : un seul `<h1>`, un `<title>` unique, une `meta description`,
  les balises Open Graph, et un lien `canonical`.
- Toute `<img>` porte `alt`, `width`, `height` et `loading="lazy"` (sauf l'image
  du hero, en `fetchpriority="high"`).

### Accessibilité
Le niveau actuel est à préserver : lien d'évitement, navigation au clavier dans
la visionneuse (flèches, Échap, piège de focus), libellés de formulaire
explicites, contrastes vérifiés, `prefers-reduced-motion` respecté.

## 6. Points de vigilance (pièges déjà rencontrés)

**`backdrop-filter` sur `.header`** — Ne jamais remettre `backdrop-filter`
directement sur `.header`. Cette propriété fait de l'en-tête le bloc conteneur de
ses descendants en `position: fixed`, et le panneau du menu mobile cesse alors de
couvrir l'écran. Le flou est volontairement porté par `.header::before`.

**Logo, deux versions** — Le logo existe en deux fichiers détourés issus du même
original, `logoVectorise.jpeg` : `logo.png` (lettrage `--c-ink`, carmin
d'origine `#8c121a`) pour les fonds clairs, et `logo-clair.png` (lettrage crème,
carmin éclairci en `#c9394c`) pour les fonds sombres — le carmin d'origine ne se
détache pas du brun `--c-bg-deep` du pied de page. **Les deux fichiers doivent
rester géométriquement identiques** (620 × 208, même détourage) : l'en-tête les
superpose en `position: absolute` et bascule leur opacité selon `.header--over`.
Remplacer l'un sans l'autre décale la superposition.

Les deux `<img>` du logo de l'en-tête portent `loading="eager"` et non
`loading="lazy"` : ils sont au-dessus de la ligne de flottaison.

**Galerie et visionneuse** — Une vignette doit être un `<button class="gallery__item">`
contenant une `<img>`, à l'intérieur d'un conteneur portant `data-gallery="nom"`.
C'est cet attribut qui définit le groupe de navigation précédent/suivant. Un
attribut `data-caption` sur le bouton fournit la légende. Si l'on ajoute un jour
des vignettes allégées, `data-full` sur l'`<img>` pointera vers la version large.

**Textes alternatifs** — Ils décrivent le contenu réel de chaque photo (vérifié
image par image). En cas de remplacement d'une image, **regarder la nouvelle
photo** avant d'écrire son `alt` et son `data-caption`.

## 7. Éléments à finaliser avant mise en ligne

| Élément | Fichier | À faire |
|---|---|---|
| Mentions légales | `mentions-legales.html` | Renseigner SIRET, forme juridique, TVA, hébergeur. Champs entre `[crochets]`. |
| Domaine | toutes les pages | Les `canonical`, `robots.txt` et `sitemap.xml` pointent vers `https://www.atelierannefricher.fr/` — valeur supposée, à remplacer par le domaine réel. |
| Coordonnées de la carte | `contact.html` | Le marqueur OpenStreetMap est positionné à `43.8375, 4.3600` (centre de Nîmes, **approximatif**). À corriger avec les coordonnées exactes du 2 rue Villars. |
| Formulaire de contact | `contact.html`, `main.js` | Fonctionne actuellement en `mailto:` (voir §8). |
| Année de création | toutes les pages | Le bandeau affiche « Nîmes · depuis 2003 », déduit du « plus de 20 ans d'expérience » du site Wix. **À confirmer auprès d'Anne Fricher.** |
| Horaires d'ouverture | `contact.html` | Absents du site Wix. Mention actuelle : « reçoit sur rendez-vous ». À préciser si des horaires existent. |
| Favicon | `assets/img/favicon.svg` | Toujours le monogramme « AF » terracotta, antérieur au logo. Le logo étant un bloc-marque horizontal, il ne se réduit pas à un carré : demander une déclinaison carrée. |

## 8. Textes rédigés pour la refonte

Le site Wix contenait, sur ses deux fiches projet, des **notes de travail
adressées à la propriétaire** (« Commentaire global sur l'activité — me donner un
titre pour chaque image… ») et non du contenu publiable. Elles ont été remplacées
par des descriptions rédigées à partir des photographies.

Sont donc **à faire relire par Anne Fricher** :

- les paragraphes « Le chantier » et « Le savoir-faire » des deux fiches projet ;
- les listes de prestations détaillées de `services.html` (types de têtes de
  rideaux, doublures, mousses, traitements des tissus outdoor) ;
- l'intégralité de `atelier.html`, page qui n'existait pas sur Wix ;
- les quatre repères chiffrés du bandeau d'accueil ;
- les légendes des galeries.

Les textes repris **mot pour mot** du site Wix (à ne pas réécrire sans raison) :
l'accroche « Nous vous aidons à transformer votre intérieur », les trois blocs
« Tissus sur mesure », « Création de pièces uniques » et « Votre projet, notre
priorité », le paragraphe des partenaires, et les phrases d'accueil de
`portfolio.html` et `contact.html`.

## 9. Formulaire de contact

Un site statique ne peut pas envoyer d'e-mail. `initForm()` dans `main.js`
construit un lien `mailto:` prérempli à partir de l'adresse lue dans
`data-mailto` sur le `<form>`. Un pot de miel (`input[name=website]`, masqué)
filtre les robots.

Pour un envoi automatique, deux options sans changer de pile :

- **Netlify Forms** — ajouter `netlify` et `name="contact"` sur le `<form>`,
  supprimer le gestionnaire `submit` de `initForm()`.
- **Formspree** — mettre `action="https://formspree.io/f/XXXX"` et `method="POST"`,
  puis remplacer la construction du `mailto:` par un `fetch()` vers cette action.

Dans les deux cas, mettre à jour la section « Données personnelles » des mentions
légales, qui affirme aujourd'hui qu'aucune donnée n'est enregistrée sur un serveur.

## 10. Vie privée

Le site ne charge **aucun script tiers**, ne dépose **aucun cookie** et n'utilise
aucun outil de mesure d'audience. La seule ressource externe est l'iframe
OpenStreetMap de la page Contact. Préserver cette propriété : elle est annoncée
dans les mentions légales. Toute ajout d'analytics implique de mettre à jour ces
mentions et, potentiellement, d'ajouter une bannière de consentement.

## 11. Contrôles avant livraison

```bash
node serve.mjs
```

- Aucun style en ligne : `grep -c 'style="' *.html` doit renvoyer `0` partout.
- En-tête et pied de page identiques sur les 8 pages.
- Rendu vérifié à 375 px (mobile), 768 px (tablette) et 1280 px (bureau).
- Menu mobile : ouverture, fermeture par Échap, fermeture au clic sur un lien.
- Visionneuse : flèches, Échap, balayage tactile, focus rendu à la vignette.
- Console du navigateur vide.

## 12. Coordonnées de référence

```
Atelier Anne Fricher
2 rue Villars, 30000 Nîmes, France
06 74 39 85 93
atelierannefricher@outlook.fr
facebook.com/AtelierFricher · instagram.com/anne_fri
```

Ces valeurs apparaissent dans le pied de page des 8 pages, dans l'en-tête, sur la
page Contact et dans le JSON-LD de `index.html`. **En cas de modification, les
mettre à jour partout** :

```bash
grep -rn "0674398593\|atelierannefricher@outlook.fr\|rue Villars" *.html
```
