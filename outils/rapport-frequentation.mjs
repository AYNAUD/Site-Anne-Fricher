/**
 * Rapport quotidien de fréquentation de www.anne-fricher.com, par courriel.
 *
 *   node outils/rapport-frequentation.mjs [AAAA-MM-JJ] [--essai]
 *
 * Lancé chaque matin par .github/workflows/rapport-frequentation.yml, sur le
 * modèle du rapport du site de Lecques (même présentation, mêmes règles de
 * comptage). Le site n'a aucun outil de mesure d'audience (CLAUDE.md §10) :
 * les chiffres viennent des requêtes que Cloudflare, l'hébergeur, enregistre
 * de toute façon (jeu de données httpRequestsAdaptive de l'API GraphQL,
 * 31 jours de rétention sur tous les forfaits). Elles sont lues le temps du
 * calcul puis oubliées : rien n'est conservé, ni adresse IP ni journal,
 * seulement le courriel de totaux.
 *
 * L'envoi se fait par le serveur SMTP de Gmail, avec un mot de passe
 * d'application Google (révocable sur myaccount.google.com/apppasswords).
 *
 * Un visiteur : une même adresse IP et un même navigateur dans la journée,
 * robots exclus.
 *
 * Variables : CF_ZONE_ID (identifiant de la zone anne-fricher.com),
 * CF_API_TOKEN (jeton Cloudflare « Zone · Analytics · Read » sur cette zone),
 * GMAIL_ADRESSE et GMAIL_MOT_DE_PASSE (mot de passe d'application) ;
 * RAPPORT_DESTINATAIRE, facultative (par défaut GMAIL_ADRESSE).
 * --essai : affiche le rapport sans l'envoyer.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import tls from "node:tls";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const SITE = "https://www.anne-fricher.com";
const HOTES = new Set(["www.anne-fricher.com", "anne-fricher.com"]);
const API = "https://api.cloudflare.com/client/v4/graphql";
const LIMITE = 10000;
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export const ROBOTS = /bot\b|bot\/|crawl|spider|slurp|scrap|preview|facebookexternalhit|embedly|curl|wget|python|httpclient|okhttp|go-http|java\/|libwww|headless|phantom|lighthouse|pagespeed|monitor|uptime|pingdom|check|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|gptbot|claude|anthropic|bytespider|applebot|amazonbot|ccbot|seznam|qwantify|duckduckbot|bingbot|googlebot|feedfetcher|^$|^-$/i;
const MOBILE = /mobi|android|iphone|ipad|ipod/i;
const STATIQUE = /^\/(assets|admin)\/|\.(css|js|json|xml|txt|png|jpe?g|gif|webp|avif|svg|ico|woff2?|pdf|webmanifest|map|gz|zip)$/i;
const ERREURS_MAX_PAR_VISITEUR = 5;
const INTROUVABLE_TECHNIQUE = /^\/(assets|img|wa_files)\/|favicon|apple-touch-icon|^\/(robots\.txt|sitemap\.xml|ads\.txt|security\.txt)$|\.(php|env|asp|aspx|cgi|bak|sql|css|js|map|png|jpe?g|gif|webp|svg|ico|woff2?)$|\/(wp-|xmlrpc|cgi-bin|\.|_)|phpinfo|\/feed$|^\/$/i;

/* ------------------------------------------------------------ Lecture */

/** Chemin d'une page tel qu'on le compte : sans paramètres, sans « .html »
 *  ni barre finale (/services.html et /services sont la même page). */
export function cheminPage(cible) {
  let p = String(cible).split(/[?#]/)[0];
  try { p = decodeURIComponent(p); } catch { /* laissé tel quel */ }
  p = p.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

/* ------------------------------------------------------------ Calcul */

/** Totaux d'une journée à partir des requêtes renvoyées par Cloudflare
 *  ({ clientIP, clientRequestHTTPHost, clientRequestHTTPMethodName,
 *  clientRequestPath, userAgent, verifiedBotCategory, edgeResponseStatus }).
 *  Un robot : un robot connu de Cloudflare, ou un navigateur de la liste ROBOTS.
 *  Une page introuvable : une adresse sans extension de fichier (ancien lien,
 *  faute de frappe), demandée par quelqu'un qui fait moins de cinq erreurs dans
 *  la journée ; au-delà, c'est un outil qui sonde le site à la recherche de
 *  fichiers de configuration. */
export function analyserRequetes(requetes) {
  const visiteurs = new Map();
  const pages = new Map();
  const erreurs = new Map();
  let pagesVues = 0;
  let robots = 0;
  for (const r of requetes) {
    const hote = String(r.clientRequestHTTPHost || "").toLowerCase();
    if (hote && !HOTES.has(hote)) continue;
    const navigateur = r.userAgent || "";
    if (r.verifiedBotCategory || ROBOTS.test(navigateur)) { robots++; continue; }
    if (r.clientRequestHTTPMethodName !== "GET") continue;
    const chemin = cheminPage(r.clientRequestPath);
    const statut = Number(r.edgeResponseStatus);
    const qui = `${r.clientIP}\u0000${navigateur}`;
    if (statut === 404) {
      erreurs.set(qui, [...(erreurs.get(qui) || []), chemin]);
      continue;
    }
    if (STATIQUE.test(chemin)) continue;
    if (statut !== 200 && statut !== 304) continue;
    pagesVues++;
    pages.set(chemin, (pages.get(chemin) || 0) + 1);
    if (!visiteurs.has(qui)) visiteurs.set(qui, { mobile: MOBILE.test(navigateur) });
  }
  const introuvables = new Map();
  for (const chemins of erreurs.values()) {
    if (chemins.length >= ERREURS_MAX_PAR_VISITEUR) continue;
    for (const c of chemins) {
      if (/\.[a-z0-9]+$/i.test(c) || INTROUVABLE_TECHNIQUE.test(c)) continue;
      introuvables.set(c, (introuvables.get(c) || 0) + 1);
    }
  }
  const vus = [...visiteurs.values()];
  const tri = (m) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const compter = (f) => vus.filter(f).length;
  return {
    visiteurs: vus.length,
    pagesVues,
    robots,
    mobiles: compter((v) => v.mobile),
    pages: tri(pages).slice(0, 10),
    introuvables: tri(introuvables).slice(0, 5),
  };
}

/* ------------------------------------------------------------ Dates */

/** Hier, à Paris, au format AAAA-MM-JJ. */
export function hierAParis(maintenant = new Date()) {
  const aujourdhui = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);
  return decaler(aujourdhui, -1);
}

export function decaler(jour, n) {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Minuit à Paris du jour donné, en instant UTC. Le décalage est lu à 0 h UTC,
 *  avant le changement d'heure (1 h UTC), donc celui qui vaut à minuit. */
export function minuitAParis(jour) {
  const decalage = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", timeZoneName: "shortOffset" })
    .formatToParts(new Date(`${jour}T00:00:00Z`)).find((p) => p.type === "timeZoneName").value;
  const m = /GMT([+-]\d+)?(?::(\d+))?/.exec(decalage);
  const minutes = (Number(m[1] || 0) * 60) + Math.sign(Number(m[1] || 0)) * Number(m[2] || 0);
  return new Date(Date.parse(`${jour}T00:00:00Z`) - minutes * 60000);
}

export function jourEnLettres(jour) {
  const d = new Date(`${jour}T12:00:00Z`);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate() === 1 ? "1er" : d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/* ------------------------------------------------------------ Cloudflare */

const REQUETE = `query Frequentation($zone: string!, $debut: Time!, $fin: Time!) {
  viewer { zones(filter: { zoneTag: $zone }) {
    httpRequestsAdaptive(limit: ${LIMITE}, orderBy: [datetime_ASC],
      filter: { datetime_geq: $debut, datetime_lt: $fin, requestSource: "eyeball" }) {
      datetime clientIP clientRequestHTTPHost clientRequestHTTPMethodName
      clientRequestPath userAgent verifiedBotCategory edgeResponseStatus
    }
  } }
}`;

async function interroger({ zone, jeton, debut, fin, lire }) {
  const r = await lire(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json", "User-Agent": "rapport-frequentation-anne-fricher" },
    body: JSON.stringify({ query: REQUETE, variables: { zone, debut: debut.toISOString(), fin: fin.toISOString() } }),
  });
  const reponse = await r.json().catch(() => ({}));
  if (!r.ok || reponse.errors?.length) {
    throw new Error(`Cloudflare a refusé la lecture (${r.status}) : ${(reponse.errors || []).map((e) => e.message).join(" ; ") || "réponse inattendue"}`);
  }
  const zones = reponse.data?.viewer?.zones || [];
  if (!zones.length) throw new Error("Zone introuvable : vérifiez CF_ZONE_ID et les droits du jeton.");
  return zones[0].httpRequestsAdaptive || [];
}

/** Toutes les requêtes d'une journée (heure de Paris : 23 ou 25 h les jours
 *  de changement d'heure), par pages de 10 000. */
export async function requetesDuJour(jour, { zone, jeton, lire = fetch }) {
  let debut = minuitAParis(jour);
  const fin = minuitAParis(decaler(jour, 1));
  const toutes = [];
  for (;;) {
    const lot = await interroger({ zone, jeton, debut, fin, lire });
    toutes.push(...lot);
    if (lot.length < LIMITE) return toutes;
    debut = new Date(Date.parse(lot[lot.length - 1].datetime) + 1000);
  }
}

/* ------------------------------------------------------------ Titres */

/** Titre court de chaque page, lu dans les fichiers du dépôt : « Nos
 *  services », « Portfolio »… ; les pages anglaises reprennent le titre
 *  français suivi de « (EN) ». */
export function titresDesPages(racine = RACINE) {
  const titres = new Map();
  const court = (fichier) => {
    const t = /<title>([^<]*)<\/title>/i.exec(readFileSync(fichier, "utf8"))?.[1] || "";
    return t.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").split(" | ")[0].split(" — ")[0].trim();
  };
  for (const nom of readdirSync(racine).filter((f) => f.endsWith(".html"))) {
    const titre = nom === "index.html" ? "Accueil" : court(join(racine, nom));
    titres.set(cheminPage(`/${nom}`), titre);
    for (const dossier of readdirSync(racine, { withFileTypes: true }).filter((d) => d.isDirectory() && /^[a-z]{2}$/.test(d.name))) {
      if (existsSync(join(racine, dossier.name, nom))) titres.set(cheminPage(`/${dossier.name}/${nom}`), `${titre} (${dossier.name.toUpperCase()})`);
    }
  }
  return titres;
}

/* ------------------------------------------------------------ Courriel */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pourcent = (n, total) => (total ? `${Math.round((100 * n) / total)} %` : "—");

/** « +12 % », « −5 % », « = », ou rien sans point de comparaison. */
export function evolution(n, avant) {
  if (avant === null || avant === undefined) return "";
  if (!avant) return n ? "nouveau" : "=";
  const e = Math.round((100 * (n - avant)) / avant);
  return e === 0 ? "=" : `${e > 0 ? "+" : "−"}${Math.abs(e)} %`;
}

const SOURCE = "Chiffres tirés des requêtes enregistrées par l'hébergeur (Cloudflare) : un visiteur est une même adresse et un même navigateur dans la journée. Aucune donnée personnelle n'est conservée. La provenance des visiteurs (moteurs de recherche, réseaux sociaux…) n'est pas fournie par l'offre gratuite de Cloudflare. Détail : tableau de bord Cloudflare, anne-fricher.com, Analytics.";

/** Sujet, texte et HTML du rapport d'une journée. « veille » et
 *  « semaineAvant » : les totaux de J-1 et J-7, ou null s'ils manquent. */
export function composerRapport({ jour, totaux, veille, semaineAvant, titres = new Map() }) {
  const t = totaux;
  const quand = jourEnLettres(jour);
  const jourSemaine = quand.split(" ")[0];
  const titre = (c) => titres.get(c) || c;
  const comparaison = (cle) => [
    veille ? `veille : ${veille[cle]} (${evolution(t[cle], veille[cle])})` : "",
    semaineAvant ? `${jourSemaine} précédent : ${semaineAvant[cle]} (${evolution(t[cle], semaineAvant[cle])})` : "",
  ].filter(Boolean).join(" · ");
  const sujet = `Atelier Anne Fricher · Fréquentation du ${quand} : ${t.visiteurs} visiteur${t.visiteurs > 1 ? "s" : ""}`;
  const note = `Robots et outils automatiques écartés : ${t.robots} requête${t.robots > 1 ? "s" : ""}.`;

  const texte = [
    `Fréquentation de www.anne-fricher.com — ${quand}`,
    "",
    `Visiteurs : ${t.visiteurs}${comparaison("visiteurs") ? ` (${comparaison("visiteurs")})` : ""}`,
    `Pages vues : ${t.pagesVues}${comparaison("pagesVues") ? ` (${comparaison("pagesVues")})` : ""}`,
    `Sur téléphone ou tablette : ${pourcent(t.mobiles, t.visiteurs)} · sur ordinateur : ${pourcent(t.visiteurs - t.mobiles, t.visiteurs)}`,
    "",
    "Pages les plus consultées :",
    ...(t.pages.length ? t.pages.map(([c, n], i) => `  ${i + 1}. ${titre(c)} — ${n}`) : ["  aucune"]),
    ...(t.introuvables.length ? ["", "Pages introuvables demandées (lien cassé ou ancienne adresse ?) :", ...t.introuvables.map(([c, n]) => `  ${c} — ${n}`)] : []),
    "",
    note,
    SOURCE,
  ].join("\n");

  const ligne = (libelle, valeur, remarque = "") => `<tr><td style="padding:6px 12px 6px 0;color:#6b5a50">${esc(libelle)}</td><td style="padding:6px 0;font-weight:700;font-size:18px">${esc(valeur)}</td><td style="padding:6px 0 6px 12px;color:#6b5a50;font-size:14px">${esc(remarque)}</td></tr>`;
  const liste = (elements) => `<ol style="margin:6px 0 0;padding-left:22px">${elements.map((e) => `<li style="margin:3px 0">${e}</li>`).join("")}</ol>`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(sujet)}</title></head>
<body style="margin:0;background:#f7f3ee;font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#2b211c;line-height:1.5">
<div style="max-width:620px;margin:0 auto;padding:20px 16px">
<h1 style="font-size:20px;margin:0 0 4px">Fréquentation de www.anne-fricher.com</h1>
<p style="margin:0 0 16px;color:#6b5a50">${esc(quand)}</p>
<table style="border-collapse:collapse">
${ligne("Visiteurs", t.visiteurs, comparaison("visiteurs"))}
${ligne("Pages vues", t.pagesVues, comparaison("pagesVues"))}
${ligne("Téléphone ou tablette", pourcent(t.mobiles, t.visiteurs), `ordinateur : ${pourcent(t.visiteurs - t.mobiles, t.visiteurs)}`)}
</table>
<h2 style="font-size:16px;margin:20px 0 0">Pages les plus consultées</h2>
${t.pages.length ? liste(t.pages.map(([c, n]) => `<a href="${esc(SITE + c)}" style="color:#8c121a">${esc(titre(c))}</a> — ${n}`)) : '<p style="margin:6px 0 0">Aucune.</p>'}
${t.introuvables.length ? `<h2 style="font-size:16px;margin:20px 0 0">Pages introuvables demandées</h2><p style="margin:4px 0 0;color:#6b5a50;font-size:14px">Un lien cassé ou une ancienne adresse ?</p>${liste(t.introuvables.map(([c, n]) => `${esc(c)} — ${n}`))}` : ""}
<p style="margin:24px 0 0;color:#6b5a50;font-size:13px">${esc(note)} ${esc(SOURCE)}</p>
</div></body></html>`;
  return { sujet, texte, html };
}

/* ------------------------------------------------------------ Envoi */

/** Message MIME texte + HTML. Les corps sont en base64 : aucune ligne ne peut
 *  commencer par un point ni dépasser la longueur permise par SMTP. */
export function composerMessage({ expediteur, destinataire, sujet, texte, html }) {
  const b64 = (t) => Buffer.from(t, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  const frontiere = `rapport-${Date.now().toString(36)}`;
  return [
    `From: Site Anne Fricher <${expediteur}>`,
    `To: <${destinataire}>`,
    `Subject: =?UTF-8?B?${Buffer.from(sujet, "utf8").toString("base64")}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${frontiere}@anne-fricher.com>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${frontiere}"`,
    "",
    `--${frontiere}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(texte),
    `--${frontiere}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(html),
    `--${frontiere}--`,
    "",
  ].join("\r\n");
}

/** Envoi par le serveur SMTP de Gmail (port 465, TLS), authentifié par un
 *  mot de passe d'application Google. « connecter » sert aux essais. */
export async function envoyerParGmail({ adresse, motDePasse, destinataire, sujet, texte, html,
  connecter = () => tls.connect({ host: "smtp.gmail.com", port: 465, servername: "smtp.gmail.com" }) }) {
  const flux = connecter();
  flux.setEncoding("utf8");
  let tampon = "";
  let enAttente = null;
  const verifier = () => {
    const fin = /(^|\r\n)(\d{3}) [^\r\n]*\r\n$/.exec(tampon);
    if (!fin || !enAttente) return;
    const reponse = tampon;
    tampon = "";
    const { resoudre } = enAttente;
    enAttente = null;
    resoudre({ code: Number(fin[2]), reponse });
  };
  flux.on("data", (morceau) => { tampon += morceau; verifier(); });
  const echec = new Promise((_, rejeter) => {
    flux.on("error", rejeter);
    flux.on("close", () => rejeter(new Error("connexion SMTP fermée par Gmail")));
  });
  const attendre = (attendu) => Promise.race([echec, new Promise((resoudre) => { enAttente = { resoudre }; verifier(); })])
    .then(({ code, reponse }) => {
      if (code !== attendu) throw new Error(`Gmail a répondu ${code} au lieu de ${attendu} : ${reponse.trim().split("\r\n").pop()}`);
    });
  const dire = (ligne, attendu) => { flux.write(`${ligne}\r\n`); return attendre(attendu); };
  try {
    await attendre(220);
    await dire("EHLO anne-fricher.com", 250);
    await dire("AUTH LOGIN", 334);
    await dire(Buffer.from(adresse).toString("base64"), 334);
    await dire(Buffer.from(motDePasse.replace(/\s+/g, "")).toString("base64"), 235);
    await dire(`MAIL FROM:<${adresse}>`, 250);
    await dire(`RCPT TO:<${destinataire}>`, 250);
    await dire("DATA", 354);
    await dire(`${composerMessage({ expediteur: adresse, destinataire, sujet, texte, html })}\r\n.`, 250);
    await dire("QUIT", 221);
  } finally {
    flux.end();
  }
}

/* ------------------------------------------------------------ Lancement */

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const essai = args.includes("--essai");
  const jour = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || hierAParis();
  const env = process.env;
  const manque = ["CF_ZONE_ID", "CF_API_TOKEN", ...(essai ? [] : ["GMAIL_ADRESSE", "GMAIL_MOT_DE_PASSE"])].filter((v) => !env[v]);
  if (manque.length) {
    console.error(`Réglages manquants : ${manque.join(", ")}.`);
    process.exit(2);
  }
  try {
    const acces = { zone: env.CF_ZONE_ID, jeton: env.CF_API_TOKEN };
    const totaux = analyserRequetes(await requetesDuJour(jour, acces));
    const autre = async (j) => analyserRequetes(await requetesDuJour(j, acces));
    const [veille, semaineAvant] = await Promise.all([
      autre(decaler(jour, -1)).catch(() => null),
      autre(decaler(jour, -7)).catch(() => null),
    ]);
    const rapport = composerRapport({ jour, totaux, veille, semaineAvant, titres: titresDesPages() });
    if (essai) {
      console.log(`${rapport.sujet}\n\n${rapport.texte}`);
    } else {
      const adresse = env.GMAIL_ADRESSE.trim();
      await envoyerParGmail({ adresse, motDePasse: env.GMAIL_MOT_DE_PASSE, destinataire: (env.RAPPORT_DESTINATAIRE || adresse).trim(), ...rapport });
      console.log(`Rapport du ${jour} envoyé : ${totaux.visiteurs} visiteurs, ${totaux.pagesVues} pages vues.`);
    }
  } catch (e) {
    console.error(`rapport-frequentation : ${e.message}`);
    if (essai) await diagnostiquer({ zone: env.CF_ZONE_ID, jeton: env.CF_API_TOKEN });
    process.exit(1);
  }
}

/** En essai, si la lecture a échoué : les champs et limites que Cloudflare
 *  accorde à la zone pour les deux jeux de requêtes HTTP (nœud settings). */
async function diagnostiquer({ zone, jeton }) {
  const reglages = "enabled maxDuration maxPageSize notOlderThan availableFields";
  const r = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json", "User-Agent": "rapport-frequentation-anne-fricher" },
    body: JSON.stringify({
      query: `query($zone: string!) { viewer { zones(filter: { zoneTag: $zone }) { settings {
        httpRequestsAdaptive { ${reglages} } httpRequestsAdaptiveGroups { ${reglages} } } } } }`,
      variables: { zone },
    }),
  });
  console.log(`\nDiagnostic : ${JSON.stringify(await r.json().catch(() => ({})), null, 1)}`);
}
