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

const echapperRegex = (texte) => String(texte).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
import { titreDe, metaDe } from "./document.mjs";
import { modele } from "./blocs.mjs";
import { dimensions } from "./images.mjs";

/** Page dont on recopie l'en-tête et le pied de page. */
const REFERENCE = "portfolio.html";

/* ------------------------------------------------------------------ *
   Inventaire
 * ------------------------------------------------------------------ */
export async function listerPages(racine) {
  const entrees = await readdir(racine, { withFileTypes: true });
  const pages = [];

  for (const entree of entrees) {
    if (!entree.isFile() || !entree.name.endsWith(".html")) continue;
    const chemin = join(racine, entree.name);
    const src = await readFile(chemin, "utf8");
    const info = await stat(chemin).catch(() => null);
    const meta = metaDe(src);
    pages.push({
      fichier: entree.name,
      titre: titreDe(src) || entree.name,
      titreOnglet: meta.titre,
      description: meta.description,
      dansLeMenu: estDansLeMenu(src, entree.name),
      modifie: info ? info.mtimeMs : 0
    });
  }

  const ordre = ["index.html", "services.html", "portfolio.html", "atelier.html", "contact.html"];
  return pages.sort((a, b) => {
    const ia = ordre.indexOf(a.fichier);
    const ib = ordre.indexOf(b.fichier);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.fichier.localeCompare(b.fichier, "fr");
  });
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

function estDansLeMenu(src, fichier) {
  const nav = navPrincipale(analyser(src));
  if (!nav) return false;
  return !!trouver(nav, (n) => n.nom === "a" && valeurAttribut(n, "href") === fichier);
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
    const deja = trouver(nav, (n) => n.nom === "a" && valeurAttribut(n, "href") === fichier);
    if (!deja) {
      const cta = trouver(nav, (n) => n.nom === "a" && aClasse(n, "header__cta"));
      const ancre = cta || null;
      const courant = pageCourante ? ' aria-current="page"' : "";
      const lien = `<a class="nav__link" href="${echapperAttribut(fichier)}"${courant}>${libelle}</a>`;
      if (ancre) {
        const debutLigne = src.lastIndexOf("\n", ancre.debut - 1) + 1;
        const indentation = src.slice(debutLigne, ancre.debut);
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
    const lien = trouver(conteneur, (n) => n.nom === "a" && valeurAttribut(n, "href") === fichier);
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

/** Ajoute (ou retire) une page du menu de toutes les pages du site. */
export async function synchroniserMenu(racine, fichier, libelle, present, ecrire) {
  const entrees = await readdir(racine, { withFileTypes: true });
  const touchees = [];

  for (const entree of entrees) {
    if (!entree.isFile() || !entree.name.endsWith(".html")) continue;
    const chemin = join(racine, entree.name);
    const src = await readFile(chemin, "utf8");
    const sortie = present
      ? ajouterAuMenuDansUneSource(src, fichier, libelle, entree.name === fichier)
      : retirerDuMenuDansUneSource(src, fichier);
    if (sortie !== src) {
      await ecrire(entree.name, sortie);
      touchees.push(entree.name);
    }
  }

  return touchees;
}

/* ------------------------------------------------------------------ *
   Plan du site
 * ------------------------------------------------------------------ */
export async function majSitemap(racine, fichier, present, ecrire) {
  const chemin = join(racine, "sitemap.xml");
  let src;
  try {
    src = await readFile(chemin, "utf8");
  } catch {
    return false;
  }

  const base = (/<loc>(https?:\/\/[^<]*?\/)[^<\/]*<\/loc>/.exec(src) || [])[1] ||
    "https://www.atelierannefricher.fr/";
  const url = base + fichier;

  if (present) {
    if (src.indexOf(`<loc>${url}</loc>`) !== -1) return false;
    const bloc = `  <url>\n    <loc>${url}</loc>\n    <changefreq>yearly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    const position = src.lastIndexOf("</urlset>");
    if (position === -1) return false;
    await ecrire("sitemap.xml", src.slice(0, position) + bloc + src.slice(position));
    return true;
  }

  const motif = new RegExp("\\s*<url>\\s*<loc>" + echapperRegex(url) + "</loc>[\\s\\S]*?</url>", "g");
  const sortie = src.replace(motif, "");
  if (sortie === src) return false;
  await ecrire("sitemap.xml", sortie);
  return true;
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
