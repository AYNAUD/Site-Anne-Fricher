/* =========================================================================
   Médias — dimensions, inventaire et enregistrement des envois.

   Les dimensions sont lues directement dans l'en-tête binaire du fichier
   (PNG, JPEG, GIF, WebP) ou dans l'attribut `viewBox` d'un SVG : le site
   exige `width` et `height` sur chaque <img>, l'administration les remplit
   donc toute seule.
   ========================================================================= */
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { join, extname, basename, relative, posix, sep } from "node:path";

export const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif"];

/* ------------------------------------------------------------------ *
   Dimensions
 * ------------------------------------------------------------------ */
function dimensionsPng(buf) {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { largeur: buf.readUInt32BE(16), hauteur: buf.readUInt32BE(20) };
}

function dimensionsGif(buf) {
  if (buf.length < 10 || buf.toString("ascii", 0, 3) !== "GIF") return null;
  return { largeur: buf.readUInt16LE(6), hauteur: buf.readUInt16LE(8) };
}

function dimensionsJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marqueur = buf[i + 1];
    // SOF0…SOF15, hors marqueurs sans dimension (DHT/JPG/DAC)
    if (marqueur >= 0xc0 && marqueur <= 0xcf &&
        marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc) {
      return { hauteur: buf.readUInt16BE(i + 5), largeur: buf.readUInt16BE(i + 7) };
    }
    const taille = buf.readUInt16BE(i + 2);
    if (taille < 2) return null;
    i += 2 + taille;
  }
  return null;
}

function dimensionsWebp(buf) {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const type = buf.toString("ascii", 12, 16);
  if (type === "VP8 ") {
    return { largeur: buf.readUInt16LE(26) & 0x3fff, hauteur: buf.readUInt16LE(28) & 0x3fff };
  }
  if (type === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { largeur: (bits & 0x3fff) + 1, hauteur: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (type === "VP8X") {
    const l = buf[24] | (buf[25] << 8) | (buf[26] << 16);
    const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
    return { largeur: l + 1, hauteur: h + 1 };
  }
  return null;
}

function dimensionsSvg(buf) {
  const texte = buf.toString("utf8", 0, Math.min(buf.length, 4096));
  const boite = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i.exec(texte);
  if (boite) return { largeur: Math.round(+boite[1]), hauteur: Math.round(+boite[2]) };
  const l = /\bwidth\s*=\s*["']([\d.]+)/i.exec(texte);
  const h = /\bheight\s*=\s*["']([\d.]+)/i.exec(texte);
  if (l && h) return { largeur: Math.round(+l[1]), hauteur: Math.round(+h[1]) };
  return null;
}

/** Dimensions d'un fichier image, ou `null` si le format est inconnu. */
export async function dimensions(chemin) {
  let buf;
  try {
    buf = await readFile(chemin);
  } catch {
    return null;
  }
  return dimensionsPng(buf) || dimensionsJpeg(buf) || dimensionsGif(buf) ||
         dimensionsWebp(buf) || dimensionsSvg(buf);
}

/* ------------------------------------------------------------------ *
   Inventaire
 * ------------------------------------------------------------------ */
async function parcourirDossier(racine, dossier, resultat) {
  let entrees = [];
  try {
    entrees = await readdir(dossier, { withFileTypes: true });
  } catch {
    return resultat;
  }
  for (const entree of entrees) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) {
      await parcourirDossier(racine, chemin, resultat);
    } else if (EXTENSIONS.indexOf(extname(entree.name).toLowerCase()) !== -1) {
      const info = await stat(chemin).catch(() => null);
      const relatif = relative(racine, chemin).split(sep).join(posix.sep);
      const taille = await dimensions(chemin);
      resultat.push({
        chemin: relatif,
        nom: basename(chemin),
        dossier: relatif.split("/").slice(0, -1).join("/"),
        octets: info ? info.size : 0,
        largeur: taille ? taille.largeur : null,
        hauteur: taille ? taille.hauteur : null,
        modifie: info ? info.mtimeMs : 0
      });
    }
  }
  return resultat;
}

/** Liste toutes les images de `assets/img`, chemins relatifs à la racine du site. */
export async function listerMedias(racine) {
  const liste = await parcourirDossier(racine, join(racine, "assets", "img"), []);
  return liste.sort((a, b) => a.chemin.localeCompare(b.chemin, "fr"));
}

/* ------------------------------------------------------------------ *
   Enregistrement d'un envoi
 * ------------------------------------------------------------------ */
export function assainirNomFichier(nom) {
  const ext = extname(nom).toLowerCase();
  const base = basename(nom, extname(nom))
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
  return base + (EXTENSIONS.indexOf(ext) !== -1 ? ext : ".jpg");
}

/**
 * Enregistre une image reçue en base64 dans `assets/img/<dossier>`.
 * Ne remplace jamais un fichier existant : un suffixe numérique est ajouté.
 */
export async function enregistrerImage(racine, { nom, dossier, donnees }) {
  const sousDossier = String(dossier || "")
    .split("/")
    .map((p) => p.replace(/[^a-zA-Z0-9-_]/g, ""))
    .filter(Boolean)
    .join("/");

  const cible = join(racine, "assets", "img", sousDossier);
  await mkdir(cible, { recursive: true });

  const base64 = String(donnees).replace(/^data:[^;]+;base64,/, "");
  const buf = Buffer.from(base64, "base64");
  if (!buf.length) throw new Error("Fichier vide ou illisible.");

  let fichier = assainirNomFichier(nom);
  let compteur = 2;
  while (await stat(join(cible, fichier)).then(() => true).catch(() => false)) {
    const ext = extname(fichier);
    const base = basename(fichier, ext).replace(/-\d+$/, "");
    fichier = `${base}-${compteur}${ext}`;
    compteur++;
  }

  const cheminComplet = join(cible, fichier);
  await writeFile(cheminComplet, buf);

  const taille = await dimensions(cheminComplet);
  const relatif = ["assets/img", sousDossier, fichier].filter(Boolean).join("/");
  return {
    chemin: relatif,
    nom: fichier,
    dossier: ["assets/img", sousDossier].filter(Boolean).join("/"),
    octets: buf.length,
    largeur: taille ? taille.largeur : null,
    hauteur: taille ? taille.hauteur : null
  };
}
