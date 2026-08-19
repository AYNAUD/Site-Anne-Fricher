/* =========================================================================
   Script injecté dans l'aperçu par `admin.mjs` (uniquement avec ?apercu=1).

   Il n'est jamais présent dans les fichiers du site : il est ajouté à la
   volée, à la lecture, et ne sert qu'à relier la page à l'administration —
   survol, sélection au clic, mise en évidence du bloc choisi.
   ========================================================================= */
(function () {
  "use strict";

  var main = document.getElementById("main");
  if (!main || window.parent === window) return;

  /* ---------------------------------------------------------------- *
     Chemins de blocs — mêmes indices que côté serveur
   * ---------------------------------------------------------------- */
  function cheminDe(element) {
    var parts = [];
    var courant = element;
    while (courant && courant !== main) {
      var parent = courant.parentElement;
      if (!parent) return null;
      parts.unshift(Array.prototype.indexOf.call(parent.children, courant));
      courant = parent;
    }
    return courant === main ? parts.join(".") : null;
  }

  function elementDe(chemin) {
    if (chemin === "" || chemin === null || chemin === undefined) return main;
    var courant = main;
    var parts = String(chemin).split(".");
    for (var i = 0; i < parts.length; i++) {
      courant = courant.children[Number(parts[i])];
      if (!courant) return null;
    }
    return courant;
  }

  /* ---------------------------------------------------------------- *
     Habillage : contour de survol et contour de sélection
   * ---------------------------------------------------------------- */
  var style = document.createElement("style");
  style.textContent =
    ".admin-survol { outline: 2px dashed rgba(169,96,58,.75) !important; outline-offset: -2px !important; cursor: pointer !important; }" +
    ".admin-choisi { outline: 2px solid #a9603a !important; outline-offset: -2px !important; }" +
    ".admin-etiquette { position: absolute; z-index: 2147483647; background: #a9603a; color: #fff;" +
    " font: 500 11px/1.4 system-ui, sans-serif; padding: 2px 6px; border-radius: 3px; pointer-events: none;" +
    " transform: translateY(-100%); white-space: nowrap; }";
  document.head.appendChild(style);

  var etiquette = document.createElement("div");
  etiquette.className = "admin-etiquette";
  etiquette.hidden = true;
  document.body.appendChild(etiquette);

  var survole = null;
  var choisi = null;

  function envoyer(donnees) {
    donnees.source = "apercu";
    window.parent.postMessage(donnees, "*");
  }

  function nommer(element) {
    var balise = element.tagName.toLowerCase();
    var classe = (element.getAttribute("class") || "").split(/\s+/)[0];
    return classe ? balise + "." + classe : balise;
  }

  function placerEtiquette(element) {
    var boite = element.getBoundingClientRect();
    etiquette.textContent = nommer(element);
    etiquette.style.left = (boite.left + window.scrollX) + "px";
    etiquette.style.top = (boite.top + window.scrollY - 2) + "px";
    etiquette.hidden = false;
  }

  function survoler(element) {
    if (survole === element) return;
    if (survole) survole.classList.remove("admin-survol");
    survole = element;
    if (survole) {
      survole.classList.add("admin-survol");
      placerEtiquette(survole);
    } else {
      etiquette.hidden = true;
    }
  }

  /* Le bloc le plus petit sous le pointeur, sans descendre dans les icônes. */
  function cibleDe(element) {
    while (element && element !== main) {
      if (element.tagName === "svg" || element.closest("svg")) {
        element = element.closest("svg").parentElement;
        continue;
      }
      if (cheminDe(element) !== null) return element;
      element = element.parentElement;
    }
    return null;
  }

  document.addEventListener("mousemove", function (e) {
    var cible = cibleDe(e.target);
    survoler(cible);
  }, true);

  document.addEventListener("mouseleave", function () { survoler(null); });

  /* ---------------------------------------------------------------- *
     Clics — la page ne doit jamais quitter le mode aperçu

     Un clic hors de <main> déclenchait jusqu'ici le comportement normal du
     site : suivre un lien du menu ou du pied de page (la page atteinte n'a
     alors plus `?apercu=1`, donc plus de script de sélection : l'aperçu
     devient inéditable), ouvrir le menu mobile ou la visionneuse (leur
     panneau, en `position: fixed`, recouvre le contenu et absorbe tous les
     clics suivants). Dans les deux cas il fallait recharger.

     On intercepte donc *tous* les clics : ceux qui portent sur un bloc le
     sélectionnent, ceux qui portent sur un lien de page demandent à
     l'administration d'ouvrir cette page, les autres ne font rien.
   * ---------------------------------------------------------------- */

  /** Page du site désignée par un lien, ou null (lien externe, tel:, mailto:). */
  function pageDuLien(lien) {
    var url = urlDuLien(lien);
    if (!url) return null;
    var fichier = decodeURIComponent(url.pathname).replace(/^\//, "");
    if (fichier === "" || /\/$/.test(fichier)) fichier += "index.html";
    return /\.html$/.test(fichier) ? fichier : null;
  }

  function urlDuLien(lien) {
    var url;
    try { url = new URL(lien.href, location.href); } catch (err) { return null; }
    return url.origin === location.origin ? url : null;
  }

  /** Zone de la page où le clic est tombé, pour l'explication affichée. */
  function zoneDe(element) {
    if (!element || !element.closest) return null;
    if (element.closest(".lightbox")) return "visionneuse";
    if (element.closest("header")) return "entete";
    if (element.closest("footer")) return "pied";
    return null;
  }

  document.addEventListener("click", function (e) {
    var cible = cibleDe(e.target);
    e.preventDefault();
    e.stopPropagation();

    if (cible) {
      marquer(cible);
      envoyer({ type: "selection", chemin: cheminDe(cible) });
      return;
    }

    var lien = e.target.closest ? e.target.closest("a[href]") : null;
    if (lien) {
      var url = urlDuLien(lien);
      /* Ancre interne : on se contente de faire défiler jusqu'à la cible. */
      if (url && url.hash && url.pathname === location.pathname) {
        var ancre = document.getElementById(url.hash.slice(1));
        if (ancre) ancre.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
      }
      var page = pageDuLien(lien);
      if (page) {
        envoyer({ type: "naviguer", fichier: page });
        return;
      }
    }

    envoyer({ type: "hors-contenu", zone: zoneDe(e.target) });
  }, true);

  /* Le formulaire de contact compose un `mailto:` : il quitterait l'aperçu. */
  document.addEventListener("submit", function (e) {
    e.preventDefault();
    e.stopPropagation();
  }, true);

  function marquer(element) {
    if (choisi) choisi.classList.remove("admin-choisi");
    choisi = element;
    if (choisi) choisi.classList.add("admin-choisi");
  }

  /* ---------------------------------------------------------------- *
     Messages venant de l'administration
   * ---------------------------------------------------------------- */
  window.addEventListener("message", function (e) {
    var donnees = e.data || {};
    if (donnees.source !== "admin") return;

    if (donnees.type === "selectionner") {
      var element = elementDe(donnees.chemin);
      marquer(element);
      if (element && donnees.defiler !== false) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }

    if (donnees.type === "survoler") {
      survoler(donnees.chemin === null ? null : elementDe(donnees.chemin));
    }
  });

  /* ---------------------------------------------------------------- *
     Position de défilement conservée d'un rechargement à l'autre
   * ---------------------------------------------------------------- */
  var cle = "admin-defilement:" + location.pathname;

  try {
    var memorise = sessionStorage.getItem(cle);
    if (memorise) window.scrollTo(0, Number(memorise));
  } catch (err) { /* stockage indisponible : sans importance */ }

  window.addEventListener("scroll", function () {
    try { sessionStorage.setItem(cle, String(window.scrollY)); } catch (err) {}
  }, { passive: true });

  envoyer({ type: "pret" });
})();
