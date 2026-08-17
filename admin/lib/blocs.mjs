/* =========================================================================
   Reconnaissance des blocs du site et bibliothèque de blocs insérables.

   Deux rôles :
   1. `decrire()` — donner un nom français, un aperçu et des champs
      modifiables à n'importe quel élément d'une page ;
   2. `MODELES` — produire le balisage des blocs que l'on peut ajouter,
      dans le vocabulaire de `assets/css/style.css` (aucune classe inventée).
   ========================================================================= */
import {
  aClasse, classes, valeurAttribut, attribut, texteVisible, interieur,
  echapperTexte, typographie, nettoyerFragment, nettoyerAttribut, VIDES
} from "./html.mjs";

/* ------------------------------------------------------------------ *
   Champs — description et écriture
 * ------------------------------------------------------------------ */
const champInterieur = (nom, libelle, type, valeur, extra = {}) =>
  Object.assign({ nom, libelle, type, valeur, interieur: true }, extra);

const champAttribut = (nom, libelle, type, valeur, attr, extra = {}) =>
  Object.assign({ nom, libelle, type, valeur, attribut: attr }, extra);

/**
 * Calcule la découpe à appliquer pour écrire une valeur dans un champ.
 * Les positions ne viennent jamais du client : elles sont recalculées ici
 * à partir du nœud résolu par son chemin.
 */
export function ecrireChamp(src, noeud, champ, valeur) {
  if (champ.interieur) {
    return {
      debut: noeud.debutInterieur,
      fin: noeud.finInterieur,
      texte: nettoyerFragment(valeur, { bloc: champ.type === "long" })
    };
  }

  if (champ.premierTexte) {
    const texteEnfant = noeud.enfants.find((n) => n.type === "texte" && src.slice(n.debut, n.fin).trim());
    const contenu = typographie(echapperTexte(String(valeur).trim()));
    if (!texteEnfant) {
      return { debut: noeud.debutInterieur, fin: noeud.debutInterieur, texte: "\n      " + contenu };
    }
    const brut = src.slice(texteEnfant.debut, texteEnfant.fin);
    const avant = brut.match(/^\s*/)[0];
    const apres = brut.match(/\s*$/)[0];
    return { debut: texteEnfant.debut, fin: texteEnfant.fin, texte: avant + contenu + apres };
  }

  if (champ.attribut) {
    const attr = attribut(noeud, champ.attribut);
    const valeurNette = nettoyerAttribut(valeur, { typo: champ.typo === true });

    // Attribut facultatif vidé → on le retire complètement
    if (!valeurNette && champ.optionnel) {
      if (!attr) return null;
      let debut = attr.debut;
      while (debut > noeud.debut && /\s/.test(src[debut - 1])) debut--;
      return { debut, fin: attr.fin, texte: "" };
    }

    if (attr) {
      if (attr.debutValeur === -1) {
        return { debut: attr.debut, fin: attr.fin, texte: `${attr.nom}="${valeurNette}"` };
      }
      return { debut: attr.debutValeur, fin: attr.finValeur, texte: valeurNette };
    }

    // Attribut absent : insertion juste avant la fin de la balise ouvrante
    let pos = noeud.debutInterieur - 1;
    while (pos > noeud.debut && (src[pos - 1] === "/" || /\s/.test(src[pos - 1]))) pos--;
    return { debut: pos, fin: pos, texte: ` ${champ.attribut}="${valeurNette}"` };
  }

  return null;
}

/* ------------------------------------------------------------------ *
   Reconnaissance des types
 * ------------------------------------------------------------------ */
const TITRES = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const COURTS = [
  ["hero__eyebrow", "Surtitre"],
  ["eyebrow", "Surtitre"],
  ["card__num", "Numéro de carte"],
  ["card__kicker", "Accroche de carte"],
  ["project__meta", "Légende de projet"],
  ["fact__value", "Repère — valeur"],
  ["fact__label", "Repère — libellé"],
  ["breadcrumb", "Fil d'Ariane"],
  ["project__more", "Libellé « voir le projet »"],
  ["card__foot", "Libellé de bas de carte"]
];

function etiquetteSection(src, noeud) {
  const cls = classes(noeud);
  if (cls.indexOf("hero") !== -1) return "Bandeau d'accueil";
  if (cls.indexOf("pagehead") !== -1) return "En-tête de page";
  if (cls.indexOf("cta-band") !== -1) return "Bandeau d'appel à l'action";
  if (cls.indexOf("facts") !== -1) return "Bandeau de repères";
  const titre = texteVisible(src, noeud).slice(0, 40);
  const fond = cls.indexOf("section--alt") !== -1 ? " (fond alterné)" : "";
  return titre ? `Section${fond} — ${titre}…` : `Section${fond}`;
}

function etiquetteDiv(noeud) {
  const cls = classes(noeud);
  if (cls.indexOf("section-head") !== -1) return "Titre de section";
  if (cls.indexOf("split__media") !== -1) return "Colonne image";
  if (cls.indexOf("split__body") !== -1) return "Colonne texte";
  if (cls.indexOf("split") !== -1) return "Deux colonnes";
  if (cls.indexOf("cards") !== -1) return "Grille de cartes";
  if (cls.indexOf("card__body") !== -1) return "Corps de carte";
  if (cls.indexOf("card__media") !== -1) return "Image de carte";
  if (cls.indexOf("projects") !== -1) return "Grille de projets";
  if (cls.indexOf("project__body") !== -1) return "Corps de projet";
  if (cls.indexOf("logos") !== -1) return "Logos partenaires";
  if (cls.indexOf("hero__actions") !== -1) return "Boutons";
  if (cls.indexOf("section-action") !== -1) return "Bouton de bas de section";
  if (cls.indexOf("fact") !== -1) return "Repère chiffré";
  if (cls.indexOf("wrap") !== -1) return "Conteneur";
  if (cls.indexOf("notice") !== -1) return "Encart d'avertissement";
  return "Bloc";
}

/**
 * Décrit un élément : type, étiquette lisible, aperçu, champs modifiables.
 * `feuille` indique que l'on n'affiche pas son contenu dans l'arborescence.
 */
export function decrire(src, noeud) {
  const nom = noeud.nom;
  const cls = classes(noeud);
  const texte = texteVisible(src, noeud);
  const dedans = interieur(src, noeud).trim();

  const image = () => ({
    type: "image",
    etiquette: "Image",
    apercu: valeurAttribut(noeud, "src").split("/").pop(),
    feuille: true,
    champs: [
      champAttribut("src", "Fichier image", "image", valeurAttribut(noeud, "src"), "src"),
      champAttribut("alt", "Texte alternatif", "ligne", valeurAttribut(noeud, "alt"), "alt", {
        aide: "Décrit la photo pour les personnes qui ne la voient pas. Vide seulement si l'image est décorative."
      })
    ]
  });

  if (nom === "img") return image();

  if (nom === "svg") {
    return { type: "icone", etiquette: "Icône", apercu: "", feuille: true, champs: [], masque: true };
  }

  if (nom === "button" && cls.indexOf("gallery__item") !== -1) {
    const img = noeud.enfants.find((n) => n.type === "element" && n.nom === "img");
    return {
      type: "vignette",
      etiquette: "Vignette de galerie",
      apercu: valeurAttribut(noeud, "data-caption") || (img ? valeurAttribut(img, "alt") : ""),
      feuille: true,
      champs: [
        champAttribut("legende", "Légende", "ligne", valeurAttribut(noeud, "data-caption"), "data-caption", {
          typo: true, optionnel: true
        })
      ],
      // Les champs de l'image portée par la vignette sont fusionnés côté serveur
      cible: img ? "img" : null
    };
  }

  if (attribut(noeud, "data-gallery")) {
    const nb = noeud.enfants.filter((n) => n.type === "element").length;
    return {
      type: "galerie",
      etiquette: `Galerie — ${nb} image${nb > 1 ? "s" : ""}`,
      apercu: valeurAttribut(noeud, "data-gallery"),
      feuille: false,
      champs: []
    };
  }

  if (nom === "section") {
    return {
      type: "section",
      etiquette: etiquetteSection(src, noeud),
      apercu: texte.slice(0, 70),
      feuille: false,
      champs: [
        champAttribut("id", "Ancre (id)", "ligne", valeurAttribut(noeud, "id"), "id", {
          optionnel: true, aide: "Permet un lien direct vers la section, par exemple services.html#rideaux."
        })
      ]
    };
  }

  if (TITRES.has(nom)) {
    return {
      type: "titre",
      etiquette: `Titre ${nom}`,
      apercu: texte.slice(0, 70),
      feuille: true,
      champs: [champInterieur("texte", "Titre", "ligne", dedans)]
    };
  }

  if (nom === "p") {
    const chapo = cls.indexOf("lede") !== -1;
    for (const [classe, libelle] of COURTS) {
      if (cls.indexOf(classe) !== -1) {
        return {
          type: "texte-court", etiquette: libelle, apercu: texte.slice(0, 70), feuille: true,
          champs: [champInterieur("texte", libelle, "ligne", dedans)]
        };
      }
    }
    return {
      type: chapo ? "chapo" : "paragraphe",
      etiquette: chapo ? "Chapô" : "Paragraphe",
      apercu: texte.slice(0, 70),
      feuille: true,
      champs: [champInterieur("texte", "Texte", "riche", dedans)]
    };
  }

  if (nom === "span") {
    for (const [classe, libelle] of COURTS) {
      if (cls.indexOf(classe) !== -1) {
        return {
          type: "texte-court", etiquette: libelle, apercu: texte.slice(0, 70), feuille: true,
          champs: [champInterieur("texte", libelle, "ligne", dedans)]
        };
      }
    }
    if (attribut(noeud, "data-year")) {
      return { type: "auto", etiquette: "Année (automatique)", apercu: texte, feuille: true, champs: [] };
    }
    return {
      type: "texte-court", etiquette: "Texte", apercu: texte.slice(0, 70), feuille: true,
      champs: [champInterieur("texte", "Texte", "ligne", dedans)]
    };
  }

  if (nom === "a") {
    const aEnfantsElements = noeud.enfants.some((n) => n.type === "element");
    const complexe = cls.indexOf("card") !== -1 || cls.indexOf("project") !== -1;
    if (complexe) {
      return {
        type: cls.indexOf("card") !== -1 ? "carte" : "projet",
        etiquette: cls.indexOf("card") !== -1 ? "Carte" : "Projet",
        apercu: texte.slice(0, 60),
        feuille: false,
        champs: [champAttribut("href", "Lien", "url", valeurAttribut(noeud, "href"), "href")]
      };
    }
    const bouton = cls.indexOf("btn") !== -1;
    return {
      type: bouton ? "bouton" : "lien",
      etiquette: bouton ? "Bouton" : "Lien",
      apercu: texte.slice(0, 60),
      feuille: true,
      champs: [
        aEnfantsElements
          ? Object.assign(champInterieur("texte", "Libellé", "ligne", texte), { interieur: false, premierTexte: true })
          : champInterieur("texte", "Libellé", "ligne", dedans),
        champAttribut("href", "Lien", "url", valeurAttribut(noeud, "href"), "href", {
          aide: "Page du site (contact.html), ancre (#rideaux), adresse complète, tel: ou mailto:."
        })
      ]
    };
  }

  if (nom === "ul" || nom === "ol") {
    return {
      type: "liste",
      etiquette: cls.indexOf("checklist") !== -1 ? "Liste à puces cochées" : "Liste",
      apercu: texte.slice(0, 70),
      feuille: false,
      champs: []
    };
  }

  if (nom === "li") {
    const complexe = noeud.enfants.some((n) => n.type === "element" && !["strong", "em", "b", "i", "br", "a", "span"].includes(n.nom));
    return {
      type: "element-liste",
      etiquette: "Élément de liste",
      apercu: texte.slice(0, 70),
      feuille: !complexe,
      champs: complexe ? [] : [champInterieur("texte", "Texte", "riche", dedans)]
    };
  }

  if (nom === "hr") {
    return { type: "filet", etiquette: "Filet décoratif", apercu: "", feuille: true, champs: [] };
  }

  if (nom === "figure") {
    return { type: "figure", etiquette: "Figure", apercu: texte.slice(0, 60), feuille: false, champs: [] };
  }

  if (nom === "figcaption") {
    return {
      type: "legende", etiquette: "Légende", apercu: texte.slice(0, 60), feuille: true,
      champs: [champInterieur("texte", "Légende", "ligne", dedans)]
    };
  }

  if (nom === "iframe") {
    return {
      type: "cadre", etiquette: "Cadre externe (carte)", apercu: valeurAttribut(noeud, "title"), feuille: true,
      champs: [champAttribut("src", "Adresse du cadre", "url", valeurAttribut(noeud, "src"), "src")]
    };
  }

  if (nom === "form") {
    return {
      type: "formulaire",
      etiquette: "Formulaire de contact",
      apercu: "Modifiable dans le fichier contact.html",
      feuille: true,
      champs: [champAttribut("destinataire", "Adresse de réception", "ligne",
        valeurAttribut(noeud, "data-mailto"), "data-mailto")]
    };
  }

  if (nom === "div" || nom === "nav" || nom === "article" || nom === "aside" || nom === "dl") {
    return {
      type: "bloc", etiquette: etiquetteDiv(noeud), apercu: texte.slice(0, 60), feuille: false, champs: []
    };
  }

  return {
    type: "bloc",
    etiquette: `<${nom}>`,
    apercu: texte.slice(0, 60),
    feuille: VIDES.has(nom) || !noeud.enfants.some((n) => n.type === "element"),
    champs: noeud.enfants.some((n) => n.type === "element")
      ? []
      : [champInterieur("texte", "Texte", "riche", dedans)]
  };
}

/* ------------------------------------------------------------------ *
   Bibliothèque de blocs insérables
 * ------------------------------------------------------------------ */
const ind = (n) => "  ".repeat(n);

/** Découpe un texte en paragraphes (une ligne vide = un nouveau paragraphe). */
function paragraphes(texte, niveau, classe = "") {
  const cl = classe ? ` class="${classe}"` : "";
  return String(texte || "")
    .split(/\n\s*\n/)
    .map((bloc) => bloc.trim())
    .filter(Boolean)
    .map((bloc) => `${ind(niveau)}<p${cl}>\n${ind(niveau + 1)}${nettoyerFragment(bloc)}\n${ind(niveau)}</p>`)
    .join("\n");
}

const ligne = (texte) => nettoyerFragment(String(texte || ""));
const attr = (valeur) => nettoyerAttribut(valeur);

/** Balise <img> complète, dimensions comprises. */
export function baliseImage(image, { classe = "", lazy = true, alt } = {}) {
  if (!image || !image.chemin) return "";
  const texteAlt = alt !== undefined ? alt : image.alt || "";
  return `<img${classe ? ` class="${classe}"` : ""} src="${attr(image.chemin)}"` +
    (image.largeur ? ` width="${image.largeur}"` : "") +
    (image.hauteur ? ` height="${image.hauteur}"` : "") +
    (lazy ? ` loading="lazy"` : "") +
    ` alt="${attr(texteAlt)}">`;
}

const CHAMP_IMAGE = { nom: "image", libelle: "Image", type: "image", requis: true };
const CHAMP_ALT = { nom: "alt", libelle: "Texte alternatif de l'image", type: "ligne" };

/**
 * Chaque modèle décrit ses champs de saisie et construit son balisage,
 * indenté à partir du niveau `n` fourni par l'appelant.
 */
export const MODELES = [
  /* ---------- Sections (enfants directs de <main>) ---------- */
  {
    cle: "section-texte",
    nom: "Section de texte",
    description: "Surtitre, titre centré, filet et texte.",
    contextes: ["page"],
    champs: [
      { nom: "surtitre", libelle: "Surtitre", type: "ligne", valeur: "Savoir-faire" },
      { nom: "titre", libelle: "Titre", type: "ligne", valeur: "Nouveau titre de section", requis: true },
      { nom: "texte", libelle: "Texte", type: "long", valeur: "" },
      { nom: "fond", libelle: "Fond alterné", type: "case", valeur: false }
    ],
    construire(v, n) {
      const classe = v.fond ? "section section--alt" : "section";
      return [
        `${ind(n)}<section class="${classe}">`,
        `${ind(n + 1)}<div class="wrap">`,
        `${ind(n + 2)}<div class="section-head section-head--center reveal">`,
        v.surtitre ? `${ind(n + 3)}<span class="eyebrow">${ligne(v.surtitre)}</span>` : "",
        `${ind(n + 3)}<h2>${ligne(v.titre)}</h2>`,
        `${ind(n + 3)}<hr class="rule">`,
        v.texte ? paragraphes(v.texte, n + 3, "lede") : "",
        `${ind(n + 2)}</div>`,
        `${ind(n + 1)}</div>`,
        `${ind(n)}</section>`
      ].filter(Boolean).join("\n");
    }
  },

  {
    cle: "section-image-texte",
    nom: "Section image + texte",
    description: "Une photo d'un côté, le texte de l'autre.",
    contextes: ["page"],
    champs: [
      CHAMP_IMAGE,
      CHAMP_ALT,
      { nom: "surtitre", libelle: "Surtitre", type: "ligne", valeur: "L'atelier" },
      { nom: "titre", libelle: "Titre", type: "ligne", valeur: "Nouveau titre", requis: true },
      { nom: "texte", libelle: "Texte", type: "long", valeur: "" },
      { nom: "cote", libelle: "Image à droite", type: "case", valeur: false },
      { nom: "fond", libelle: "Fond alterné", type: "case", valeur: false }
    ],
    construire(v, n) {
      const classe = v.fond ? "section section--alt" : "section";
      const split = v.cote ? "split split--reverse" : "split";
      return [
        `${ind(n)}<section class="${classe}">`,
        `${ind(n + 1)}<div class="wrap ${split}">`,
        `${ind(n + 2)}<div class="split__media reveal">`,
        `${ind(n + 3)}${baliseImage(v.image, { alt: v.alt })}`,
        `${ind(n + 2)}</div>`,
        ``,
        `${ind(n + 2)}<div class="split__body reveal" data-delay="1">`,
        v.surtitre ? `${ind(n + 3)}<span class="eyebrow">${ligne(v.surtitre)}</span>` : "",
        `${ind(n + 3)}<h2>${ligne(v.titre)}</h2>`,
        `${ind(n + 3)}<hr class="rule">`,
        v.texte ? paragraphes(v.texte, n + 3) : "",
        `${ind(n + 2)}</div>`,
        `${ind(n + 1)}</div>`,
        `${ind(n)}</section>`
      ].filter((l) => l !== "").join("\n");
    }
  },

  {
    cle: "section-galerie",
    nom: "Section galerie",
    description: "Titre de section et grille d'images agrandissables.",
    contextes: ["page"],
    champs: [
      { nom: "surtitre", libelle: "Surtitre", type: "ligne", valeur: "Galerie" },
      { nom: "titre", libelle: "Titre", type: "ligne", valeur: "Nos réalisations", requis: true },
      { nom: "texte", libelle: "Texte d'introduction", type: "long", valeur: "Cliquez sur une image pour l'agrandir." },
      { nom: "nomGalerie", libelle: "Nom du groupe d'images", type: "ligne", valeur: "galerie" },
      { nom: "images", libelle: "Images", type: "images", valeur: [] },
      { nom: "fond", libelle: "Fond alterné", type: "case", valeur: false }
    ],
    construire(v, n) {
      const classe = v.fond ? "section section--alt" : "section";
      const groupe = attr(v.nomGalerie || "galerie").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
      const vignettes = (v.images || []).map((img) => [
        `${ind(n + 3)}<button class="gallery__item" type="button" data-caption="${attr(img.legende || img.alt || "")}">`,
        `${ind(n + 4)}${baliseImage(img)}`,
        `${ind(n + 3)}</button>`
      ].join("\n")).join("\n");
      return [
        `${ind(n)}<section class="${classe}">`,
        `${ind(n + 1)}<div class="wrap">`,
        `${ind(n + 2)}<div class="section-head section-head--center reveal">`,
        v.surtitre ? `${ind(n + 3)}<span class="eyebrow">${ligne(v.surtitre)}</span>` : "",
        `${ind(n + 3)}<h2>${ligne(v.titre)}</h2>`,
        `${ind(n + 3)}<hr class="rule">`,
        v.texte ? paragraphes(v.texte, n + 3, "lede") : "",
        `${ind(n + 2)}</div>`,
        ``,
        `${ind(n + 2)}<div class="gallery reveal" data-gallery="${groupe}">`,
        vignettes,
        `${ind(n + 2)}</div>`,
        `${ind(n + 1)}</div>`,
        `${ind(n)}</section>`
      ].filter((l) => l !== "" && l !== undefined).join("\n");
    }
  },

  {
    cle: "section-bandeau",
    nom: "Bandeau d'appel à l'action",
    description: "Photo en fond sombre, titre et boutons.",
    contextes: ["page"],
    champs: [
      CHAMP_IMAGE,
      { nom: "surtitre", libelle: "Surtitre", type: "ligne", valeur: "Parlons de votre projet" },
      { nom: "titre", libelle: "Titre", type: "ligne", valeur: "Un rendez-vous, un devis, sans engagement", requis: true },
      { nom: "texte", libelle: "Texte", type: "long", valeur: "" },
      { nom: "bouton", libelle: "Libellé du bouton", type: "ligne", valeur: "Nous écrire" },
      { nom: "lien", libelle: "Lien du bouton", type: "url", valeur: "contact.html" },
      { nom: "bouton2", libelle: "Second bouton (facultatif)", type: "ligne", valeur: "06 74 39 85 93" },
      { nom: "lien2", libelle: "Lien du second bouton", type: "url", valeur: "tel:+33674398593" }
    ],
    construire(v, n) {
      return [
        `${ind(n)}<section class="cta-band">`,
        v.image ? `${ind(n + 1)}${baliseImage(v.image, { alt: "" })}` : "",
        `${ind(n + 1)}<div class="wrap reveal">`,
        v.surtitre ? `${ind(n + 2)}<span class="eyebrow">${ligne(v.surtitre)}</span>` : "",
        `${ind(n + 2)}<h2>${ligne(v.titre)}</h2>`,
        v.texte ? paragraphes(v.texte, n + 2) : "",
        (v.bouton || v.bouton2) ? `${ind(n + 2)}<div class="hero__actions">` : "",
        v.bouton ? `${ind(n + 3)}<a class="btn btn--primary" href="${attr(v.lien)}">${ligne(v.bouton)}</a>` : "",
        v.bouton2 ? `${ind(n + 3)}<a class="btn btn--light" href="${attr(v.lien2)}">${ligne(v.bouton2)}</a>` : "",
        (v.bouton || v.bouton2) ? `${ind(n + 2)}</div>` : "",
        `${ind(n + 1)}</div>`,
        `${ind(n)}</section>`
      ].filter(Boolean).join("\n");
    }
  },

  {
    cle: "section-tete",
    nom: "En-tête de page",
    description: "Fil d'Ariane, surtitre, titre h1 et chapô.",
    contextes: ["page"],
    champs: [
      { nom: "surtitre", libelle: "Surtitre", type: "ligne", valeur: "" },
      { nom: "titre", libelle: "Titre principal (h1)", type: "ligne", valeur: "Titre de la page", requis: true },
      { nom: "texte", libelle: "Chapô", type: "long", valeur: "" }
    ],
    construire(v, n) {
      return [
        `${ind(n)}<section class="pagehead">`,
        `${ind(n + 1)}<div class="wrap">`,
        `${ind(n + 2)}<p class="breadcrumb"><a href="index.html">Accueil</a><span>/</span>${ligne(v.titre)}</p>`,
        v.surtitre ? `${ind(n + 2)}<span class="eyebrow">${ligne(v.surtitre)}</span>` : "",
        `${ind(n + 2)}<h1>${ligne(v.titre)}</h1>`,
        `${ind(n + 2)}<hr class="rule">`,
        v.texte ? paragraphes(v.texte, n + 2, "lede") : "",
        `${ind(n + 1)}</div>`,
        `${ind(n)}</section>`
      ].filter(Boolean).join("\n");
    }
  },

  /* ---------- Contenu (dans une section) ---------- */
  {
    cle: "titre",
    nom: "Titre",
    description: "Titre de niveau 2 ou 3.",
    contextes: ["contenu"],
    champs: [
      { nom: "texte", libelle: "Titre", type: "ligne", valeur: "Nouveau titre", requis: true },
      { nom: "niveau", libelle: "Niveau", type: "choix", valeur: "h2", options: [["h2", "Titre h2"], ["h3", "Titre h3"]] }
    ],
    construire(v, n) {
      const balise = v.niveau === "h3" ? "h3" : "h2";
      return `${ind(n)}<${balise}>${ligne(v.texte)}</${balise}>`;
    }
  },
  {
    cle: "paragraphe",
    nom: "Paragraphe",
    description: "Un ou plusieurs paragraphes de texte.",
    contextes: ["contenu"],
    champs: [{ nom: "texte", libelle: "Texte", type: "long", valeur: "", requis: true }],
    construire: (v, n) => paragraphes(v.texte, n)
  },
  {
    cle: "chapo",
    nom: "Chapô",
    description: "Paragraphe d'introduction, en plus grand.",
    contextes: ["contenu"],
    champs: [{ nom: "texte", libelle: "Texte", type: "long", valeur: "", requis: true }],
    construire: (v, n) => paragraphes(v.texte, n, "lede")
  },
  {
    cle: "surtitre",
    nom: "Surtitre",
    description: "Petite ligne en capitales au-dessus d'un titre.",
    contextes: ["contenu"],
    champs: [{ nom: "texte", libelle: "Texte", type: "ligne", valeur: "Savoir-faire", requis: true }],
    construire: (v, n) => `${ind(n)}<span class="eyebrow">${ligne(v.texte)}</span>`
  },
  {
    cle: "filet",
    nom: "Filet décoratif",
    description: "Petite ligne de séparation sous un titre.",
    contextes: ["contenu"],
    champs: [],
    construire: (v, n) => `${ind(n)}<hr class="rule">`
  },
  {
    cle: "liste",
    nom: "Liste à puces",
    description: "Une ligne de saisie par élément.",
    contextes: ["contenu"],
    champs: [
      { nom: "elements", libelle: "Éléments (un par ligne)", type: "long", valeur: "", requis: true }
    ],
    construire(v, n) {
      const items = String(v.elements || "").split("\n").map((l) => l.trim()).filter(Boolean);
      return [
        `${ind(n)}<ul class="checklist">`,
        ...items.map((t) => `${ind(n + 1)}<li>${ligne(t)}</li>`),
        `${ind(n)}</ul>`
      ].join("\n");
    }
  },
  {
    cle: "image",
    nom: "Image",
    description: "Une photo seule, sur toute la largeur du bloc.",
    contextes: ["contenu"],
    champs: [CHAMP_IMAGE, CHAMP_ALT],
    construire: (v, n) => `${ind(n)}${baliseImage(v.image, { classe: "figure-libre", alt: v.alt })}`
  },
  {
    cle: "bouton",
    nom: "Bouton",
    description: "Bouton d'action vers une page ou un numéro.",
    contextes: ["contenu"],
    champs: [
      { nom: "texte", libelle: "Libellé", type: "ligne", valeur: "Demander un devis", requis: true },
      { nom: "lien", libelle: "Lien", type: "url", valeur: "contact.html", requis: true },
      {
        nom: "style", libelle: "Style", type: "choix", valeur: "btn--primary",
        options: [["btn--primary", "Plein"], ["btn--outline", "Contour"], ["btn--light", "Clair (sur photo)"]]
      }
    ],
    construire: (v, n) => `${ind(n)}<a class="btn ${attr(v.style || "btn--primary")}" href="${attr(v.lien)}">${ligne(v.texte)}</a>`
  },
  {
    cle: "lien-fleche",
    nom: "Lien fléché",
    description: "Lien discret suivi d'une flèche.",
    contextes: ["contenu"],
    champs: [
      { nom: "texte", libelle: "Libellé", type: "ligne", valeur: "En savoir plus", requis: true },
      { nom: "lien", libelle: "Lien", type: "url", valeur: "services.html", requis: true }
    ],
    construire: (v, n) => [
      `${ind(n)}<a class="link-arrow" href="${attr(v.lien)}">`,
      `${ind(n + 1)}${ligne(v.texte)}`,
      `${ind(n + 1)}<svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true"><path d="M0 5h14M10 1l4 4-4 4" stroke="currentColor" stroke-width="1.3"/></svg>`,
      `${ind(n)}</a>`
    ].join("\n")
  },
  {
    cle: "galerie",
    nom: "Galerie d'images",
    description: "Grille d'images agrandissables au clic.",
    contextes: ["contenu"],
    champs: [
      { nom: "nomGalerie", libelle: "Nom du groupe d'images", type: "ligne", valeur: "galerie" },
      { nom: "images", libelle: "Images", type: "images", valeur: [], requis: true }
    ],
    construire(v, n) {
      const groupe = attr(v.nomGalerie || "galerie").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
      return [
        `${ind(n)}<div class="gallery reveal" data-gallery="${groupe}">`,
        ...(v.images || []).map((img) => [
          `${ind(n + 1)}<button class="gallery__item" type="button" data-caption="${attr(img.legende || img.alt || "")}">`,
          `${ind(n + 2)}${baliseImage(img)}`,
          `${ind(n + 1)}</button>`
        ].join("\n")),
        `${ind(n)}</div>`
      ].join("\n");
    }
  },

  /* ---------- Blocs contextuels ---------- */
  {
    cle: "vignette",
    nom: "Image de galerie",
    description: "Une vignette agrandissable de plus dans la galerie.",
    contextes: ["galerie"],
    champs: [CHAMP_IMAGE, CHAMP_ALT, { nom: "legende", libelle: "Légende", type: "ligne", valeur: "" }],
    construire: (v, n) => [
      `${ind(n)}<button class="gallery__item" type="button" data-caption="${attr(v.legende || v.alt || "")}">`,
      `${ind(n + 1)}${baliseImage(v.image, { alt: v.alt })}`,
      `${ind(n)}</button>`
    ].join("\n")
  },
  {
    cle: "element-liste",
    nom: "Élément de liste",
    description: "Une ligne de plus dans la liste.",
    contextes: ["liste"],
    champs: [{ nom: "texte", libelle: "Texte", type: "ligne", valeur: "", requis: true }],
    construire: (v, n) => `${ind(n)}<li>${ligne(v.texte)}</li>`
  },
  {
    cle: "carte",
    nom: "Carte",
    description: "Vignette cliquable : image, titre, texte et lien.",
    contextes: ["cartes"],
    champs: [
      CHAMP_IMAGE, CHAMP_ALT,
      { nom: "numero", libelle: "Numéro", type: "ligne", valeur: "04" },
      { nom: "titre", libelle: "Titre", type: "ligne", valeur: "Nouveau savoir-faire", requis: true },
      { nom: "accroche", libelle: "Accroche", type: "ligne", valeur: "" },
      { nom: "texte", libelle: "Texte", type: "long", valeur: "" },
      { nom: "lien", libelle: "Lien", type: "url", valeur: "services.html", requis: true }
    ],
    construire: (v, n) => [
      `${ind(n)}<a class="card reveal" href="${attr(v.lien)}">`,
      `${ind(n + 1)}<div class="card__media">`,
      `${ind(n + 2)}${baliseImage(v.image, { alt: v.alt })}`,
      `${ind(n + 1)}</div>`,
      `${ind(n + 1)}<div class="card__body">`,
      v.numero ? `${ind(n + 2)}<span class="card__num">${ligne(v.numero)}</span>` : "",
      `${ind(n + 2)}<h3>${ligne(v.titre)}</h3>`,
      v.accroche ? `${ind(n + 2)}<p class="card__kicker">${ligne(v.accroche)}</p>` : "",
      v.texte ? paragraphes(v.texte, n + 2) : "",
      `${ind(n + 2)}<span class="card__foot link-arrow">`,
      `${ind(n + 3)}Voir le détail`,
      `${ind(n + 3)}<svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true"><path d="M0 5h14M10 1l4 4-4 4" stroke="currentColor" stroke-width="1.3"/></svg>`,
      `${ind(n + 2)}</span>`,
      `${ind(n + 1)}</div>`,
      `${ind(n)}</a>`
    ].filter(Boolean).join("\n")
  },
  {
    cle: "projet",
    nom: "Projet",
    description: "Grande vignette de projet du portfolio.",
    contextes: ["projets"],
    champs: [
      CHAMP_IMAGE, CHAMP_ALT,
      { nom: "meta", libelle: "Ligne d'information", type: "ligne", valeur: "Coussinage · 2026" },
      { nom: "titre", libelle: "Titre", type: "ligne", valeur: "Nouveau projet", requis: true },
      { nom: "texte", libelle: "Texte", type: "long", valeur: "" },
      { nom: "lien", libelle: "Lien vers la fiche", type: "url", valeur: "", requis: true }
    ],
    construire: (v, n) => [
      `${ind(n)}<a class="project reveal" href="${attr(v.lien)}">`,
      `${ind(n + 1)}${baliseImage(v.image, { alt: v.alt })}`,
      `${ind(n + 1)}<div class="project__body">`,
      v.meta ? `${ind(n + 2)}<p class="project__meta">${ligne(v.meta)}</p>` : "",
      `${ind(n + 2)}<h3>${ligne(v.titre)}</h3>`,
      v.texte ? paragraphes(v.texte, n + 2) : "",
      `${ind(n + 2)}<span class="project__more">`,
      `${ind(n + 3)}Voir le projet`,
      `${ind(n + 3)}<svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true"><path d="M0 5h14M10 1l4 4-4 4" stroke="currentColor" stroke-width="1.3"/></svg>`,
      `${ind(n + 2)}</span>`,
      `${ind(n + 1)}</div>`,
      `${ind(n)}</a>`
    ].filter(Boolean).join("\n")
  }
];

/** Contexte d'insertion offert par un conteneur. */
export function contexteDe(noeud) {
  if (!noeud) return "page";
  if (noeud.nom === "main") return "page";
  if (attribut(noeud, "data-gallery")) return "galerie";
  if (noeud.nom === "ul" || noeud.nom === "ol") return "liste";
  if (aClasse(noeud, "cards")) return "cartes";
  if (aClasse(noeud, "projects")) return "projets";
  return "contenu";
}

export function modelesPour(contexte) {
  return MODELES.filter((m) => m.contextes.indexOf(contexte) !== -1);
}

export function modele(cle) {
  return MODELES.find((m) => m.cle === cle) || null;
}
