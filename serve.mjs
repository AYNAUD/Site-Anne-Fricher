/**
 * Petit serveur statique sans dépendance, pour prévisualiser le site en local.
 *
 *   node serve.mjs            → http://localhost:5173
 *   node serve.mjs 8080       → http://localhost:8080
 *
 * Le site fonctionne aussi en ouvrant simplement index.html dans un navigateur,
 * mais passer par http:// évite les restrictions de l'origine « file:// »
 * (polices, iframe de la carte, etc.).
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT) || 5173;

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
  ".ico":  "image/x-icon",
  ".woff2": "font/woff2",
  ".woff":  "font/woff"
};

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);

    // Empêche toute remontée hors du dossier du site
    const safe = normalize(url).replace(/^([.]{2}[/\\])+/, "");
    let file = join(ROOT, safe);
    if (!file.startsWith(ROOT.replace(new RegExp(`\\${sep}$`), ""))) {
      res.writeHead(403).end("403 — Accès refusé");
      return;
    }

    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      file = join(file, "index.html");
      info = await stat(file).catch(() => null);
    }

    if (!info) {
      res.writeHead(404, { "Content-Type": TYPES[".html"] });
      res.end('<h1>404</h1><p>Page introuvable. <a href="/">Retour à l\'accueil</a></p>');
      return;
    }

    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-cache"
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end("500 — " + err.message);
  }
}).listen(PORT, () => {
  console.log(`Atelier Anne Fricher → http://localhost:${PORT}`);
});
