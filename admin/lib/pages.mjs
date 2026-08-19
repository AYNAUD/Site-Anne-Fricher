/* =========================================================================
   Pages du site — inventaire, création, synchronisation du menu.

   L'en-tête et le pied de page sont dupliqués dans chaque fichier (le site
   n'a pas de gabarit) : toute page créée ici recopie donc ceux d'une page
   de référence, et l'ajout au menu est répercuté dans toutes les pages.
   ========================================================================= */
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  analyser, trouver, appliquer, valeurAttribut, aClasse,
  nettoyerAttribut, echapperAttribut
} from "./html.mjs";

import { titreDe, metaDe } from "./document.mjs";
import { modele } from "./blocs.mjs";
import { dimensions } from "./images.mjs";

/** Page dont on recopie l'en-tête et le pied de page. */
const REFERENCE = "portfolio.html";

/** Repère du sélecteur de langue dans l'en-tête (cf. outils/langues.mjs). */
const MARQUEUR_LANGUES = "<!-- ===== SÉLECTEUR DE LANGUE ===== -->";

/* ------------------------------------------------------------------ *
   Inventaire

   Le site est multilingue (cf. CLAUDE.md §14) : la langue par défaut est à
   la racine, les autres dans un sous-dossier (`en/`, `es/`…) déclaré par
   `langues.json`. Une page est donc désignée par son chemin relatif à la
   racine du site — « services.html » ou « en/services.html ».
 * ------------------------------------------------------------------ */
async function languesDuSite(racine) {
  try {
    const manifeste = JSON.parse(await readFile(join(racine, "langues.json"), "utf8"));
    return manifeste.langues.map((l) => ({
      code: l.code,
      dossier: l.dossier || "",
      etiquette: l.etiquette || l.code.toUpperCase(),
      defaut: l.code === manifeste.defaut
    }));
  } catch {
    return [{ code: "fr", dossier: "", etiquette: "FR", defaut: true }];
  }
}

async function pagesDuDossier(racine, dossier) {
  const entrees = await readdir(join(racine, dossier), { withFileTypes: true }).catch(() => []);
  return entrees
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => e.name);
}

export async function listerPages(racine) {
  const langues = await languesDuSite(racine);
  const pages = [];

  for (const langue of langues) {
    for (const nom of await pagesDuDossier(racine, langue.dossier)) {
      const relatif = langue.dossier + nom;
      const chemin = join(racine, relatif);
      const src = await readFile(chemin, "utf8");
      const info = await stat(chemin).catch(() => null);
      const meta = metaDe(src);
      pages.push({
        fichier: relatif,
        langue: langue.code,
        etiquetteLangue: langue.etiquette,
        titre: (titreDe(src) || nom) + (langue.defaut ? "" : ` [${langue.etiquette}]`),
        titreOnglet: meta.titre,
        description: meta.description,
        dansLeMenu: estDansLeMenu(src, nom),
        modifie: info ? info.mtimeMs : 0
      });
    }
  }

  const rangLangue = (p) => langues.findIndex((l) => l.code === p.langue);
  const ordre = ["index.html", "services.html", "portfolio.html", "atelier.html", "contact.html"];
  const rangPage = (p) => {
    const nom = p.fichier.slice(p.fichier.lastIndexOf("/") + 1);
    return ordre.indexOf(nom) === -1 ? 99 : ordre.indexOf(nom);
  };
  return pages.sort((a, b) =>
    rangLangue(a) - rangLangue(b) ||
    rangPage(a) - rangPage(b) ||
    a.fichier.localeCompare(b.fichier, "fr"));
}

function navPrincipale(doc) {
  return trouver(doc, (n) => n.type === "element" && n.nom === "nav" && valeurAttribut(n, "id") === "nav");
}

function navPiedDePage(doc) {
  const pied = trouver(doc, (n) => n.type === "element" && n.nom === "footer");
  if (!pied) return null;
  return trouver(pied, (n) =>
    n.type === "element" && n.nom === "ul" &&
    !!trouver(n, (l) => l.nom === "a" && valeurAttribut(l, "href") === "index.html"));
}

/**
 * Le sélecteur de langue vit lui aussi dans `nav#nav` et pointe vers la page
 * courante dans chaque langue : ses liens ne sont pas des entrées de menu et
 * doivent être ignorés partout où l'on cherche un lien de navigation.
 */
function dansLeSelecteurDeLangue(noeud) {
  for (let n = noeud; n; n = n.parent) {
    if (n.type === "element" && aClasse(n, "langues")) return true;
  }
  return false;
}

const lienDeMenu = (fichier) => (n) =>
  n.nom === "a" && valeurAttribut(n, "href") === fichier && !dansLeSelecteurDeLangue(n);

function estDansLeMenu(src, fichier) {
  const nav = navPrincipale(analyser(src));
  if (!nav) return false;
  return !!trouver(nav, lienDeMenu(fichier));
}

/* ------------------------------------------------------------------ *
   Nom de fichier
 * ------------------------------------------------------------------ */
export function nomDeFichier(titre, propose) {
  const brut = propose || titre;
  const base = String(brut)
    .replace(/\.html?$/i, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!base) throw new Error("Impossible de déduire un nom de fichier de ce titre.");
  return base + ".html";
}

/* ------------------------------------------------------------------ *
   Menu : ajout et retrait dans toutes les pages
 * ------------------------------------------------------------------ */
function ajouterAuMenuDansUneSource(src, fichier, libelle, pageCourante) {
  const doc = analyser(src);
  const decoupes = [];

  const nav = navPrincipale(doc);
  if (nav) {
    const deja = trouver(nav, lienDeMenu(fichier));
    if (!deja) {
      const courant = pageCourante ? ' aria-current="page"' : "";
      const lien = `<a class="nav__link" href="${echapperAttribut(fichier)}"${courant}>${libelle}</a>`;

      // Le nouveau lien se glisse après le dernier lien de menu, donc avant le
      // sélecteur de langue s'il existe, sinon avant le bouton d'appel.
      const marqueur = src.indexOf(MARQUEUR_LANGUES, nav.debut);
      const cta = trouver(nav, (n) => n.nom === "a" && aClasse(n, "header__cta"));
      const ancre = marqueur !== -1 && marqueur < nav.fin ? marqueur : (cta ? cta.debut : -1);

      if (ancre !== -1) {
        const debutLigne = src.lastIndexOf("\n", ancre - 1) + 1;
        const indentation = src.slice(debutLigne, ancre);
        decoupes.push({ debut: debutLigne, fin: debutLigne, texte: `${indentation}${lien}\n` });
      } else {
        decoupes.push({ debut: nav.finInterieur, fin: nav.finInterieur, texte: `  ${lien}\n    ` });
      }
    }
  }

  const liste = navPiedDePage(doc);
  if (liste) {
    const deja = trouver(liste, (n) => n.nom === "a" && valeurAttribut(n, "href") === fichier);
    if (!deja) {
      const items = liste.enfants.filter((n) => n.type === "element" && n.nom === "li");
      const dernier = items[items.length - 1];
      const item = `<li><a href="${echapperAttribut(fichier)}">${libelle}</a></li>`;
      if (dernier) {
        const debutLigne = src.lastIndexOf("\n", dernier.debut - 1) + 1;
        const indentation = src.slice(debutLigne, dernier.debut);
        decoupes.push({ debut: dernier.fin, fin: dernier.fin, texte: `\n${indentation}${item}` });
      } else {
        decoupes.push({ debut: liste.finInterieur, fin: liste.finInterieur, texte: item });
      }
    }
  }

  return appliquer(src, decoupes);
}

function retirerDuMenuDansUneSource(src, fichier) {
  const doc = analyser(src);
  const decoupes = [];

  for (const conteneur of [navPrincipale(doc), navPiedDePage(doc)]) {
    if (!conteneur) continue;
    const lien = trouver(conteneur, lienDeMenu(fichier));
    if (!lien) continue;
    // On retire l'élément de liste entier dans le pied de page
    const cible = lien.parent && lien.parent.nom === "li" ? lien.parent : lien;
    const debutLigne = src.lastIndexOf("\n", cible.debut - 1) + 1;
    const debut = src.slice(debutLigne, cible.debut).trim() ? cible.debut : debutLigne;
    const finLigne = src.indexOf("\n", cible.fin);
    const fin = finLigne !== -1 && !src.slice(cible.fin, finLigne).trim() ? finLigne + 1 : cible.fin;
    decoupes.push({ debut, fin, texte: "" });
  }

  return appliquer(src, decoupes);
}

/**
 * Ajoute (ou retire) une page du menu de toutes les pages du site.
 *
 * Les liens du menu sont relatifs au dossier de la page : `services.html`
 * désigne la version française à la racine et la version anglaise dans
 * `en/`. On ne touche donc au menu d'une langue que si la page existe
 * bel et bien dans cette langue — sans quoi le menu anglais pointerait
 * vers un fichier absent.
 */
export async function synchroniserMenu(racine, fichier, libelle, present, ecrire) {
  const langues = await languesDuSite(racine);
  const dossier = fichier.includes("/") ? fichier.slice(0, fichier.lastIndexOf("/") + 1) : "";
  const nom = fichier.slice(dossier.length);
  const touchees = [];

  for (const langue of langues) {
    const pages = await pagesDuDossier(racine, langue.dossier);
    if (present && !pages.includes(nom)) continue;

    for (const page of pages) {
      const relatif = langue.dossier + page;
      const src = await readFile(join(racine, relatif), "utf8");
      const sortie = present
        ? ajouterAuMenuDansUneSource(src, nom, libelle, relatif === fichier)
        : retirerDuMenuDansUneSource(src, nom);
      if (sortie !== src) {
        await ecrire(relatif, sortie);
        touchees.push(relatif);
      }
    }
  }

  return touchees;
}

/* ------------------------------------------------------------------ *
   Langues : sélecteur, hreflang, plan du site, robots.txt

   Tout cela est dérivé de `langues.json` et de l'inventaire réel des
   fichiers : plutôt que de rafistoler `sitemap.xml` page par page, on
   relance la synchronisation complète (cf. outils/langues.mjs). Elle est
   idempotente, ce qui la rend sûre après une création de page comme après
   une annulation.
 * ------------------------------------------------------------------ */
export async function synchroniserLangues() {
  try {
    const { synchroniser } = await import("../../outils/langues.mjs");
    await synchroniser();
    return true;
  } catch (err) {
    console.warn("⚠ Synchronisation des langues impossible : " + err.message);
    return false;
  }
}

/* ------------------------------------------------------------------ *
   Création d'une page
 * ------------------------------------------------------------------ */
const MODELES_PAGE = [
  {
    cle: "simple",
    nom: "Page simple",
    description: "En-tête de page, une section de texte et un bandeau d'appel."
  },
  {
    cle: "galerie",
    nom: "Page galerie",
    description: "En-tête de page, une galerie d'images et un bandeau d'appel."
  },
  {
    cle: "vide",
    nom: "Page vide",
    description: "Seulement l'en-tête de page ; tout le reste sera ajouté ensuite."
  }
];

export const modelesDePage = () => MODELES_PAGE;

function contenuDeModele(cleModele, { titre, chapo, illustration }) {
  const tete = modele("section-tete").construire({ titre, texte: chapo, surtitre: "" }, 1);

  if (cleModele === "vide") return tete;

  const bandeau = modele("section-bandeau").construire({
    image: illustration,
    surtitre: "Parlons de votre projet",
    titre: "Un rendez-vous, un devis, sans engagement",
    texte: "Décrivez-nous votre pièce et vos envies : nous vous rappelons pour convenir d'une visite.",
    bouton: "Nous écrire",
    lien: "contact.html",
    bouton2: "06 74 39 85 93",
    lien2: "tel:+33674398593"
  }, 1);

  if (cleModele === "galerie") {
    const galerie = modele("section-galerie").construire({
      surtitre: "Galerie",
      titre: "Quelques images",
      texte: "Cliquez sur une image pour l'agrandir.",
      nomGalerie: "nouvelle-galerie",
      images: []
    }, 1);
    return [tete, galerie, bandeau].join("\n\n");
  }

  const section = modele("section-texte").construire({
    surtitre: "",
    titre: "À compléter",
    texte: "Rédigez ici le contenu de cette page.",
    fond: false
  }, 1);
  return [tete, section, bandeau].join("\n\n");
}

/**
 * Crée une page à partir de l'en-tête et du pied de page de `portfolio.html`.
 * Ne touche pas au menu : `synchroniserMenu` s'en charge ensuite.
 */
export async function creerPage(racine, options) {
  const titre = String(options.titre || "").trim();
  if (!titre) throw new Error("Le titre de la page est obligatoire.");

  const fichier = nomDeFichier(titre, options.fichier);
  if (await stat(join(racine, fichier)).then(() => true).catch(() => false)) {
    throw new Error(`Le fichier ${fichier} existe déjà.`);
  }

  const src = await readFile(join(racine, REFERENCE), "utf8");
  const doc = analyser(src);
  const entete = trouver(doc, (n) => n.type === "element" && n.nom === "header");
  const pied = trouver(doc, (n) => n.type === "element" && n.nom === "footer");
  if (!entete || !pied) throw new Error(`Impossible de lire l'en-tête de ${REFERENCE}.`);

  const canonique = trouver(doc, (n) => n.nom === "link" && valeurAttribut(n, "rel") === "canonical");
  const base = canonique
    ? valeurAttribut(canonique, "href").replace(/[^/]*$/, "")
    : "https://www.atelierannefricher.fr/";

  const ogImage = trouver(doc, (n) => n.nom === "meta" && valeurAttribut(n, "property") === "og:image");
  const image = options.image || (ogImage ? valeurAttribut(ogImage, "content") : "assets/img/realisations/r08.jpeg");

  // Photo de fond du bandeau final : celle de la page de référence, avec ses
  // dimensions réelles (le site exige `width` et `height` sur chaque image).
  const taille = await dimensions(join(racine, image));
  const illustration = taille
    ? { chemin: image, largeur: taille.largeur, hauteur: taille.hauteur }
    : { chemin: image };

  const titreOnglet = options.titreOnglet ||
    `${titre} | Atelier Anne Fricher`;
  const description = options.description ||
    `${titre} — Atelier Anne Fricher, couture d'ameublement et décoration à Nîmes.`;

  // Le lien du menu de la nouvelle page est marqué page courante par
  // `synchroniserMenu`; ici on recopie l'en-tête tel quel, sans marqueur.
  const enteteSource = src.slice(entete.debut, entete.fin)
    .replace(/\s+aria-current="page"/g, "");
  const piedSource = src.slice(pied.debut, pied.fin);

  const page = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${nettoyerAttribut(titreOnglet)}</title>
<meta name="description" content="${nettoyerAttribut(description)}">
<link rel="canonical" href="${echapperAttribut(base + fichier)}">
<meta name="theme-color" content="#a9603a">

<meta property="og:type" content="website">
<meta property="og:locale" content="fr_FR">
<meta property="og:site_name" content="Atelier Anne Fricher">
<meta property="og:title" content="${nettoyerAttribut(titreOnglet)}">
<meta property="og:description" content="${nettoyerAttribut(description)}">
<meta property="og:image" content="${echapperAttribut(image)}">

<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/css/style.css">
<script src="assets/js/main.js" defer></script>
</head>

<body>
<a class="skip-link" href="#main">Aller au contenu</a>

${enteteSource}

<main id="main">

${contenuDeModele(options.modele || "simple", { titre, chapo: options.chapo || "", illustration })}

</main>

${piedSource}

</body>
</html>
`;

  return { fichier, contenu: page, libelle: options.libelleMenu || titre };
}
