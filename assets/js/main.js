/* =========================================================================
   Atelier Anne Fricher — comportements de l'interface
   Aucune dépendance externe. Chargé avec `defer` sur toutes les pages.
   ========================================================================= */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ *
     Libellés des éléments construits en JavaScript
     La langue est lue sur <html lang="…">. Pour ajouter une langue,
     ajouter une entrée ici — voir langues.json et CLAUDE.md §14.
   * ------------------------------------------------------------------ */
  var LANGUE_DEFAUT = "fr";

  var TEXTES = {
    fr: {
      menuOuvrir:      "Ouvrir le menu",
      menuFermer:      "Fermer le menu",
      visionneuse:     "Visionneuse d'images",
      fermer:          "Fermer",
      imagePrecedente: "Image précédente",
      imageSuivante:   "Image suivante",
      courrielBonjour: "Bonjour,",
      courrielEmail:   "E-mail : ",
      courrielTel:     "Téléphone : ",
      courrielObjet:   "[Site] ",
      objetDefaut:     "Demande de renseignements",
      formEnvoi:       "Votre logiciel de messagerie va s'ouvrir avec le message prérempli. " +
                       "S'il ne s'ouvre pas, écrivez directement à "
    },
    en: {
      menuOuvrir:      "Open the menu",
      menuFermer:      "Close the menu",
      visionneuse:     "Image viewer",
      fermer:          "Close",
      imagePrecedente: "Previous image",
      imageSuivante:   "Next image",
      courrielBonjour: "Hello,",
      courrielEmail:   "Email: ",
      courrielTel:     "Telephone: ",
      courrielObjet:   "[Website] ",
      objetDefaut:     "General enquiry",
      formEnvoi:       "Your email application will open with the message ready to send. " +
                       "If nothing happens, write directly to "
    }
  };

  var langue = (document.documentElement.getAttribute("lang") || LANGUE_DEFAUT)
    .slice(0, 2).toLowerCase();

  function t(cle) {
    var table = TEXTES[langue] || TEXTES[LANGUE_DEFAUT];
    return table[cle] !== undefined ? table[cle] : TEXTES[LANGUE_DEFAUT][cle];
  }

  /* ------------------------------------------------------------------ *
     Menu mobile
   * ------------------------------------------------------------------ */
  function initNav() {
    var burger = document.querySelector(".burger");
    var nav = document.getElementById("nav");
    if (!burger || !nav) return;

    function setOpen(open) {
      burger.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
      document.body.classList.toggle("is-locked", open);
      // Sert à repasser l'en-tête en mode opaque tant que le menu est ouvert,
      // même lorsqu'il est en surimpression sur le hero.
      document.documentElement.classList.toggle("nav-open", open);
      burger.setAttribute("aria-label", open ? t("menuFermer") : t("menuOuvrir"));
    }

    burger.addEventListener("click", function () {
      setOpen(burger.getAttribute("aria-expanded") !== "true");
    });

    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && burger.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        burger.focus();
      }
    });

    // Repasse en mode bureau si la fenêtre s'élargit pendant que le menu est ouvert
    window.matchMedia("(min-width: 841px)").addEventListener("change", function (e) {
      if (e.matches) setOpen(false);
    });
  }

  /* ------------------------------------------------------------------ *
     En-tête : ombre au défilement + bascule transparent/opaque sur le hero
   * ------------------------------------------------------------------ */
  function initHeader() {
    var header = document.querySelector(".header");
    if (!header) return;

    var hero = document.querySelector(".hero");
    var overThreshold = hero ? hero.offsetHeight - header.offsetHeight - 40 : 0;
    var ticking = false;

    function update() {
      var y = window.scrollY;
      header.classList.toggle("is-stuck", y > 8);
      if (hero) header.classList.toggle("header--over", y < overThreshold);
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () {
      if (hero) overThreshold = hero.offsetHeight - header.offsetHeight - 40;
      update();
    });
    update();
  }

  /* ------------------------------------------------------------------ *
     Apparition progressive des blocs
   * ------------------------------------------------------------------ */
  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------ *
     Visionneuse d'images (lightbox)
     Chaque galerie porte `data-gallery`; ses vignettes sont des <button>
     contenant une <img> dont `data-full` pointe vers la version large.
   * ------------------------------------------------------------------ */
  function initLightbox() {
    var triggers = Array.prototype.slice.call(document.querySelectorAll(".gallery__item"));
    if (!triggers.length) return;

    var box = document.createElement("div");
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", t("visionneuse"));
    box.innerHTML =
      '<button class="lightbox__btn lightbox__btn--close" type="button" aria-label="' + t("fermer") + '">' +
      '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M1 1l16 16M17 1L1 17" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></button>' +
      '<button class="lightbox__btn lightbox__btn--prev" type="button" aria-label="' + t("imagePrecedente") + '">' +
      '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M12 1L4 9l8 8" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></button>' +
      '<button class="lightbox__btn lightbox__btn--next" type="button" aria-label="' + t("imageSuivante") + '">' +
      '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M6 1l8 8-8 8" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></button>' +
      '<figure class="lightbox__figure"><img alt=""><figcaption class="lightbox__caption"></figcaption></figure>';
    document.body.appendChild(box);

    var imgEl = box.querySelector("img");
    var capEl = box.querySelector(".lightbox__caption");
    var btnPrev = box.querySelector(".lightbox__btn--prev");
    var btnNext = box.querySelector(".lightbox__btn--next");
    var btnClose = box.querySelector(".lightbox__btn--close");

    var group = [];
    var index = 0;
    var lastFocus = null;

    function show(i) {
      index = (i + group.length) % group.length;
      var trigger = group[index];
      var thumb = trigger.querySelector("img");
      imgEl.src = thumb.getAttribute("data-full") || thumb.currentSrc || thumb.src;
      imgEl.alt = thumb.alt || "";
      var caption = trigger.getAttribute("data-caption") || thumb.alt || "";
      capEl.textContent = group.length > 1
        ? caption + (caption ? " — " : "") + (index + 1) + " / " + group.length
        : caption;
      var multiple = group.length > 1;
      btnPrev.hidden = !multiple;
      btnNext.hidden = !multiple;
    }

    function open(trigger) {
      var name = trigger.closest("[data-gallery]");
      group = name
        ? Array.prototype.slice.call(name.querySelectorAll(".gallery__item"))
        : [trigger];
      lastFocus = document.activeElement;
      box.classList.add("is-open");
      document.body.classList.add("is-locked");
      show(group.indexOf(trigger));
      btnClose.focus();
    }

    function close() {
      box.classList.remove("is-open");
      document.body.classList.remove("is-locked");
      imgEl.removeAttribute("src");
      if (lastFocus) lastFocus.focus();
    }

    triggers.forEach(function (t) {
      t.addEventListener("click", function () { open(t); });
    });

    btnClose.addEventListener("click", close);
    btnPrev.addEventListener("click", function () { show(index - 1); });
    btnNext.addEventListener("click", function () { show(index + 1); });

    box.addEventListener("click", function (e) {
      if (e.target === box || e.target.tagName === "FIGURE") close();
    });

    document.addEventListener("keydown", function (e) {
      if (!box.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") show(index - 1);
      else if (e.key === "ArrowRight") show(index + 1);
      else if (e.key === "Tab") {
        // Piège de focus : on garde la tabulation dans la visionneuse
        var focusables = [btnClose, btnPrev, btnNext].filter(function (b) { return !b.hidden; });
        var pos = focusables.indexOf(document.activeElement);
        e.preventDefault();
        var next = e.shiftKey ? pos - 1 : pos + 1;
        focusables[(next + focusables.length) % focusables.length].focus();
      }
    });

    // Balayage tactile
    var startX = null;
    box.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 55) show(dx > 0 ? index - 1 : index + 1);
      startX = null;
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ *
     Formulaire de contact
     Le site est statique : par défaut le formulaire compose un e-mail
     via `mailto:`. Pour un envoi automatique, renseigner un service
     (Formspree, Netlify Forms…) — voir CLAUDE.md.
   * ------------------------------------------------------------------ */
  function initForm() {
    var form = document.getElementById("contact-form");
    if (!form) return;

    var status = form.querySelector(".form__status");

    function say(message, tone) {
      if (!status) return;
      status.textContent = message;
      status.setAttribute("data-tone", tone);
      status.classList.add("is-visible");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (!form.reportValidity()) return;

      // Pot de miel anti-robots
      if (form.elements.website && form.elements.website.value) return;

      var data = new FormData(form);
      var prenom = (data.get("prenom") || "").trim();
      var nom = (data.get("nom") || "").trim();
      var email = (data.get("email") || "").trim();
      var tel = (data.get("telephone") || "").trim();
      var objet = (data.get("objet") || t("objetDefaut")).trim();
      var message = (data.get("message") || "").trim();

      var corps = [
        t("courrielBonjour"),
        "",
        message,
        "",
        "—",
        prenom + " " + nom,
        email ? t("courrielEmail") + email : "",
        tel ? t("courrielTel") + tel : ""
      ].filter(Boolean).join("\n");

      var href = "mailto:" + form.dataset.mailto +
        "?subject=" + encodeURIComponent(t("courrielObjet") + objet) +
        "&body=" + encodeURIComponent(corps);

      window.location.href = href;
      say(t("formEnvoi") + form.dataset.mailto + ".", "ok");
    });
  }

  /* ------------------------------------------------------------------ *
     Année courante dans le pied de page
   * ------------------------------------------------------------------ */
  function initYear() {
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* ------------------------------------------------------------------ *
     Démarrage
   * ------------------------------------------------------------------ */
  function boot() {
    initNav();
    initHeader();
    initReveal();
    initLightbox();
    initForm();
    initYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
