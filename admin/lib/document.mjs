/* =========================================================================
   Opérations sur une page du site.

   Toutes les fonctions prennent la source d'une page et renvoient une
   nouvelle source. Les chemins de blocs sont des suites d'indices d'éléments
   depuis <main> (« 2.1.0 »), identiques à ceux calculés dans l'aperçu par
   `admin/apercu.js` : c'est ce qui permet de cliquer dans la page pour
   sélectionner un bloc.
   ========================================================================= */
import { join } from "node:path";
import {
  analyser, trouver, appliquer, valeurAttribut, attribut, interieur,
  nettoyerFragment, nettoyerAttribut, texteVisible
} from "./html.mjs";
import { decrire, ecrireChamp, contexteDe, modele } from "./blocs.mjs";
import { dimensions } from "./images.mjs";

/* ------------------------------------------------------------------ *
   Repérage
 * ------------------------------------------------------------------ */
export function racineContenu(src) {
  const doc = analyser(src);
  const main = trouver(doc, (n) => n.type === "element" && n.nom === "main");
  return { doc, main };
}

const elementsDe = (noeud) => noeud.enfants.filter((n) => n.type === "element");

/** Résout un chemin « 2.1.0 » en nœud, depuis <main>. */
export function noeudDeChemin(main, chemin) {
  if (chemin === "" || chemin === null || chemin === undefined) return main;
  let noeud = main;
  for (const part of String(chemin).split(".")) {
    const enfants = elementsDe(noeud);
    const index = Number(part);
    if (!Number.isInteger(index) || !enfants[index]) return null;
    noeud = enfants[index];
  }
  return noeud;
}

/* ------------------------------------------------------------------ *
   Champs d'un bloc
 * ------------------------------------------------------------------ */
/**
 * Champs modifiables d'un nœud. Pour une vignette de galerie, ceux de
 * l'image qu'elle contient sont remontés au même niveau (préfixe `img_`).
 */
export function champsDe(src, noeud) {
  const description = decrire(src, noeud);
  const champs = description.champs.map((c) => Object.assign({}, c));

  if (description.type === "vignette") {
    const img = noeud.enfants.find((n) => n.type === "element" && n.nom === "img");
    if (img) {
      for (const c of decrire(src, img).champs) {
        champs.push(Object.assign({}, c, { nom: "img_" + c.nom, sur: "img" }));
      }
    }
  }
  return { description, champs };
}

function noeudCible(noeud, champ) {
  if (champ.sur === "img") {
    return noeud.nom === "img"
      ? noeud
      : noeud.enfants.find((n) => n.type === "element" && n.nom === "img") || null;
  }
  return noeud;
}

/* ------------------------------------------------------------------ *
   Arborescence transmise à l'interface
 * ------------------------------------------------------------------ */
function blocDe(src, noeud, chemin) {
  const { description, champs } = champsDe(src, noeud);
  const enfants = [];

  if (!description.feuille) {
    elementsDe(noeud).forEach((enfant, i) => {
      const sousChemin = chemin === "" ? String(i) : `${chemin}.${i}`;
      const sousBloc = blocDe(src, enfant, sousChemin);
      if (!sousBloc.masque) enfants.push(sousBloc);
    });
  }

  return {
    chemin,
    balise: noeud.nom,
    classe: valeurAttribut(noeud, "class"),
    type: description.type,
    etiquette: description.etiquette,
    apercu: description.apercu || "",
    masque: description.masque === true,
    contexte: description.feuille ? null : contexteDe(noeud),
    champs,
    enfants
  };
}

/** Métadonnées de référencement de la page. */
export function metaDe(src) {
  const doc = analyser(src);
  const tete = trouver(doc, (n) => n.type === "element" && n.nom === "head");
  const lire = (predicat) => (tete ? trouver(tete, predicat) : null);

  const titre = lire((n) => n.nom === "title");
  const description = lire((n) => n.nom === "meta" && valeurAttribut(n, "name") === "description");
  const ogTitre = lire((n) => n.nom === "meta" && valeurAttribut(n, "property") === "og:title");
  const ogDesc = lire((n) => n.nom === "meta" && valeurAttribut(n, "property") === "og:description");
  const canonique = lire((n) => n.nom === "link" && valeurAttribut(n, "rel") === "canonical");

  return {
    titre: titre ? interieur(src, titre).trim() : "",
    description: description ? valeurAttribut(description, "content") : "",
    ogTitre: ogTitre ? valeurAttribut(ogTitre, "content") : "",
    ogDescription: ogDesc ? valeurAttribut(ogDesc, "content") : "",
    canonique: canonique ? valeurAttribut(canonique, "href") : ""
  };
}

/** Arbre complet d'une page pour l'interface d'administration. */
export function arbreDe(src) {
  const { main } = racineContenu(src);
  const blocs = [];
  if (main) {
    elementsDe(main).forEach((enfant, i) => {
      const bloc = blocDe(src, enfant, String(i));
      if (!bloc.masque) blocs.push(bloc);
    });
  }
  return {
    meta: metaDe(src),
    contexteRacine: "page",
    blocs
  };
}

/* ------------------------------------------------------------------ *
   Étendue d'un bloc dans le fichier
 * ------------------------------------------------------------------ */
function debutDeLigne(src, pos) {
  return src.lastIndexOf("\n", pos - 1) + 1;
}

function indentationDe(src, pos) {
  const debut = debutDeLigne(src, pos);
  return (/^[ \t]*/.exec(src.slice(debut, pos)) || [""])[0];
}

/**
 * Étendue d'un bloc : le nœud, précédé du commentaire de section qui
 * l'annonce le cas échéant (« <!-- ===== HERO ===== --> »).
 */
function etendue(src, noeud) {
  let debut = noeud.debut;
  const freres = noeud.parent ? noeud.parent.enfants : [];
  const position = freres.indexOf(noeud);

  for (let i = position - 1; i >= 0; i--) {
    const precedent = freres[i];
    if (precedent.type === "texte") {
      if (src.slice(precedent.debut, precedent.fin).trim()) break;
      continue;
    }
    if (precedent.type === "commentaire" && src.slice(precedent.fin, debut).indexOf("\n") !== -1) {
      debut = precedent.debut;
    }
    break;
  }

  return { debut, fin: noeud.fin };
}

/** Étendue élargie aux blancs de ligne, pour une suppression propre. */
function etendueLigne(src, noeud) {
  const { debut, fin } = etendue(src, noeud);
  let d = debut;
  const ligne = debutDeLigne(src, debut);
  if (!src.slice(ligne, debut).trim()) d = ligne;

  let f = fin;
  const finLigne = src.indexOf("\n", fin);
  if (finLigne !== -1 && !src.slice(fin, finLigne).trim()) f = finLigne + 1;

  return { debut: d, fin: f };
}

/**
 * Séparation employée entre deux blocs frères : ligne simple ou ligne vide.
 * Permet aux blocs ajoutés d'adopter l'aération du fichier existant.
 */
function separationDe(src, freres) {
  for (let i = 1; i < freres.length; i++) {
    const entre = src.slice(freres[i - 1].fin, etendue(src, freres[i]).debut);
    if (/\n[ \t]*\n/.test(entre)) return "\n\n";
  }
  return "\n";
}

/** Réindente un fragment généré (indenté à partir de la colonne 0). */
function indenter(html, indentation) {
  return html
    .split("\n")
    .map((l) => (l.trim() ? indentation + l : l))
    .join("\n");
}

/* ------------------------------------------------------------------ *
   Modification des champs d'un bloc
 * ------------------------------------------------------------------ */
export async function modifierBloc(src, chemin, valeurs, { racine }) {
  const { main } = racineContenu(src);
  if (!main) throw new Error("La page ne contient pas de balise <main>.");

  const noeud = noeudDeChemin(main, chemin);
  if (!noeud) throw new Error("Bloc introuvable — la page a peut-être changé.");

  const { champs } = champsDe(src, noeud);
  const decoupes = [];
  const imagesModifiees = [];

  for (const champ of champs) {
    if (!(champ.nom in valeurs)) continue;
    const cible = noeudCible(noeud, champ);
    if (!cible) continue;

    const valeur = valeurs[champ.nom];
    const decoupe = ecrireChamp(src, cible, champ, valeur);
    if (decoupe) decoupes.push(decoupe);

    if (cible.nom === "img" && champ.attribut === "src" && String(valeur) !== champ.valeur) {
      imagesModifiees.push({ noeud: cible, chemin: String(valeur) });
    }
  }

  // Une image remplacée entraîne la mise à jour de ses dimensions :
  // `width` et `height` sont obligatoires sur tout le site.
  for (const image of imagesModifiees) {
    const taille = await dimensions(join(racine, image.chemin.split("/").join("/")));
    if (!taille) continue;
    for (const [nom, valeur] of [["width", taille.largeur], ["height", taille.hauteur]]) {
      const decoupe = ecrireChamp(src, image.noeud, { attribut: nom }, String(valeur));
      if (decoupe) decoupes.push(decoupe);
    }
  }

  return appliquer(src, decoupes);
}

/* ------------------------------------------------------------------ *
   Déplacement, suppression, duplication
 * ------------------------------------------------------------------ */
export function deplacerBloc(src, chemin, sens) {
  const { main } = racineContenu(src);
  const noeud = noeudDeChemin(main, chemin);
  if (!noeud || !noeud.parent) throw new Error("Bloc introuvable.");

  const freres = elementsDe(noeud.parent);
  const index = freres.indexOf(noeud);
  const voisinIndex = index + (sens < 0 ? -1 : 1);
  if (voisinIndex < 0 || voisinIndex >= freres.length) {
    throw new Error("Ce bloc est déjà à l'extrémité.");
  }

  const a = etendue(src, freres[Math.min(index, voisinIndex)]);
  const b = etendue(src, freres[Math.max(index, voisinIndex)]);

  return appliquer(src, [
    { debut: a.debut, fin: a.fin, texte: src.slice(b.debut, b.fin) },
    { debut: b.debut, fin: b.fin, texte: src.slice(a.debut, a.fin) }
  ]);
}

export function supprimerBloc(src, chemin) {
  const { main } = racineContenu(src);
  const noeud = noeudDeChemin(main, chemin);
  if (!noeud) throw new Error("Bloc introuvable.");
  if (noeud === main) throw new Error("Impossible de supprimer le contenu entier de la page.");

  const zone = etendueLigne(src, noeud);
  return appliquer(src, [{ debut: zone.debut, fin: zone.fin, texte: "" }]);
}

export function dupliquerBloc(src, chemin) {
  const { main } = racineContenu(src);
  const noeud = noeudDeChemin(main, chemin);
  if (!noeud) throw new Error("Bloc introuvable.");

  const zone = etendue(src, noeud);
  const indentation = indentationDe(src, zone.debut);
  const copie = src.slice(zone.debut, zone.fin);
  return appliquer(src, [{ debut: zone.fin, fin: zone.fin, texte: `\n${indentation}${copie}` }]);
}

/* ------------------------------------------------------------------ *
   Ajout d'un bloc
 * ------------------------------------------------------------------ */
/** Complète les valeurs d'images avec leurs dimensions réelles. */
async function enrichirImages(valeurs, champs, racine) {
  const sortie = Object.assign({}, valeurs);

  for (const champ of champs) {
    if (champ.type === "image") {
      const brut = valeurs[champ.nom];
      const chemin = typeof brut === "string" ? brut : brut && brut.chemin;
      if (!chemin) { sortie[champ.nom] = null; continue; }
      const taille = await dimensions(join(racine, chemin));
      sortie[champ.nom] = {
        chemin,
        alt: (brut && brut.alt) || valeurs.alt || "",
        largeur: taille ? taille.largeur : null,
        hauteur: taille ? taille.hauteur : null
      };
    }

    if (champ.type === "images") {
      const liste = Array.isArray(valeurs[champ.nom]) ? valeurs[champ.nom] : [];
      const enrichies = [];
      for (const brut of liste) {
        const chemin = typeof brut === "string" ? brut : brut && brut.chemin;
        if (!chemin) continue;
        const taille = await dimensions(join(racine, chemin));
        enrichies.push({
          chemin,
          alt: (brut && brut.alt) || "",
          legende: (brut && brut.legende) || "",
          largeur: taille ? taille.largeur : null,
          hauteur: taille ? taille.hauteur : null
        });
      }
      sortie[champ.nom] = enrichies;
    }
  }

  return sortie;
}

/**
 * Insère un bloc issu de la bibliothèque.
 * @param {string} cheminParent chemin du conteneur ("" pour <main>)
 * @param {number} position index d'insertion parmi les éléments du conteneur
 */
export async function ajouterBloc(src, cheminParent, position, cleModele, valeurs, { racine }) {
  const { main } = racineContenu(src);
  if (!main) throw new Error("La page ne contient pas de balise <main>.");

  const parent = noeudDeChemin(main, cheminParent);
  if (!parent) throw new Error("Emplacement introuvable.");

  const gabarit = modele(cleModele);
  if (!gabarit) throw new Error("Modèle de bloc inconnu.");
  if (gabarit.contextes.indexOf(contexteDe(parent)) === -1) {
    throw new Error("Ce type de bloc ne peut pas être placé ici.");
  }

  const completees = await enrichirImages(valeurs || {}, gabarit.champs, racine);
  const html = gabarit.construire(completees, 0);
  if (!html.trim()) throw new Error("Le bloc à ajouter est vide.");

  const freres = elementsDe(parent);
  const index = Math.max(0, Math.min(Number(position), freres.length));

  if (!freres.length) {
    const indentation = indentationDe(src, parent.debut) + "  ";
    return appliquer(src, [{
      debut: parent.debutInterieur,
      fin: parent.finInterieur,
      texte: `\n${indenter(html, indentation)}\n${indentationDe(src, parent.debut)}`
    }]);
  }

  const separateur = separationDe(src, freres);

  if (index >= freres.length) {
    const dernier = freres[freres.length - 1];
    const zone = etendue(src, dernier);
    const indentation = indentationDe(src, zone.debut);
    return appliquer(src, [{
      debut: zone.fin, fin: zone.fin, texte: `${separateur}${indenter(html, indentation)}`
    }]);
  }

  const suivant = etendue(src, freres[index]);
  const indentation = indentationDe(src, suivant.debut);
  const debutLigne = debutDeLigne(src, suivant.debut);
  const point = src.slice(debutLigne, suivant.debut).trim() ? suivant.debut : debutLigne;
  return appliquer(src, [{
    debut: point, fin: point, texte: `${indenter(html, indentation)}${separateur}`
  }]);
}

/* ------------------------------------------------------------------ *
   Métadonnées de la page
 * ------------------------------------------------------------------ */
export function modifierMeta(src, valeurs) {
  const doc = analyser(src);
  const tete = trouver(doc, (n) => n.type === "element" && n.nom === "head");
  if (!tete) throw new Error("La page ne contient pas de balise <head>.");

  const decoupes = [];
  const chercher = (predicat) => trouver(tete, predicat);

  if (typeof valeurs.titre === "string") {
    const titre = chercher((n) => n.nom === "title");
    const texte = nettoyerFragment(valeurs.titre, { typo: false });
    if (titre) decoupes.push({ debut: titre.debutInterieur, fin: titre.finInterieur, texte });

    const ogTitre = chercher((n) => n.nom === "meta" && valeurAttribut(n, "property") === "og:title");
    if (ogTitre && valeurs.synchroniserOg !== false) {
      const a = attribut(ogTitre, "content");
      if (a) decoupes.push({ debut: a.debutValeur, fin: a.finValeur, texte: nettoyerAttribut(valeurs.titre) });
    }
  }

  if (typeof valeurs.description === "string") {
    const description = chercher((n) => n.nom === "meta" && valeurAttribut(n, "name") === "description");
    const texte = nettoyerAttribut(valeurs.description);
    if (description) {
      const a = attribut(description, "content");
      if (a) decoupes.push({ debut: a.debutValeur, fin: a.finValeur, texte });
    }
    const ogDesc = chercher((n) => n.nom === "meta" && valeurAttribut(n, "property") === "og:description");
    if (ogDesc && valeurs.synchroniserOg !== false) {
      const a = attribut(ogDesc, "content");
      if (a) decoupes.push({ debut: a.debutValeur, fin: a.finValeur, texte });
    }
  }

  return appliquer(src, decoupes);
}

/** Titre affichable d'une page (premier h1, sinon <title>). */
export function titreDe(src) {
  const { doc, main } = racineContenu(src);
  const h1 = main ? trouver(main, (n) => n.type === "element" && n.nom === "h1") : null;
  if (h1) return texteVisible(src, h1);
  const titre = trouver(doc, (n) => n.type === "element" && n.nom === "title");
  return titre ? texteVisible(src, titre) : "";
}
