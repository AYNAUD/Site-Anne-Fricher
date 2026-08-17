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
├── admin.mjs                       Serveur d'administration local (voir §13)
├── admin/                          Interface d'administration — jamais mise en ligne
│   ├── index.html · admin.css · admin.js   Interface (navigateur)
│   ├── apercu.js                   Script injecté dans l'aperçu, jamais dans les fichiers
│   └── lib/                        Modules serveur : html, blocs, document, images,
│                                   pages, sauvegardes
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

Pour modifier le contenu sans écrire de code, voir §13 : `node admin.mjs`, puis
<http://localhost:5174/admin>.

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

---

## 13. Interface d'administration

```bash
node admin.mjs
```

→ <http://localhost:5174/admin> (le site reste servi sur `/`). Le serveur
n'écoute que sur `127.0.0.1`.

Permet, sans écrire de code : **ajouter une page**, et **ajouter, modifier,
déplacer, dupliquer ou supprimer** les textes, les images, les galeries et les
sections d'une page.

### Ce que c'est — et ce que ce n'est pas

Ce n'est **pas** un CMS : il n'y a ni base de données, ni fichier de contenu
intermédiaire, ni étape de génération. L'interface **modifie directement les
fichiers `.html` du dépôt**, qui restent la seule source de vérité. Une fois les
modifications faites, on livre le dossier tel quel (§Déploiement du README) et on
commite les fichiers modifiés. Les contraintes de la §2 sont donc intactes.

`admin.mjs`, `admin/` et `.admin-sauvegardes/` **ne doivent pas être mis en
ligne** ; `admin/` est en `Disallow` dans `robots.txt` et les sauvegardes sont
ignorées par git.

### Comment les modifications sont écrites

`admin/lib/html.mjs` analyse la page en conservant la **position exacte** de
chaque nœud dans le fichier ; les modifications sont appliquées par découpes sur
la chaîne d'origine. Tout ce qui n'est pas touché ressort **identique au
caractère près** — indentation, commentaires de section, entités. Un aller-retour
« modifier puis annuler » redonne un fichier strictement identique (vérifié).

Conséquences à connaître :

- Les textes saisis sont **assainis** : seul un balisage en ligne restreint est
  conservé (`<strong> <em> <a> <br> <span>…`), le reste est échappé. Une saisie
  ne peut pas casser une page.
- La **typographie française de la §5 est appliquée automatiquement** :
  apostrophes courbes et `&nbsp;` devant `? ! : ;`.
- Remplacer une image met à jour `width` et `height` toute seule, en lisant les
  dimensions dans l'en-tête binaire du fichier (`admin/lib/images.mjs`).
- Un commentaire de section (`<!-- ===== HERO ===== -->`) suit le bloc qu'il
  annonce lors d'un déplacement ou d'une suppression.

### Sauvegardes et annulation

Toute action passe par une transaction (`admin/lib/sauvegardes.mjs`) : les
fichiers touchés sont copiés dans `.admin-sauvegardes/<horodatage>/` avant
écriture, et le journal permet d'annuler action par action depuis la barre du
haut — y compris une action qui a modifié huit fichiers (ajout au menu) ou créé
une page (l'annulation supprime alors le fichier créé).

### Ajout d'une page

L'en-tête et le pied de page sont recopiés depuis `portfolio.html` (le site n'a
pas de gabarit, cf. §5). Si la case « ajouter au menu » est cochée, le lien est
inséré dans le menu et le pied de page **des huit pages**, et la page est ajoutée
à `sitemap.xml`. Le `canonical` reprend le domaine des autres pages — donc la
valeur supposée de la §7, à corriger le jour où le domaine réel est connu.

Restent à faire à la main sur une page créée : relire le `<title>` et la
`meta description` (générés), et choisir l'image `og:image` (celle de la page de
référence par défaut).

### Ajouter du contenu : la bibliothèque de blocs

`admin/lib/blocs.mjs` décrit à la fois **comment nommer** les blocs existants et
**quel balisage produire** pour les nouveaux. Les modèles n'emploient que des
classes déjà définies dans `style.css` (`section`, `split`, `gallery`, `card`,
`btn`…) : ne pas inventer de classe sans ajouter la règle correspondante dans la
bonne section de la feuille de style. Seule exception introduite avec
l'administration : `.figure-libre` (image isolée), §7 de `style.css`.

Les modèles disponibles dépendent de l'endroit visé (`contexteDe`) : sections à
la racine de `<main>`, blocs de contenu dans une section, vignettes dans une
galerie, éléments dans une liste, cartes dans une grille.

### Sélection dans l'aperçu

L'aperçu est servi avec `?apercu=1`, ce qui **injecte à la lecture**
`admin/apercu.js` — ce script n'est jamais écrit dans les fichiers. Il repère un
bloc par sa suite d'indices d'éléments depuis `<main>` (« 2.0.1.1 »), la même que
celle calculée côté serveur : c'est ce qui permet de cliquer dans la page pour
sélectionner un bloc. Si l'un des deux calculs change, l'autre doit changer aussi.

### Limites assumées

- Pas de suppression de page ni de renommage : à faire à la main (et à
  répercuter dans le menu, `sitemap.xml` et les liens internes).
- Pas de suppression de fichier image : l'administration retire une image d'une
  page, jamais du dossier `assets/img/`.
- Le formulaire de contact, le JSON-LD et les mentions légales ne sont pas
  modifiables ici : ils se modifient dans les fichiers.
- Un seul utilisateur à la fois : deux onglets ouverts sur la même page peuvent
  écrire l'un sur l'autre.
