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

Le site est **bilingue français / anglais**, et prêt à accueillir d'autres
langues : voir §14. Le français est la langue par défaut, à la racine.

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
├── en/                             Version anglaise, mêmes noms de fichiers (§14)
├── langues.json                    Langues du site — source unique (§14)
├── outils/langues.mjs              Sélecteur, hreflang, sitemap, robots (§14)
├── robots.txt · sitemap.xml        ⚠️ régénérés par outils/langues.mjs
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
**Le code reste en français** : commentaires, noms de variables, noms de classes
métier, messages de commit — quelle que soit la langue de la page produite.

**Le contenu suit la langue de la page.** Les règles typographiques françaises
(apostrophes typographiques `'`, espaces insécables avant `?` `!` `:` `;` en
`&nbsp;`) ne valent que pour les pages françaises : **ne pas les reporter dans
`en/`**, où l'on écrit `A question about our services?` sans espace.

L'anglais du site est de l'**anglais britannique** (`og:locale` `en_GB`).

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
  pages de chaque langue** — 16 fichiers aujourd'hui. Vérifier ensuite avec :
  ```bash
  grep -c "footer__grid" *.html en/*.html
  ```
  Seules exceptions : le sélecteur de langue et les liens `hreflang`, régénérés
  par `node outils/langues.mjs synchroniser` (§14).
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
| Mentions légales | `mentions-legales.html`, `en/mentions-legales.html` | Renseigner SIRET, forme juridique, TVA, hébergeur. Champs entre `[crochets]` — dans les deux langues. |
| Domaine | `langues.json` | Les `canonical`, `hreflang`, `robots.txt` et `sitemap.xml` dérivent tous du champ `domaine` : y corriger `https://www.atelierannefricher.fr/` — valeur supposée — puis lancer `node outils/langues.mjs synchroniser` (§14). |
| Traduction à relire | `en/` | Les huit pages anglaises sont une traduction de la version française, à faire relire par un anglophone ou par Anne Fricher (vocabulaire métier : *soft furnishings*, *wave heading*, *Roman blind*…). |
| Formulaire de contact | `contact.html`, `en/contact.html`, `main.js` | Fonctionne actuellement en `mailto:` (voir §8). |
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
node outils/langues.mjs verifier
node serve.mjs
```

- Aucun style en ligne : `grep -c 'style="' *.html en/*.html` doit renvoyer `0` partout.
- En-tête et pied de page identiques sur les 8 pages de chaque langue.
- Sélecteur de langue : la bascule FR/EN ramène bien à la même page, en bureau
  comme en mobile.
- Rendu vérifié à 375 px (mobile), 768 px (tablette) et 1280 px (bureau).
- Menu mobile : ouverture, fermeture par Échap, fermeture au clic sur un lien.
- Visionneuse : flèches, Échap, balayage tactile, focus rendu à la vignette.
- Console du navigateur vide.

## 12. Coordonnées de référence

```
Atelier Anne Fricher
2 rue Villars, 30000 Nîmes, France
06 74 39 85 93          (affiché +33 6 74 39 85 93 sur les pages anglaises)
atelierannefricher@outlook.fr
facebook.com/AtelierFricher · instagram.com/anne_fri
```

Ces valeurs apparaissent dans le pied de page de chaque page, dans l'en-tête, sur
la page Contact et dans le JSON-LD des deux pages d'accueil. **En cas de
modification, les mettre à jour partout** :

```bash
grep -rn "0674398593\|74 39 85 93\|atelierannefricher@outlook.fr\|rue Villars" *.html en/*.html
```

Le `href` du téléphone est identique partout (`tel:+33674398593`) ; seul le texte
affiché change d'une langue à l'autre (§14).

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

**Tous les clics de l'aperçu sont interceptés**, pas seulement ceux qui tombent
sur un bloc. C'est indispensable : un lien du menu ou du pied de page menait la
page hors du mode `?apercu=1`, où le script n'est plus injecté — l'aperçu
devenait inéditable jusqu'au rechargement ; et le menu mobile ou la visionneuse,
en `position: fixed`, recouvraient le contenu et absorbaient les clics suivants.
Un clic hors de `<main>` sur un lien de page demande donc à l'administration
d'**ouvrir cette page** (le sélecteur de langue de l'aperçu bascule ainsi
d'une langue à l'autre) ; les autres clics n'affichent qu'une explication.
Un filet de sécurité côté `admin.js` (`surChargementApercu`) rattrape malgré
tout une navigation qui passerait autrement.

### Limites assumées

- Pas de suppression de page ni de renommage : à faire à la main (et à
  répercuter dans le menu, les autres langues, `sitemap.xml` et les liens
  internes), puis lancer `node outils/langues.mjs synchroniser`.
- Pas de suppression de fichier image : l'administration retire une image d'une
  page, jamais du dossier `assets/img/`.
- Le formulaire de contact, le JSON-LD et les mentions légales ne sont pas
  modifiables ici : ils se modifient dans les fichiers.
- Un seul utilisateur à la fois : deux onglets ouverts sur la même page peuvent
  écrire l'un sur l'autre.
- Les pages de toutes les langues sont éditables, mais **une page ne peut être
  créée qu'en langue par défaut** : voir §14 pour la marche à suivre.

---

## 14. Site multilingue

Le site existe en **français** (langue par défaut) et en **anglais**, et
l'architecture est prévue pour en accueillir d'autres.

### Où vivent les langues

```
/                     français — inchangé, à la racine
  index.html · services.html · portfolio.html · …
/en/                  anglais — mêmes noms de fichiers
  index.html · services.html · portfolio.html · …
/xx/                  toute langue future, créée par l'outil (§ ci-dessous)
assets/               partagé par toutes les langues
```

**Les noms de fichiers sont identiques dans toutes les langues** — `en/` contient
bien `projet-coussinage.html` et non `project-cushions.html`. C'est un choix
délibéré : le passage d'une langue à l'autre, les liens `hreflang` et le plan du
site deviennent une simple substitution de préfixe, et ajouter une langue reste
une opération mécanique. Traduire les noms de fichiers casserait cette
correspondance ; ne le faire que si le référencement l'impose vraiment, et alors
prévoir une table de correspondance dans `langues.json`.

Le français reste à la racine : les adresses existantes, `serve.mjs`, l'ouverture
en `file://` et l'administration continuent de fonctionner sans rien changer.

### `langues.json` — la source unique

```json
{
  "domaine": "https://www.atelierannefricher.fr/",
  "defaut": "fr",
  "langues": [
    { "code": "fr", "dossier": "",    "etiquette": "FR", "nom": "Français",
      "locale": "fr_FR", "selecteur": "Langue du site" },
    { "code": "en", "dossier": "en/", "etiquette": "EN", "nom": "English",
      "locale": "en_GB", "selecteur": "Site language" }
  ]
}
```

`selecteur` est le libellé accessible du groupe de liens, dans la langue
concernée. `etiquette` est ce qui s'affiche dans l'en-tête (`FR`, `EN`).

### L'outil `outils/langues.mjs`

```bash
node outils/langues.mjs verifier       # contrôle la cohérence, ne modifie rien
node outils/langues.mjs synchroniser   # régénère tout ce qui est dérivé
node outils/langues.mjs ajouter es "Español" ES es_ES "Idioma del sitio"
```

Comme `admin.mjs`, cet outil **écrit directement dans les fichiers `.html`** :
ce n'est pas une étape de build, les fichiers restent la source de vérité et la
§2 est intacte.

`synchroniser` régénère, à partir de `langues.json` et de l'inventaire réel des
fichiers :

- le **sélecteur de langue** de l'en-tête, entre
  `<!-- ===== SÉLECTEUR DE LANGUE ===== -->` et son marqueur de fermeture ;
- les liens **`rel="alternate" hreflang`** du `<head>`, entre
  `<!-- ===== ALTERNATIVES DE LANGUE ===== -->` et son marqueur ;
- **`sitemap.xml`** en entier, avec les `<xhtml:link>` d'alternance ;
- le bloc d'exclusions de **`robots.txt`** (pages en `noindex`).

Si les marqueurs sont absents d'une page, l'outil les pose : la tête après le
`<link rel="canonical">`, le sélecteur juste avant le `<a class="header__cta">`.
Une page créée par l'administration est donc réparée toute seule.

Deux règles importantes, appliquées automatiquement :

- une page **non traduite** n'apparaît ni en `hreflang` ni dans `sitemap.xml` —
  cela produirait des 404 pour les moteurs ;
- dans le **sélecteur**, en revanche, la langue reste toujours proposée : si la
  page n'existe pas dans cette langue, le lien mène à son accueil.

### Ajouter une langue

```bash
node outils/langues.mjs ajouter es "Español" ES es_ES "Idioma del sitio"
```

La commande crée `es/` en recopiant les pages françaises, corrige `<html lang>`,
les chemins `assets/` (`../assets/…`), le `canonical` et `og:locale`, inscrit la
langue dans `langues.json`, puis synchronise tout le site. Restent à faire :

1. **traduire** le contenu de `es/` — les pages sont encore en français ;
2. ajouter les libellés `es` dans `TEXTES`, en tête de `assets/js/main.js` ;
3. relire `<title>`, `meta description` et `og:description` de chaque page.

### Retirer une langue

Il n'y a pas de commande dédiée, mais trois gestes suffisent :

```bash
rm -r es/                              # 1. supprimer le dossier
                                       # 2. retirer son entrée de langues.json
node outils/langues.mjs synchroniser   # 3. resynchroniser
```

La synchronisation nettoie les sélecteurs, les `hreflang`, `sitemap.xml` et
`robots.txt` de toutes les pages restantes.

### Textes construits en JavaScript

`assets/js/main.js` fabrique quelques libellés (menu, visionneuse, message du
formulaire, corps de l'e-mail). Ils sont regroupés dans l'objet `TEXTES` en tête
du fichier et choisis d'après `<html lang>`. **Toute nouvelle chaîne écrite en
JavaScript doit passer par `t("clé")`**, jamais être écrite en dur.

### Le sélecteur de langue vit dans `nav#nav`

Il est placé entre le dernier `.nav__link` et le `.header__cta`, à l'intérieur du
menu — il descend donc naturellement dans le panneau mobile. Conséquence pour le
code qui analyse le menu (`admin/lib/pages.mjs`) : ses liens **ne sont pas des
entrées de menu** et sont écartés par `dansLeSelecteurDeLangue()`. Toute nouvelle
lecture du menu doit faire de même.

Styles : `.langues` / `.langues__lien`, §4 de `style.css`, avec les variantes
`.header--over` (au-dessus du hero) et `.nav-open .header--over` (menu mobile
ouvert par-dessus le hero).

### Ce que l'administration sait faire, et pas

`node admin.mjs` liste et modifie les pages **de toutes les langues** — elles
apparaissent avec leur étiquette (`[EN]`) et se désignent par leur chemin,
`en/services.html`. Après une création de page, un changement de menu ou une
annulation, le serveur relance `synchroniser()` tout seul.

En revanche :

- **la création de page reste en langue par défaut** (à la racine). Pour la
  version anglaise, copier le fichier dans `en/`, traduire, puis lancer
  `node outils/langues.mjs synchroniser`.
- l'ajout au menu ne touche que les langues où la page existe déjà — c'est
  voulu : le menu anglais pointerait sinon vers un fichier absent. Relancer
  `synchroniser` (ou rebasculer l'interrupteur du menu) une fois la traduction
  faite.

### Numéro de téléphone

Les pages anglaises affichent le numéro au format international
(`+33 6 74 39 85 93`) ; les pages françaises gardent `06 74 39 85 93`. Le `href`
est le même partout : `tel:+33674398593`. En cherchant les coordonnées (§12),
penser aux deux formes.

### Mentions légales

Les mentions légales sont une obligation de droit français : la version
française fait foi. `en/mentions-legales.html` porte donc un encadré qui le dit
et renvoie vers elle. Les deux versions sont en `noindex` et exclues de
`robots.txt`.

### Contrôles

À ajouter à la liste de la §11 :

```bash
node outils/langues.mjs verifier
```

Cette commande vérifie que chaque langue possède toutes les pages, que
`<html lang>`, `canonical` et `og:locale` sont corrects, et que les blocs
régénérés sont à jour.
