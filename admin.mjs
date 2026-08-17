/**
 * Interface d'administration du site — serveur local, sans dépendance.
 *
 *   node admin.mjs            → http://localhost:5174/admin
 *   node admin.mjs 8080       → http://localhost:8080/admin
 *
 * Le serveur sert le site tel quel (comme `serve.mjs`) et, en plus :
 *   • /admin      l'interface d'administration ;
 *   • /api/…      les opérations de lecture et d'écriture sur les fichiers.
 *
 * Les modifications sont écrites directement dans les fichiers `.html` du
 * dépôt : le site reste strictement statique, sans base de données ni étape
 * de construction. Toute écriture est précédée d'une sauvegarde (voir
 * `admin/lib/sauvegardes.mjs`), annulable depuis l'interface.
 *
 * Le serveur n'écoute que sur 127.0.0.1 : il n'est pas destiné à être
 * exposé en ligne, et le dossier `admin/` n'a pas à être mis en ligne.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { arbreDe, modifierBloc, deplacerBloc, supprimerBloc, dupliquerBloc, ajouterBloc, modifierMeta } from "./admin/lib/document.mjs";
import { MODELES } from "./admin/lib/blocs.mjs";
import { listerMedias, enregistrerImage } from "./admin/lib/images.mjs";
import { listerPages, creerPage, synchroniserMenu, majSitemap, modelesDePage } from "./admin/lib/pages.mjs";
import { transaction, annuler, historique } from "./admin/lib/sauvegardes.mjs";

const RACINE = fileURLToPath(new URL(".", import.meta.url)).replace(/[/\\]$/, "");
const PORT = Number(process.argv[2] || process.env.PORT) || 5174;
const TAILLE_MAX = 40 * 1024 * 1024; // envois d'images compris

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml":  "application/xml; charset=utf-8",
  ".txt":  "text/plain; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif":  "image/gif",
  ".ico":  "image/x-icon",
  ".woff2": "font/woff2",
  ".woff":  "font/woff"
};

/* ------------------------------------------------------------------ *
   Utilitaires
 * ------------------------------------------------------------------ */
function repondreJson(res, code, donnees) {
  const corps = Buffer.from(JSON.stringify(donnees), "utf8");
  res.writeHead(code, {
    "Content-Type": TYPES[".json"],
    "Content-Length": corps.length,
    "Cache-Control": "no-store"
  });
  res.end(corps);
}

function lireCorps(req) {
  return new Promise((resolve, rejeter) => {
    let taille = 0;
    const morceaux = [];
    req.on("data", (m) => {
      taille += m.length;
      if (taille > TAILLE_MAX) {
        rejeter(new Error("Contenu trop volumineux (40 Mo maximum)."));
        req.destroy();
        return;
      }
      morceaux.push(m);
    });
    req.on("end", () => {
      if (!morceaux.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(morceaux).toString("utf8")));
      } catch (err) {
        rejeter(new Error("Requête illisible : " + err.message));
      }
    });
    req.on("error", rejeter);
  });
}

/** Vérifie qu'un nom de page désigne bien une page du site. */
async function pageValide(fichier) {
  if (!/^[A-Za-z0-9_-]+\.html$/.test(String(fichier || ""))) {
    throw new Error("Nom de page invalide.");
  }
  const chemin = join(RACINE, fichier);
  const info = await stat(chemin).catch(() => null);
  if (!info || !info.isFile()) throw new Error(`La page ${fichier} n'existe pas.`);
  return chemin;
}

const lirePage = (fichier) => readFile(join(RACINE, fichier), "utf8");

/** Réponse commune après modification : l'arbre à jour de la page. */
async function etatPage(fichier) {
  const src = await lirePage(fichier);
  return Object.assign({ fichier }, arbreDe(src));
}

/** Modèles de blocs, sans les fonctions de construction. */
const modelesPublics = () => MODELES.map((m) => ({
  cle: m.cle,
  nom: m.nom,
  description: m.description,
  contextes: m.contextes,
  champs: m.champs
}));

/* ------------------------------------------------------------------ *
   Opérations d'écriture
 * ------------------------------------------------------------------ */
async function ecrirePage(libelle, fichier, contenu) {
  const tr = transaction(RACINE, libelle);
  await tr.ecrire(fichier, contenu);
  await tr.valider({ page: fichier });
}

/* ------------------------------------------------------------------ *
   Interface de programmation
 * ------------------------------------------------------------------ */
async function api(req, res, url) {
  const chemin = url.pathname.replace(/^\/api\/?/, "");
  const corps = req.method === "POST" ? await lireCorps(req) : {};

  switch (`${req.method} ${chemin}`) {
    /* ---------------- Lecture ---------------- */
    case "GET pages": {
      return repondreJson(res, 200, {
        pages: await listerPages(RACINE),
        modelesPage: modelesDePage()
      });
    }

    case "GET page": {
      const fichier = url.searchParams.get("fichier");
      await pageValide(fichier);
      return repondreJson(res, 200, await etatPage(fichier));
    }

    case "GET modeles":
      return repondreJson(res, 200, { modeles: modelesPublics() });

    case "GET medias":
      return repondreJson(res, 200, { medias: await listerMedias(RACINE) });

    case "GET historique":
      return repondreJson(res, 200, { historique: await historique(RACINE) });

    /* ---------------- Blocs ---------------- */
    case "POST bloc/modifier": {
      await pageValide(corps.fichier);
      const src = await lirePage(corps.fichier);
      const sortie = await modifierBloc(src, corps.chemin, corps.valeurs || {}, { racine: RACINE });
      if (sortie !== src) await ecrirePage(`Modification d'un bloc — ${corps.fichier}`, corps.fichier, sortie);
      return repondreJson(res, 200, await etatPage(corps.fichier));
    }

    case "POST bloc/deplacer": {
      await pageValide(corps.fichier);
      const src = await lirePage(corps.fichier);
      const sortie = deplacerBloc(src, corps.chemin, Number(corps.sens) || 1);
      await ecrirePage(`Déplacement d'un bloc — ${corps.fichier}`, corps.fichier, sortie);
      return repondreJson(res, 200, await etatPage(corps.fichier));
    }

    case "POST bloc/supprimer": {
      await pageValide(corps.fichier);
      const src = await lirePage(corps.fichier);
      const sortie = supprimerBloc(src, corps.chemin);
      await ecrirePage(`Suppression d'un bloc — ${corps.fichier}`, corps.fichier, sortie);
      return repondreJson(res, 200, await etatPage(corps.fichier));
    }

    case "POST bloc/dupliquer": {
      await pageValide(corps.fichier);
      const src = await lirePage(corps.fichier);
      const sortie = dupliquerBloc(src, corps.chemin);
      await ecrirePage(`Duplication d'un bloc — ${corps.fichier}`, corps.fichier, sortie);
      return repondreJson(res, 200, await etatPage(corps.fichier));
    }

    case "POST bloc/ajouter": {
      await pageValide(corps.fichier);
      const src = await lirePage(corps.fichier);
      const sortie = await ajouterBloc(
        src,
        corps.cheminParent === undefined ? "" : corps.cheminParent,
        corps.position,
        corps.modele,
        corps.valeurs || {},
        { racine: RACINE }
      );
      await ecrirePage(`Ajout d'un bloc — ${corps.fichier}`, corps.fichier, sortie);
      return repondreJson(res, 200, await etatPage(corps.fichier));
    }

    /* ---------------- Pages ---------------- */
    case "POST page/meta": {
      await pageValide(corps.fichier);
      const src = await lirePage(corps.fichier);
      const sortie = modifierMeta(src, corps);
      if (sortie !== src) await ecrirePage(`Référencement — ${corps.fichier}`, corps.fichier, sortie);
      return repondreJson(res, 200, await etatPage(corps.fichier));
    }

    case "POST page/creer": {
      const { fichier, contenu, libelle } = await creerPage(RACINE, corps);
      const tr = transaction(RACINE, `Création de la page ${fichier}`);
      await tr.ecrire(fichier, contenu);

      if (corps.menu !== false) {
        await synchroniserMenu(RACINE, fichier, libelle, true, (nom, texte) => tr.ecrire(nom, texte));
      }
      await majSitemap(RACINE, fichier, true, (nom, texte) => tr.ecrire(nom, texte));
      await tr.valider({ page: fichier });

      return repondreJson(res, 200, {
        fichier,
        pages: await listerPages(RACINE),
        page: await etatPage(fichier)
      });
    }

    case "POST page/menu": {
      await pageValide(corps.fichier);
      const tr = transaction(RACINE, `${corps.present ? "Ajout au" : "Retrait du"} menu — ${corps.fichier}`);
      const touchees = await synchroniserMenu(
        RACINE, corps.fichier, corps.libelle || corps.fichier.replace(/\.html$/, ""),
        corps.present !== false, (nom, texte) => tr.ecrire(nom, texte)
      );
      await majSitemap(RACINE, corps.fichier, corps.present !== false, (nom, texte) => tr.ecrire(nom, texte));
      await tr.valider({ page: corps.fichier });
      return repondreJson(res, 200, { touchees, pages: await listerPages(RACINE) });
    }

    /* ---------------- Médias ---------------- */
    case "POST media/envoyer": {
      const media = await enregistrerImage(RACINE, corps);
      return repondreJson(res, 200, { media });
    }

    /* ---------------- Annulation ---------------- */
    case "POST annuler": {
      const entree = await annuler(RACINE);
      return repondreJson(res, 200, {
        annule: entree.libelle,
        pages: await listerPages(RACINE),
        historique: await historique(RACINE)
      });
    }

    default:
      return repondreJson(res, 404, { erreur: "Point d'entrée inconnu : " + chemin });
  }
}

/* ------------------------------------------------------------------ *
   Fichiers statiques (site + interface)
 * ------------------------------------------------------------------ */
const SCRIPT_APERCU =
  '\n<!-- Ajouté à la volée par admin.mjs pour la sélection des blocs -->\n' +
  '<script src="/admin/apercu.js"></script>\n';

async function statique(req, res, url) {
  let chemin = decodeURIComponent(url.pathname);
  if (chemin === "/admin" || chemin === "/admin/") chemin = "/admin/index.html";

  const sur = normalize(chemin).replace(/^([.]{2}[/\\])+/, "");
  let fichier = join(RACINE, sur);
  if (!fichier.startsWith(RACINE + sep) && fichier !== RACINE) {
    res.writeHead(403).end("403 — Accès refusé");
    return;
  }

  let info = await stat(fichier).catch(() => null);
  if (info?.isDirectory()) {
    fichier = join(fichier, "index.html");
    info = await stat(fichier).catch(() => null);
  }

  if (!info) {
    res.writeHead(404, { "Content-Type": TYPES[".html"] });
    res.end('<h1>404</h1><p>Page introuvable. <a href="/admin">Retour à l\'administration</a></p>');
    return;
  }

  const extension = extname(fichier).toLowerCase();
  let corps = await readFile(fichier);

  // Aperçu éditable : on injecte le script de sélection des blocs
  if (extension === ".html" && url.searchParams.has("apercu")) {
    const texte = corps.toString("utf8");
    const position = texte.lastIndexOf("</body>");
    corps = Buffer.from(
      position === -1 ? texte + SCRIPT_APERCU : texte.slice(0, position) + SCRIPT_APERCU + texte.slice(position),
      "utf8"
    );
  }

  res.writeHead(200, {
    "Content-Type": TYPES[extension] || "application/octet-stream",
    "Content-Length": corps.length,
    "Cache-Control": "no-store"
  });
  res.end(corps);
}

/* ------------------------------------------------------------------ *
   Serveur
 * ------------------------------------------------------------------ */
createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return await statique(req, res, url);
  } catch (err) {
    if (url.pathname.startsWith("/api/")) {
      return repondreJson(res, 400, { erreur: err.message });
    }
    res.writeHead(500, { "Content-Type": TYPES[".html"] });
    res.end("500 — " + err.message);
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Administration  → http://localhost:${PORT}/admin`);
  console.log(`Site            → http://localhost:${PORT}/`);
  console.log(`Dossier édité   → ${resolve(RACINE)}`);
});
