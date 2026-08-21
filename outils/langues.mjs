/**
 * Langues du site — outil de maintenance.
 *
 *   node outils/langues.mjs verifier
 *   node outils/langues.mjs synchroniser
 *   node outils/langues.mjs ajouter <code> "<Nom>" <ETIQUETTE> <locale> "<libellé du sélecteur>"
 *
 * Le site reste statique et sans étape de build : cet outil se contente
 * d'écrire dans les fichiers `.html`, qui demeurent la seule source de
 * vérité (même principe que `admin.mjs`, cf. CLAUDE.md §13 et §14).
 *
 * `langues.json` est la source unique : le sélecteur de langue de l'en-tête,
 * les liens `rel="alternate" hreflang`, `sitemap.xml` et les exclusions de
 * `robots.txt` en sont tous dérivés par la commande `synchroniser`.
 */
import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const RACINE = fileURLToPath(new URL("..", import.meta.url));

/* Marqueurs délimitant les zones régénérées. */
const TETE_DEBUT = "<!-- ===== ALTERNATIVES DE LANGUE ===== -->";
const TETE_FIN   = "<!-- ===== /ALTERNATIVES DE LANGUE ===== -->";
const NAV_DEBUT  = "<!-- ===== SÉLECTEUR DE LANGUE ===== -->";
const NAV_FIN    = "<!-- ===== /SÉLECTEUR DE LANGUE ===== -->";
const ROBOTS_DEBUT = "# ===== PAGES EXCLUES (généré par outils/langues.mjs) =====";
const ROBOTS_FIN   = "# ===== /PAGES EXCLUES =====";

/* Priorités du plan de site, par fichier ; les autres pages prennent 0.5. */
const PRIORITES = {
  "index.html": ["1.0", "monthly"],
  "services.html": ["0.9", "monthly"],
  "portfolio.html": ["0.9", "monthly"],
  "contact.html": ["0.9", "yearly"],
  "atelier.html": ["0.8", "yearly"],
  "projet-coussinage.html": ["0.7", "yearly"],
  "projet-rideaux-voilages.html": ["0.7", "yearly"]
};

/* ------------------------------------------------------------------ *
   Utilitaires fichiers — les fins de ligne de chaque fichier sont
   préservées (le dépôt mélange LF et CRLF).
 * ------------------------------------------------------------------ */
async function lire(chemin) {
  const brut = await readFile(chemin, "utf8");
  return { texte: brut.replace(/\r\n/g, "\n"), crlf: /\r\n/.test(brut) };
}

async function ecrire(chemin, texte, crlf) {
  await writeFile(chemin, crlf ? texte.replace(/\n/g, "\r\n") : texte);
}

/* ------------------------------------------------------------------ *
   Manifeste
 * ------------------------------------------------------------------ */
export async function charger() {
  const manifeste = JSON.parse(await readFile(join(RACINE, "langues.json"), "utf8"));
  const codes = new Set();
  for (const langue of manifeste.langues) {
    for (const champ of ["code", "etiquette", "nom", "locale", "selecteur"]) {
      if (!langue[champ]) {
        throw new Error(`langues.json : champ « ${champ} » manquant pour « ${langue.code || "?"} ».`);
      }
    }
    if (langue.dossier === undefined) {
      throw new Error(`langues.json : « dossier » manquant pour « ${langue.code} ».`);
    }
    if (langue.dossier && !langue.dossier.endsWith("/")) {
      throw new Error(`langues.json : « dossier » doit finir par « / » (${langue.code}).`);
    }
    if (codes.has(langue.code)) throw new Error(`langues.json : code « ${langue.code} » en double.`);
    codes.add(langue.code);
  }
  if (!manifeste.langues.some((l) => l.code === manifeste.defaut)) {
    throw new Error("langues.json : « defaut » ne correspond à aucune langue.");
  }
  if (!manifeste.domaine.endsWith("/")) {
    throw new Error("langues.json : « domaine » doit finir par « / ».");
  }
  return manifeste;
}

export const langueDefaut = (m) => m.langues.find((l) => l.code === m.defaut);
const dossierDe = (m, langue) => join(RACINE, langue.dossier);

/** Profondeur d'une page : 0 à la racine, 1 dans un dossier de langue. */
const profondeurDe = (langue) => (langue.dossier ? 1 : 0);

/** Adresse absolue d'une page dans une langue donnée. */
function adresse(manifeste, langue, fichier) {
  return manifeste.domaine + langue.dossier + (fichier === "index.html" ? "" : fichier);
}

/** Chemin relatif vers la même page dans une autre langue. */
function lienRelatif(depuis, vers, fichier) {
  if (depuis.dossier === vers.dossier) return fichier;
  return "../".repeat(profondeurDe(depuis)) + vers.dossier + fichier;
}

const echapper = (v) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** Échappement pour du texte XML (contenu d'élément, pas d'attribut). */
const echapperTexte = (v) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ------------------------------------------------------------------ *
   Inventaire des pages
 * ------------------------------------------------------------------ */
async function pagesDe(manifeste, langue) {
  const entrees = await readdir(dossierDe(manifeste, langue), { withFileTypes: true })
    .catch(() => []);
  return entrees
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => e.name)
    .sort();
}

const estNonIndexee = (texte) => /<meta\s+name="robots"[^>]*noindex/i.test(texte);

/**
 * Inventaire complet : les pages de chaque langue, et pour chaque nom de
 * fichier la liste des langues qui en possèdent réellement une version.
 * Une traduction manquante ne doit apparaître ni en `hreflang`, ni dans le
 * plan du site : elle donnerait une 404.
 */
async function inventaire(manifeste) {
  const parLangue = new Map();
  const disponibles = new Map();

  for (const langue of manifeste.langues) {
    const pages = await pagesDe(manifeste, langue);
    parLangue.set(langue.code, pages);
    for (const fichier of pages) {
      if (!disponibles.has(fichier)) disponibles.set(fichier, []);
      disponibles.get(fichier).push(langue);
    }
  }
  return { parLangue, disponibles };
}

/* ------------------------------------------------------------------ *
   Blocs régénérés
 * ------------------------------------------------------------------ */
function blocTete(manifeste, fichier, disponibles) {
  const langues = disponibles.get(fichier) || manifeste.langues;
  const lignes = langues.map(
    (autre) => `<link rel="alternate" hreflang="${autre.code}" href="${adresse(manifeste, autre, fichier)}">`);
  const defaut = langueDefaut(manifeste);
  if (langues.some((l) => l.code === defaut.code)) {
    lignes.push(`<link rel="alternate" hreflang="x-default" href="${adresse(manifeste, defaut, fichier)}">`);
  }
  return lignes.join("\n");
}

/**
 * Sélecteur de langue. Il propose toujours toutes les langues : si la page
 * n'existe pas encore dans l'une d'elles, le lien mène à l'accueil de cette
 * langue plutôt que vers un fichier absent.
 */
function blocNav(manifeste, langue, fichier, indentation, disponibles) {
  const presentes = disponibles.get(fichier) || [];
  const liens = manifeste.langues.map((autre) => {
    const courant = autre.code === langue.code ? ' aria-current="true"' : "";
    const traduite = presentes.some((l) => l.code === autre.code);
    const href = lienRelatif(langue, autre, traduite ? fichier : "index.html");
    return `${indentation}  <a class="langues__lien" href="${href}" hreflang="${autre.code}"` +
           ` lang="${autre.code}" title="${echapper(autre.nom)}"${courant}>${echapper(autre.etiquette)}</a>`;
  });
  return [
    `${indentation}<div class="langues" role="group" aria-label="${echapper(langue.selecteur)}">`,
    ...liens,
    `${indentation}</div>`
  ].join("\n");
}

/* ------------------------------------------------------------------ *
   Injection : remplace le contenu entre marqueurs, ou pose les
   marqueurs au bon endroit s'ils sont absents.
 * ------------------------------------------------------------------ */
function injecter(texte, debut, fin, contenu, indentation, ancre) {
  const bloc = `${indentation}${debut}\n${contenu}\n${indentation}${fin}`;
  const i = texte.indexOf(indentation + debut);
  if (i !== -1) {
    const j = texte.indexOf(indentation + fin, i);
    if (j === -1) throw new Error(`marqueur de fin « ${fin} » manquant.`);
    return texte.slice(0, i) + bloc + texte.slice(j + (indentation + fin).length);
  }
  const k = ancre(texte);
  if (k === -1) return null;
  return texte.slice(0, k) + bloc + "\n" + texte.slice(k);
}

/** Début de la ligne contenant la première occurrence de `motif`. */
function debutDeLigne(texte, motif) {
  const i = texte.indexOf(motif);
  if (i === -1) return -1;
  return texte.lastIndexOf("\n", i) + 1;
}

function synchroniserPage(manifeste, langue, fichier, texte, disponibles) {
  const tete = injecter(
    texte, TETE_DEBUT, TETE_FIN, blocTete(manifeste, fichier, disponibles), "",
    (t) => {
      const i = debutDeLigne(t, '<link rel="canonical"');
      return i === -1 ? -1 : t.indexOf("\n", i) + 1;
    });
  if (tete === null) {
    throw new Error('aucun <link rel="canonical"> : impossible de poser les alternatives de langue.');
  }

  const indentation = "      ";
  const nav = injecter(
    tete, NAV_DEBUT, NAV_FIN, blocNav(manifeste, langue, fichier, indentation, disponibles), indentation,
    (t) => debutDeLigne(t, '<a class="header__cta"'));
  if (nav === null) {
    throw new Error('aucun <a class="header__cta"> : impossible de poser le sélecteur de langue.');
  }
  return nav;
}

/** Date (AAAA-MM-JJ) du dernier commit touchant le fichier, sinon aujourd'hui. */
function dateDeDerniereModification(chemin) {
  try {
    const sortie = execFileSync(
      "git", ["log", "-1", "--format=%cs", "--", chemin],
      { cwd: RACINE, encoding: "utf8" }).trim();
    if (sortie) return sortie;
  } catch { /* pas de dépôt git, ou fichier non suivi : on retombe sur aujourd'hui */ }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Repère les images de contenu d'une page (hors logos et icônes de marque,
 * hors images purement décoratives dont l'alt est vide), pour les inclure
 * dans le plan de site — favorise l'indexation par la recherche d'images.
 */
function extraireImages(manifeste, langue, texte) {
  const prefixe = "../".repeat(profondeurDe(langue));
  const vues = new Set();
  const images = [];
  const regexImg = /<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g;
  let correspondance;
  while ((correspondance = regexImg.exec(texte))) {
    const balise = correspondance[0];
    const src = correspondance[1];
    if (!src.startsWith("assets/img/") && !src.startsWith(prefixe + "assets/img/")) continue;
    if (/\/(logo|logo-clair)\.png$/.test(src)) continue;
    const relatif = prefixe && src.startsWith(prefixe) ? src.slice(prefixe.length) : src;
    const loc = manifeste.domaine + relatif;
    if (vues.has(loc)) continue;
    const alt = (balise.match(/\balt="([^"]*)"/) || [, ""])[1];
    if (!alt) continue; // décorative : pas de légende utile pour l'index d'images
    vues.add(loc);
    images.push({ loc, alt });
  }
  return images;
}

/* ------------------------------------------------------------------ *
   Plan de site et robots.txt
 * ------------------------------------------------------------------ */
/**
 * @param {Map<string, object[]>} presence  fichier → langues où la page
 *        existe réellement et est indexable. Une page pas encore traduite
 *        ne doit apparaître ni en `<loc>` ni en alternative.
 * @param {Map<string, object[]>} imagesParPage  "dossier/fichier" → images
 *        de contenu de cette page, cf. extraireImages().
 */
async function ecrireSitemap(manifeste, presence, imagesParPage) {
  const defaut = langueDefaut(manifeste);
  const blocs = [];

  // Les pages connues gardent l'ordre de PRIORITES ; les autres suivent.
  const ordre = Object.keys(PRIORITES);
  const rang = (f) => (ordre.indexOf(f) === -1 ? ordre.length : ordre.indexOf(f));
  const triees = [...presence.keys()].sort((a, b) => rang(a) - rang(b) || a.localeCompare(b, "fr"));

  for (const fichier of triees) {
    const [priorite, frequence] = PRIORITES[fichier] || ["0.5", "yearly"];
    const disponibles = presence.get(fichier);

    // Les alternatives n'ont de sens qu'à partir de deux versions.
    const alternatives = disponibles.length < 2 ? [] : disponibles
      .map((l) => `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${adresse(manifeste, l, fichier)}"/>`)
      .concat(disponibles.some((l) => l.code === defaut.code)
        ? [`    <xhtml:link rel="alternate" hreflang="x-default" href="${adresse(manifeste, defaut, fichier)}"/>`]
        : []);

    for (const langue of disponibles) {
      const lastmod = dateDeDerniereModification(langue.dossier + fichier);
      const images = imagesParPage.get(langue.dossier + fichier) || [];
      blocs.push([
        "  <url>",
        `    <loc>${adresse(manifeste, langue, fichier)}</loc>`,
        ...alternatives,
        ...images.map((img) => [
          "    <image:image>",
          `      <image:loc>${img.loc}</image:loc>`,
          `      <image:caption>${echapperTexte(img.alt)}</image:caption>`,
          "    </image:image>"
        ].join("\n")),
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${frequence}</changefreq>`,
        `    <priority>${priorite}</priority>`,
        "  </url>"
      ].join("\n"));
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!-- Généré par : node outils/langues.mjs synchroniser -->",
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml"',
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...blocs,
    "</urlset>",
    ""
  ].join("\n");

  const chemin = join(RACINE, "sitemap.xml");
  const { crlf } = await lire(chemin).catch(() => ({ crlf: false }));
  await ecrire(chemin, xml, crlf);
}

async function ecrireRobots(manifeste, exclues) {
  const chemin = join(RACINE, "robots.txt");
  const { texte, crlf } = await lire(chemin);
  const bloc = [ROBOTS_DEBUT, ...exclues.map((c) => `Disallow: /${c}`), ROBOTS_FIN].join("\n");

  let sortie;
  const i = texte.indexOf(ROBOTS_DEBUT);
  if (i !== -1) {
    const j = texte.indexOf(ROBOTS_FIN, i);
    sortie = texte.slice(0, i) + bloc + texte.slice(j + ROBOTS_FIN.length);
  } else {
    // Première exécution : retire les exclusions de pages existantes,
    // garde /admin/ et pose le bloc juste au-dessus.
    sortie = texte.replace(/^Disallow: \/(?!admin\/).*\n/gm, "");
    sortie = sortie.replace(/^Disallow: \/admin\/$/m, `${bloc}\nDisallow: /admin/`);
  }
  await ecrire(chemin, sortie, crlf);
}

/* ------------------------------------------------------------------ *
   Commande : synchroniser
 * ------------------------------------------------------------------ */
export async function synchroniser() {
  const manifeste = await charger();
  const { parLangue, disponibles } = await inventaire(manifeste);
  const reference = parLangue.get(manifeste.defaut) || [];
  const presence = new Map();   // fichier → langues où la page est indexable
  const imagesParPage = new Map(); // "dossier/fichier" → images de contenu
  const exclues = [];
  let touchees = 0;

  for (const langue of manifeste.langues) {
    const pages = parLangue.get(langue.code);
    for (const fichier of pages) {
      const chemin = join(dossierDe(manifeste, langue), fichier);
      const { texte, crlf } = await lire(chemin);
      let sortie;
      try {
        sortie = synchroniserPage(manifeste, langue, fichier, texte, disponibles);
      } catch (err) {
        console.warn(`  ⚠ ${langue.dossier}${fichier} : ${err.message}`);
        continue;
      }
      if (sortie !== texte) {
        await ecrire(chemin, sortie, crlf);
        touchees++;
        console.log(`  modifié  ${langue.dossier}${fichier}`);
      }
      if (estNonIndexee(texte)) {
        exclues.push(langue.dossier + fichier);
      } else {
        if (!presence.has(fichier)) presence.set(fichier, []);
        presence.get(fichier).push(langue);
        imagesParPage.set(langue.dossier + fichier, extraireImages(manifeste, langue, sortie));
      }
    }
    const manquantes = reference.filter((p) => !pages.includes(p));
    if (manquantes.length) {
      console.warn(`  ⚠ ${langue.code} : page(s) absente(s) — ${manquantes.join(", ")}`);
    }
  }

  await ecrireSitemap(manifeste, presence, imagesParPage);
  await ecrireRobots(manifeste, exclues);
  console.log(`\n${touchees} page(s) mise(s) à jour · sitemap.xml et robots.txt régénérés.`);
}

/* ------------------------------------------------------------------ *
   Commande : ajouter une langue
 * ------------------------------------------------------------------ */
async function ajouter(code, nom, etiquette, locale, selecteur) {
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(code)) {
    throw new Error("le code de langue doit ressembler à « es » ou « pt-br ».");
  }
  const manifeste = await charger();
  if (manifeste.langues.some((l) => l.code === code)) {
    throw new Error(`la langue « ${code} » existe déjà.`);
  }

  const source = langueDefaut(manifeste);
  const cible = { code, dossier: code + "/", etiquette, nom, locale, selecteur };
  await mkdir(join(RACINE, cible.dossier), { recursive: true });

  for (const fichier of await pagesDe(manifeste, source)) {
    const destination = join(RACINE, cible.dossier, fichier);
    if (await stat(destination).catch(() => null)) {
      console.log(`  ignoré   ${cible.dossier}${fichier} (existe déjà)`);
      continue;
    }
    const { texte, crlf } = await lire(join(dossierDe(manifeste, source), fichier));
    const sortie = texte
      .replace(/<html lang="[^"]*">/, `<html lang="${code}">`)
      .replace(/"assets\//g, `"${"../".repeat(profondeurDe(cible))}assets/`)
      .replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${adresse(manifeste, cible, fichier)}$2`)
      .replace(/(<meta property="og:locale" content=")[^"]*(">)/, `$1${locale}$2`);
    await ecrire(destination, sortie, crlf);
    console.log(`  créé     ${cible.dossier}${fichier}`);
  }

  manifeste.langues.push(cible);
  const cheminManifeste = join(RACINE, "langues.json");
  const { crlf } = await lire(cheminManifeste);
  await ecrire(cheminManifeste, JSON.stringify(manifeste, null, 2) + "\n", crlf);

  console.log(`\nLangue « ${code} » créée à partir de « ${source.code} ». Synchronisation…\n`);
  await synchroniser();
  console.log(
    "\nÀ faire maintenant :\n" +
    `  1. traduire le contenu de ${cible.dossier} — les pages sont encore en ${source.code} ;\n` +
    `  2. ajouter les libellés « ${code} » dans TEXTES, en tête de assets/js/main.js ;\n` +
    "  3. relire <title>, meta description et og:description de chaque page.");
}

/* ------------------------------------------------------------------ *
   Commande : vérifier
 * ------------------------------------------------------------------ */
async function verifier() {
  const manifeste = await charger();
  const { parLangue, disponibles } = await inventaire(manifeste);
  const reference = parLangue.get(manifeste.defaut) || [];
  const problemes = [];

  for (const langue of manifeste.langues) {
    const pages = parLangue.get(langue.code);
    for (const p of reference.filter((p) => !pages.includes(p))) {
      problemes.push(`${langue.code} : page manquante — ${p}`);
    }
    for (const p of pages.filter((p) => !reference.includes(p))) {
      problemes.push(`${langue.code} : page sans équivalent en ${manifeste.defaut} — ${p}`);
    }

    for (const fichier of pages) {
      const nom = langue.dossier + fichier;
      const { texte } = await lire(join(dossierDe(manifeste, langue), fichier));

      const lang = texte.match(/<html lang="([^"]*)"/);
      if (!lang || lang[1] !== langue.code) {
        problemes.push(`${nom} : <html lang> vaut « ${lang ? lang[1] : "—"} », attendu « ${langue.code} »`);
      }

      const canonique = texte.match(/<link rel="canonical" href="([^"]*)"/);
      const attendue = adresse(manifeste, langue, fichier);
      if (!canonique) problemes.push(`${nom} : pas de <link rel="canonical">`);
      else if (canonique[1] !== attendue) {
        problemes.push(`${nom} : canonical « ${canonique[1]} », attendu « ${attendue} »`);
      }

      const locale = texte.match(/<meta property="og:locale" content="([^"]*)"/);
      if (locale && locale[1] !== langue.locale) {
        problemes.push(`${nom} : og:locale « ${locale[1]} », attendu « ${langue.locale} »`);
      }

      if (!texte.includes(TETE_DEBUT)) problemes.push(`${nom} : bloc « alternatives de langue » absent`);
      else if (!texte.includes(NAV_DEBUT)) problemes.push(`${nom} : sélecteur de langue absent`);
      else if (synchroniserPage(manifeste, langue, fichier, texte, disponibles) !== texte) {
        problemes.push(`${nom} : blocs de langue périmés — lancer « synchroniser »`);
      }
    }
  }

  if (problemes.length) {
    console.error("Problèmes détectés :\n" + problemes.map((p) => "  ✗ " + p).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      `✓ ${manifeste.langues.length} langue(s) × ${reference.length} page(s) — tout est cohérent.`);
  }
}

/* ------------------------------------------------------------------ *
   Entrée
 * ------------------------------------------------------------------ */
const [commande, ...args] = process.argv.slice(2);
const appeleEnLigneDeCommande =
  !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (appeleEnLigneDeCommande) {

  try {
    if (commande === "synchroniser") {
      await synchroniser();
    } else if (commande === "verifier") {
      await verifier();
    } else if (commande === "ajouter") {
      if (args.length < 5) {
        throw new Error(
          'usage : node outils/langues.mjs ajouter <code> "<Nom>" <ETIQUETTE> <locale> "<libellé du sélecteur>"\n' +
          '  exemple : node outils/langues.mjs ajouter es "Español" ES es_ES "Idioma del sitio"');
      }
      await ajouter(...args);
    } else {
      console.log(
        "Langues du site — usage :\n" +
        "  node outils/langues.mjs verifier       contrôle la cohérence des langues\n" +
        "  node outils/langues.mjs synchroniser   régénère sélecteurs, hreflang, sitemap.xml, robots.txt\n" +
        '  node outils/langues.mjs ajouter <code> "<Nom>" <ETIQUETTE> <locale> "<libellé>"\n');
    }
  } catch (err) {
    console.error("✗ " + err.message);
    process.exitCode = 1;
  }
}
