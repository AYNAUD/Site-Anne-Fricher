/* =========================================================================
   Analyseur HTML tolérant, conservant les décalages source.

   Principe directeur : on ne « re-sérialise » jamais une page entière.
   L'analyse produit un arbre dont chaque nœud connaît sa position exacte
   dans la chaîne d'origine ; toute modification est ensuite appliquée sous
   forme de découpes (`appliquer`). Les parties non touchées du fichier
   ressortent donc rigoureusement identiques — indentation, commentaires et
   entités comprises.

   Aucune dépendance : le site n'en a pas, l'outil d'administration non plus.
   ========================================================================= */

/** Éléments sans contenu ni balise fermante. */
export const VIDES = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"
]);

/** Éléments dont le contenu n'est pas du balisage. */
export const TEXTE_BRUT = new Set(["script", "style", "textarea"]);

/* ------------------------------------------------------------------ *
   Lecture d'une balise ouvrante
 * ------------------------------------------------------------------ */
function lireBalise(src, pos) {
  const debutNom = /^[a-zA-Z][^\s/>]*/.exec(src.slice(pos + 1, pos + 81));
  if (!debutNom) return null;

  const nom = debutNom[0].toLowerCase();
  let i = pos + 1 + debutNom[0].length;
  const attrs = [];

  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) break;

    if (src[i] === ">") { i++; return { nom, attrs, fin: i, autoFermante: false }; }
    if (src[i] === "/" && src[i + 1] === ">") { i += 2; return { nom, attrs, fin: i, autoFermante: true }; }

    const debut = i;
    let j = i;
    while (j < src.length && !/[\s=/>]/.test(src[j])) j++;
    const nomAttr = src.slice(i, j).toLowerCase();
    if (!nomAttr) { i++; continue; }
    i = j;

    let valeur = "";
    let debutValeur = -1;
    let finValeur = -1;
    let guillemet = '"';

    let k = i;
    while (k < src.length && /\s/.test(src[k])) k++;
    if (src[k] === "=") {
      k++;
      while (k < src.length && /\s/.test(src[k])) k++;
      if (src[k] === '"' || src[k] === "'") {
        guillemet = src[k];
        const f = src.indexOf(guillemet, k + 1);
        debutValeur = k + 1;
        finValeur = f === -1 ? src.length : f;
        valeur = src.slice(debutValeur, finValeur);
        i = finValeur + 1;
      } else {
        let f = k;
        while (f < src.length && !/[\s>]/.test(src[f])) f++;
        guillemet = "";
        debutValeur = k;
        finValeur = f;
        valeur = src.slice(k, f);
        i = f;
      }
    }

    attrs.push({ nom: nomAttr, valeur, debut, fin: i, debutValeur, finValeur, guillemet });
  }

  return { nom, attrs, fin: i, autoFermante: false };
}

/* ------------------------------------------------------------------ *
   Analyse
 * ------------------------------------------------------------------ */
/**
 * Analyse une chaîne HTML.
 * @returns {object} nœud racine `{ type:"racine", enfants:[…] }`
 */
export function analyser(source) {
  const bas = source.toLowerCase();
  const racine = {
    type: "racine", nom: "#racine", attrs: [], enfants: [],
    debut: 0, fin: source.length, debutInterieur: 0, finInterieur: source.length
  };
  const pile = [racine];
  const sommet = () => pile[pile.length - 1];
  let i = 0;

  function pousser(noeud) {
    noeud.parent = sommet();
    sommet().enfants.push(noeud);
  }

  function pousserTexte(debut, fin) {
    if (fin > debut) pousser({ type: "texte", nom: "#texte", debut, fin, enfants: [] });
  }

  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) { pousserTexte(i, source.length); break; }
    if (lt > i) pousserTexte(i, lt);

    // Commentaire
    if (bas.startsWith("<!--", lt)) {
      const f = bas.indexOf("-->", lt);
      const fin = f === -1 ? source.length : f + 3;
      pousser({ type: "commentaire", nom: "#commentaire", debut: lt, fin, enfants: [] });
      i = fin;
      continue;
    }

    // Doctype ou déclaration
    if (bas.startsWith("<!", lt)) {
      const f = source.indexOf(">", lt);
      const fin = f === -1 ? source.length : f + 1;
      pousser({ type: "doctype", nom: "#doctype", debut: lt, fin, enfants: [] });
      i = fin;
      continue;
    }

    // Balise fermante
    if (bas.startsWith("</", lt)) {
      const f = source.indexOf(">", lt);
      const fin = f === -1 ? source.length : f + 1;
      const nom = source.slice(lt + 2, f === -1 ? source.length : f).trim().toLowerCase();

      for (let k = pile.length - 1; k > 0; k--) {
        if (pile[k].nom === nom) {
          // Ferme au passage les éléments restés ouverts (HTML permissif)
          while (pile.length - 1 > k) {
            const orphelin = pile.pop();
            orphelin.finInterieur = lt;
            orphelin.fin = lt;
          }
          const noeud = pile.pop();
          noeud.finInterieur = lt;
          noeud.fin = fin;
          break;
        }
      }
      i = fin;
      continue;
    }

    // Balise ouvrante
    const balise = lireBalise(source, lt);
    if (!balise) { pousserTexte(lt, lt + 1); i = lt + 1; continue; }

    const noeud = {
      type: "element",
      nom: balise.nom,
      attrs: balise.attrs,
      enfants: [],
      debut: lt,
      debutInterieur: balise.fin,
      finInterieur: balise.fin,
      fin: balise.fin,
      autoFermante: balise.autoFermante
    };
    pousser(noeud);

    if (balise.autoFermante || VIDES.has(balise.nom)) { i = balise.fin; continue; }

    if (TEXTE_BRUT.has(balise.nom)) {
      const f = bas.indexOf("</" + balise.nom, balise.fin);
      const finInt = f === -1 ? source.length : f;
      const sup = source.indexOf(">", finInt);
      noeud.enfants.push({
        type: "texte", nom: "#texte", debut: balise.fin, fin: finInt, enfants: [], parent: noeud
      });
      noeud.finInterieur = finInt;
      noeud.fin = f === -1 ? source.length : (sup === -1 ? source.length : sup + 1);
      i = noeud.fin;
      continue;
    }

    pile.push(noeud);
    i = balise.fin;
  }

  while (pile.length > 1) {
    const orphelin = pile.pop();
    orphelin.finInterieur = source.length;
    orphelin.fin = source.length;
  }

  return racine;
}

/* ------------------------------------------------------------------ *
   Petits utilitaires d'arbre
 * ------------------------------------------------------------------ */
export function attribut(noeud, nom) {
  if (!noeud || !noeud.attrs) return null;
  return noeud.attrs.find((a) => a.nom === nom) || null;
}

export function valeurAttribut(noeud, nom) {
  const a = attribut(noeud, nom);
  return a ? a.valeur : "";
}

export function classes(noeud) {
  return valeurAttribut(noeud, "class").split(/\s+/).filter(Boolean);
}

export function aClasse(noeud, nom) {
  return classes(noeud).indexOf(nom) !== -1;
}

export function elements(noeud) {
  return noeud ? noeud.enfants.filter((n) => n.type === "element") : [];
}

/** Parcourt l'arbre en profondeur ; `fn` peut renvoyer `false` pour ne pas descendre. */
export function parcourir(noeud, fn) {
  for (const enfant of noeud.enfants) {
    if (fn(enfant) === false) continue;
    parcourir(enfant, fn);
  }
}

/** Premier nœud satisfaisant le prédicat. */
export function trouver(noeud, predicat) {
  for (const enfant of noeud.enfants) {
    if (predicat(enfant)) return enfant;
    const trouve = trouver(enfant, predicat);
    if (trouve) return trouve;
  }
  return null;
}

/** Contenu source d'un élément, balises comprises. */
export function source(src, noeud) {
  return src.slice(noeud.debut, noeud.fin);
}

/** Contenu source intérieur d'un élément. */
export function interieur(src, noeud) {
  return src.slice(noeud.debutInterieur, noeud.finInterieur);
}

/** Texte visible d'un élément (balises retirées, entités simplifiées). */
export function texteVisible(src, noeud) {
  let sortie = "";
  const visiter = (n) => {
    for (const enfant of n.enfants) {
      if (enfant.type === "texte") sortie += src.slice(enfant.debut, enfant.fin);
      else if (enfant.type === "element" && enfant.nom !== "svg") visiter(enfant);
    }
  };
  if (noeud.type === "texte") sortie = src.slice(noeud.debut, noeud.fin);
  else visiter(noeud);
  return desechapper(sortie).replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ *
   Application des modifications
 * ------------------------------------------------------------------ */
/**
 * Applique une liste de découpes `{ debut, fin, texte }` à la source.
 * Les découpes sont triées et vérifiées : tout chevauchement lève une erreur
 * plutôt que de produire un fichier incohérent.
 */
export function appliquer(src, decoupes) {
  const liste = decoupes
    .filter(Boolean)
    .map((d) => ({ debut: d.debut, fin: d.fin === undefined ? d.debut : d.fin, texte: d.texte }))
    .sort((a, b) => a.debut - b.debut || a.fin - b.fin);

  for (let i = 1; i < liste.length; i++) {
    if (liste[i].debut < liste[i - 1].fin) {
      throw new Error("Modifications qui se chevauchent — opération annulée.");
    }
  }

  let sortie = "";
  let curseur = 0;
  for (const d of liste) {
    sortie += src.slice(curseur, d.debut) + d.texte;
    curseur = d.fin;
  }
  return sortie + src.slice(curseur);
}

/* ------------------------------------------------------------------ *
   Échappement
 * ------------------------------------------------------------------ */
const ENTITES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  "&apos;": "'", "&nbsp;": " ", "&hellip;": "…", "&eacute;": "é",
  "&egrave;": "è", "&agrave;": "à", "&ccedil;": "ç", "&ocirc;": "ô",
  "&laquo;": "«", "&raquo;": "»", "&mdash;": "—", "&ndash;": "–"
};

export function desechapper(texte) {
  return String(texte).replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entier, corps) => {
    if (ENTITES[entier.toLowerCase()]) return ENTITES[entier.toLowerCase()];
    if (corps[0] === "#") {
      const code = corps[1] === "x" || corps[1] === "X"
        ? parseInt(corps.slice(2), 16)
        : parseInt(corps.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entier;
    }
    return entier;
  });
}

/** Échappe un texte destiné au contenu d'un élément. */
export function echapperTexte(texte) {
  return String(texte)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Échappe un texte destiné à une valeur d'attribut entre guillemets doubles. */
export function echapperAttribut(texte) {
  return echapperTexte(texte).replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ *
   Typographie française
   Appliquée au contenu rédigé depuis l'administration : apostrophes
   courbes et espaces insécables devant la ponctuation double.
 * ------------------------------------------------------------------ */
export function typographie(texte) {
  return String(texte)
    // Apostrophe droite entre deux caractères de mot → apostrophe courbe
    .replace(/(\S)'(\S)/g, "$1’$2")
    // Espace ordinaire devant une ponctuation double → insécable
    .replace(/ +([?!:;»])/g, "&nbsp;$1")
    .replace(/([«]) +/g, "$1&nbsp;")
    // Suites de trois points → points de suspension
    .replace(/\.\.\./g, "…");
}

/* ------------------------------------------------------------------ *
   Nettoyage d'un fragment saisi dans l'administration
   Seul un balisage en ligne limité est conservé ; tout le reste est
   échappé. Garantit qu'aucune saisie ne peut casser la page.
 * ------------------------------------------------------------------ */
const BALISES_AUTORISEES = {
  a: ["href", "target", "rel", "class", "title"],
  strong: ["class"],
  b: [],
  em: ["class"],
  i: [],
  br: [],
  span: ["class"],
  small: [],
  sup: [],
  sub: [],
  abbr: ["title"]
};

/** Balises de bloc tolérées quand `bloc: true` (contenu long). */
const BALISES_BLOC = { p: ["class"], ul: ["class"], ol: ["class"], li: ["class"] };

/**
 * Nettoie un fragment HTML saisi par l'utilisateur.
 * @param {string} html
 * @param {{ bloc?: boolean, typo?: boolean }} options
 */
export function nettoyerFragment(html, options = {}) {
  const autorisees = options.bloc
    ? Object.assign({}, BALISES_AUTORISEES, BALISES_BLOC)
    : BALISES_AUTORISEES;
  const src = String(html);
  const racine = analyser(src);
  let sortie = "";

  const visiter = (noeud) => {
    for (const enfant of noeud.enfants) {
      if (enfant.type === "texte") {
        let brut = src.slice(enfant.debut, enfant.fin);
        brut = echapperTexte(desechapper(brut));
        sortie += options.typo === false ? brut : typographie(brut);
      } else if (enfant.type === "element") {
        const permis = autorisees[enfant.nom];
        if (!permis) {
          // Balise refusée : on garde le contenu, on jette l'enveloppe
          if (enfant.nom !== "script" && enfant.nom !== "style") visiter(enfant);
          continue;
        }
        const attrs = enfant.attrs
          .filter((a) => permis.indexOf(a.nom) !== -1)
          .filter((a) => !(a.nom === "href" && /^\s*javascript:/i.test(a.valeur)))
          .map((a) => ` ${a.nom}="${echapperAttribut(desechapper(a.valeur))}"`)
          .join("");
        if (VIDES.has(enfant.nom)) {
          sortie += `<${enfant.nom}${attrs}>`;
        } else {
          sortie += `<${enfant.nom}${attrs}>`;
          visiter(enfant);
          sortie += `</${enfant.nom}>`;
        }
      }
    }
  };

  visiter(racine);
  return sortie;
}

/** Nettoie une valeur d'attribut saisie dans l'administration. */
export function nettoyerAttribut(valeur, { typo = false } = {}) {
  const texte = desechapper(String(valeur)).replace(/[\r\n\t]+/g, " ").trim();
  const echappe = echapperAttribut(texte);
  return typo ? typographie(echappe) : echappe;
}
