/* =========================================================================
   Interface d'administration — logique du navigateur.
   Aucune dépendance, un seul fichier, dans l'esprit de `assets/js/main.js`.
   ========================================================================= */
(function () {
  "use strict";

  var etat = {
    pages: [],
    modelesPage: [],
    modeles: [],
    medias: null,
    fichier: null,
    arbre: null,
    selection: null,
    ouverts: {},
    apercuPret: false
  };

  /* ---------------------------------------------------------------- *
     Petits outils
   * ---------------------------------------------------------------- */
  function $(selecteur) { return document.querySelector(selecteur); }

  function creer(balise, options, enfants) {
    var noeud = document.createElement(balise);
    options = options || {};
    Object.keys(options).forEach(function (cle) {
      if (cle === "classe") noeud.className = options[cle];
      else if (cle === "texte") noeud.textContent = options[cle];
      else if (cle === "html") noeud.innerHTML = options[cle];
      else if (cle.indexOf("on") === 0) noeud.addEventListener(cle.slice(2), options[cle]);
      else if (options[cle] !== null && options[cle] !== undefined) noeud.setAttribute(cle, options[cle]);
    });
    (enfants || []).forEach(function (enfant) {
      if (enfant) noeud.appendChild(typeof enfant === "string" ? document.createTextNode(enfant) : enfant);
    });
    return noeud;
  }

  var minuteurMessage;
  function message(texte, ton) {
    var boite = $("#message");
    boite.textContent = texte;
    boite.setAttribute("data-ton", ton || "info");
    boite.classList.add("est-visible");
    clearTimeout(minuteurMessage);
    minuteurMessage = setTimeout(function () {
      boite.classList.remove("est-visible");
    }, ton === "erreur" ? 6000 : 2600);
  }

  function api(chemin, donnees) {
    var options = donnees
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(donnees) }
      : undefined;
    return fetch("/api/" + chemin, options).then(function (reponse) {
      return reponse.json().then(function (corps) {
        if (!reponse.ok) throw new Error(corps.erreur || "Erreur inattendue.");
        return corps;
      });
    });
  }

  function octets(valeur) {
    if (!valeur) return "";
    return valeur > 1024 * 1024
      ? (valeur / 1024 / 1024).toFixed(1) + " Mo"
      : Math.round(valeur / 1024) + " ko";
  }

  /* ---------------------------------------------------------------- *
     Fenêtres modales
   * ---------------------------------------------------------------- */
  function ouvrirFenetre(options) {
    var fenetre = $("#fenetre");
    var corps = $("#fenetre-corps");
    $("#fenetre-titre").textContent = options.titre;
    corps.innerHTML = "";
    corps.appendChild(options.contenu);

    var valider = $("#fenetre-valider");
    var annuler = $("#fenetre-annuler");
    valider.textContent = options.libelleValider || "Valider";
    valider.hidden = options.sansValidation === true;
    annuler.textContent = options.libelleAnnuler || "Annuler";

    return new Promise(function (resoudre) {
      function fermer(valeur) {
        valider.removeEventListener("click", surValider);
        annuler.removeEventListener("click", surAnnuler);
        fenetre.removeEventListener("close", surAnnuler);
        fenetre.close();
        resoudre(valeur);
      }
      function surAnnuler() { fermer(null); }
      function surValider() {
        Promise.resolve()
          .then(function () { return options.surValider ? options.surValider() : true; })
          .then(function (valeur) { if (valeur !== false && valeur !== undefined) fermer(valeur); })
          .catch(function (err) { message(err.message, "erreur"); });
      }

      valider.addEventListener("click", surValider);
      annuler.addEventListener("click", surAnnuler);
      fenetre.addEventListener("close", surAnnuler);
      fenetre.showModal();
      var premier = corps.querySelector("input, textarea, select, button");
      if (premier) premier.focus();
    });
  }

  function confirmer(titre, texte, libelle) {
    return ouvrirFenetre({
      titre: titre,
      contenu: creer("p", { texte: texte, classe: "inspecteur__note" }),
      libelleValider: libelle || "Confirmer",
      surValider: function () { return true; }
    }).then(function (valeur) { return valeur === true; });
  }

  /* ---------------------------------------------------------------- *
     Champs de saisie
   * ---------------------------------------------------------------- */
  function creerChamp(champ, valeurInitiale) {
    var valeur = valeurInitiale === undefined ? champ.valeur : valeurInitiale;
    var conteneur = creer("div", { classe: "champ" });
    var identifiant = "champ-" + champ.nom + "-" + Math.random().toString(36).slice(2, 7);
    var saisie;
    var lire;

    if (champ.type === "case") {
      conteneur.className = "champ champ--case";
      saisie = creer("input", { type: "checkbox", id: identifiant });
      saisie.checked = !!valeur;
      conteneur.appendChild(saisie);
      conteneur.appendChild(creer("label", { for: identifiant, texte: champ.libelle }));
      lire = function () { return saisie.checked; };
      return { element: conteneur, lire: lire, nom: champ.nom };
    }

    conteneur.appendChild(creer("label", { for: identifiant, texte: champ.libelle }));

    if (champ.type === "choix") {
      saisie = creer("select", { id: identifiant });
      (champ.options || []).forEach(function (option) {
        saisie.appendChild(creer("option", { value: option[0], texte: option[1] }));
      });
      saisie.value = valeur || (champ.options && champ.options[0][0]);
      lire = function () { return saisie.value; };
      conteneur.appendChild(saisie);

    } else if (champ.type === "image") {
      var chemin = typeof valeur === "string" ? valeur : (valeur && valeur.chemin) || "";
      var apercu = creer("img", { alt: "", src: chemin ? "/" + chemin : "" });
      var nom = creer("div", { classe: "vignette-champ__nom", texte: chemin || "Aucune image" });
      var infos = creer("div", { classe: "vignette-champ__infos" }, [nom]);
      var bouton = creer("button", {
        type: "button", classe: "bouton bouton--petit", texte: chemin ? "Changer" : "Choisir",
        onclick: function () {
          ouvrirMediatheque({ multiple: false }).then(function (choix) {
            if (!choix || !choix.length) return;
            chemin = choix[0].chemin;
            apercu.src = "/" + chemin;
            nom.textContent = chemin;
            bouton.textContent = "Changer";
          });
        }
      });
      conteneur.appendChild(creer("div", { classe: "vignette-champ" }, [apercu, infos, bouton]));
      lire = function () { return chemin; };

    } else if (champ.type === "images") {
      var choisies = Array.isArray(valeur) ? valeur.slice() : [];
      var liste = creer("div", { classe: "liste-images" });

      function dessinerListe() {
        liste.innerHTML = "";
        choisies.forEach(function (image, index) {
          var legende = creer("input", { type: "text", value: image.legende || "", placeholder: "Légende" });
          legende.addEventListener("input", function () { image.legende = legende.value; });
          liste.appendChild(creer("div", { classe: "vignette-champ" }, [
            creer("img", { src: "/" + image.chemin, alt: "" }),
            creer("div", { classe: "vignette-champ__infos" }, [
              creer("div", { classe: "vignette-champ__nom", texte: image.chemin.split("/").pop() }),
              legende
            ]),
            creer("button", {
              type: "button", classe: "outil", texte: "↑", title: "Monter",
              onclick: function () {
                if (!index) return;
                choisies.splice(index - 1, 0, choisies.splice(index, 1)[0]);
                dessinerListe();
              }
            }),
            creer("button", {
              type: "button", classe: "outil", texte: "↓", title: "Descendre",
              onclick: function () {
                if (index >= choisies.length - 1) return;
                choisies.splice(index + 1, 0, choisies.splice(index, 1)[0]);
                dessinerListe();
              }
            }),
            creer("button", {
              type: "button", classe: "outil outil--danger", texte: "✕", title: "Retirer",
              onclick: function () { choisies.splice(index, 1); dessinerListe(); }
            })
          ]));
        });
        if (!choisies.length) {
          liste.appendChild(creer("p", { classe: "champ__aide", texte: "Aucune image pour l'instant." }));
        }
      }

      dessinerListe();
      conteneur.appendChild(liste);
      conteneur.appendChild(creer("div", { classe: "groupe" }, [
        creer("button", {
          type: "button", classe: "bouton bouton--petit", texte: "+ Ajouter des images",
          onclick: function () {
            ouvrirMediatheque({ multiple: true }).then(function (choix) {
              if (!choix) return;
              choix.forEach(function (media) { choisies.push({ chemin: media.chemin, legende: "" }); });
              dessinerListe();
            });
          }
        })
      ]));
      lire = function () { return choisies; };

    } else if (champ.type === "long" || champ.type === "riche") {
      saisie = creer("textarea", { id: identifiant, rows: champ.type === "long" ? 6 : 3 });
      saisie.value = deshtmliser(valeur || "");
      lire = function () { return saisie.value.trim(); };
      conteneur.appendChild(saisie);

    } else {
      saisie = creer("input", { type: champ.type === "url" ? "text" : "text", id: identifiant });
      saisie.value = deshtmliser(valeur || "");
      lire = function () { return saisie.value.trim(); };
      conteneur.appendChild(saisie);
    }

    if (champ.aide) conteneur.appendChild(creer("p", { classe: "champ__aide", texte: champ.aide }));
    return { element: conteneur, lire: lire, nom: champ.nom };
  }

  /* Le serveur renvoie le balisage source ; on l'allège à la saisie.
     Les entités sont décodées et les espaces insécables redeviennent des
     espaces ordinaires : le serveur les rétablira à l'enregistrement. */
  var decodeur = document.createElement("textarea");
  function deshtmliser(valeur) {
    decodeur.innerHTML = String(valeur);
    return decodeur.value
      .replace(/ /g, " ")
      .replace(/\s*\n\s*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function construireChamps(champs, conteneur, valeurs) {
    var controles = [];
    champs.forEach(function (champ) {
      var controle = creerChamp(champ, valeurs ? valeurs[champ.nom] : undefined);
      conteneur.appendChild(controle.element);
      controles.push(controle);
    });
    return {
      lire: function () {
        var sortie = {};
        controles.forEach(function (c) { sortie[c.nom] = c.lire(); });
        return sortie;
      }
    };
  }

  /* ---------------------------------------------------------------- *
     Médiathèque
   * ---------------------------------------------------------------- */
  function chargerMedias(force) {
    if (etat.medias && !force) return Promise.resolve(etat.medias);
    return api("medias").then(function (reponse) {
      etat.medias = reponse.medias;
      return etat.medias;
    });
  }

  function ouvrirMediatheque(options) {
    options = options || {};
    var selection = [];
    var contenu = creer("div");
    var grille = creer("div", { classe: "medias" });
    var recherche = creer("input", { type: "search", placeholder: "Rechercher une image…" });

    var dossier = creer("select");
    var champFichier = creer("input", { type: "file", accept: "image/*", multiple: "multiple" });
    champFichier.style.display = "none";

    function dessiner() {
      var filtre = recherche.value.trim().toLowerCase();
      grille.innerHTML = "";
      (etat.medias || [])
        .filter(function (media) { return !filtre || media.chemin.toLowerCase().indexOf(filtre) !== -1; })
        .forEach(function (media) {
          var carte = creer("button", { type: "button", classe: "media" }, [
            creer("img", { src: "/" + media.chemin, alt: "", loading: "lazy" }),
            creer("span", { texte: media.nom }),
            creer("span", {
              texte: (media.largeur ? media.largeur + "×" + media.hauteur + " · " : "") + octets(media.octets)
            })
          ]);
          if (selection.indexOf(media) !== -1) carte.classList.add("est-actif");
          carte.addEventListener("click", function () {
            if (options.multiple) {
              var position = selection.indexOf(media);
              if (position === -1) selection.push(media); else selection.splice(position, 1);
            } else {
              selection = [media];
            }
            dessiner();
          });
          grille.appendChild(carte);
        });

      if (!grille.children.length) {
        grille.appendChild(creer("p", { classe: "champ__aide", texte: "Aucune image ne correspond." }));
      }
    }

    function remplirDossiers() {
      var dossiers = {};
      (etat.medias || []).forEach(function (media) { dossiers[media.dossier] = true; });
      dossier.innerHTML = "";
      Object.keys(dossiers).sort().forEach(function (nom) {
        dossier.appendChild(creer("option", { value: nom.replace(/^assets\/img\/?/, ""), texte: nom }));
      });
    }

    champFichier.addEventListener("change", function () {
      var fichiers = Array.prototype.slice.call(champFichier.files);
      if (!fichiers.length) return;
      message("Envoi de " + fichiers.length + " image(s)…");

      fichiers.reduce(function (chaine, fichier) {
        return chaine.then(function () {
          return new Promise(function (resoudre, rejeter) {
            var lecteur = new FileReader();
            lecteur.onload = function () {
              api("media/envoyer", {
                nom: fichier.name,
                dossier: dossier.value,
                donnees: String(lecteur.result)
              }).then(resoudre, rejeter);
            };
            lecteur.onerror = function () { rejeter(new Error("Lecture impossible : " + fichier.name)); };
            lecteur.readAsDataURL(fichier);
          });
        });
      }, Promise.resolve())
        .then(function () { return chargerMedias(true); })
        .then(function () {
          remplirDossiers();
          dessiner();
          message("Images envoyées.", "ok");
        })
        .catch(function (err) { message(err.message, "erreur"); });

      champFichier.value = "";
    });

    recherche.addEventListener("input", dessiner);

    contenu.appendChild(creer("div", { classe: "medias__barre" }, [
      recherche,
      creer("label", { classe: "bouton bouton--petit", texte: "Dossier :" }),
      dossier,
      creer("button", {
        type: "button", classe: "bouton bouton--petit", texte: "Envoyer une image",
        onclick: function () { champFichier.click(); }
      }),
      champFichier
    ]));
    contenu.appendChild(grille);

    return chargerMedias().then(function () {
      remplirDossiers();
      dessiner();
      return ouvrirFenetre({
        titre: options.multiple ? "Choisir des images" : "Choisir une image",
        contenu: contenu,
        libelleValider: options.parcourir ? "Fermer" : "Utiliser",
        surValider: function () {
          if (options.parcourir) return [];
          if (!selection.length) throw new Error("Sélectionnez une image.");
          return selection.slice();
        }
      });
    });
  }

  /* ---------------------------------------------------------------- *
     Arborescence
   * ---------------------------------------------------------------- */
  function trouverBloc(chemin, blocs) {
    blocs = blocs || (etat.arbre ? etat.arbre.blocs : []);
    for (var i = 0; i < blocs.length; i++) {
      if (blocs[i].chemin === chemin) return blocs[i];
      var trouve = trouverBloc(chemin, blocs[i].enfants);
      if (trouve) return trouve;
    }
    return null;
  }

  function cheminParent(chemin) {
    var parts = String(chemin).split(".");
    parts.pop();
    return parts.join(".");
  }

  function indexDe(chemin) {
    var parts = String(chemin).split(".");
    return Number(parts[parts.length - 1]);
  }

  function rendreArbre() {
    var arbre = $("#arbre");
    arbre.innerHTML = "";

    if (!etat.arbre || !etat.arbre.blocs.length) {
      arbre.appendChild(creer("p", {
        classe: "arbre__vide",
        texte: "Cette page ne contient encore aucun bloc. Utilisez « + Section »."
      }));
      return;
    }

    etat.arbre.blocs.forEach(function (bloc) { arbre.appendChild(rendreNoeud(bloc, 0)); });
  }

  function rendreNoeud(bloc, profondeur) {
    var ouvert = etat.ouverts[bloc.chemin];
    if (ouvert === undefined) ouvert = profondeur < 1;

    var pivot = creer("button", {
      type: "button", classe: "noeud__pivot", texte: ouvert ? "▾" : "▸",
      "aria-label": ouvert ? "Replier" : "Déplier",
      onclick: function (e) {
        e.stopPropagation();
        etat.ouverts[bloc.chemin] = !ouvert;
        rendreArbre();
      }
    });
    if (!bloc.enfants.length) pivot.hidden = true;

    var ligne = creer("div", {
      classe: "noeud__ligne" + (etat.selection === bloc.chemin ? " est-selectionne" : ""),
      role: "treeitem",
      onclick: function () { selectionner(bloc.chemin); },
      onmouseenter: function () { versApercu({ type: "survoler", chemin: bloc.chemin }); },
      onmouseleave: function () { versApercu({ type: "survoler", chemin: null }); }
    }, [
      pivot,
      creer("div", { classe: "noeud__texte" }, [
        creer("span", { classe: "noeud__nom", texte: bloc.etiquette }),
        bloc.apercu ? creer("span", { classe: "noeud__apercu", texte: bloc.apercu }) : null
      ]),
      creer("div", { classe: "noeud__outils" }, [
        creer("button", {
          type: "button", classe: "outil", texte: "＋",
          title: bloc.contexte ? "Ajouter un bloc à l'intérieur" : "Ajouter un bloc après celui-ci",
          onclick: function (e) { e.stopPropagation(); ajouterAupresDe(bloc); }
        }),
        creer("button", {
          type: "button", classe: "outil", texte: "↑", title: "Monter",
          onclick: function (e) { e.stopPropagation(); deplacer(bloc.chemin, -1); }
        }),
        creer("button", {
          type: "button", classe: "outil", texte: "↓", title: "Descendre",
          onclick: function (e) { e.stopPropagation(); deplacer(bloc.chemin, 1); }
        }),
        creer("button", {
          type: "button", classe: "outil", texte: "⧉", title: "Dupliquer",
          onclick: function (e) { e.stopPropagation(); dupliquer(bloc.chemin); }
        }),
        creer("button", {
          type: "button", classe: "outil outil--danger", texte: "✕", title: "Supprimer",
          onclick: function (e) { e.stopPropagation(); supprimer(bloc); }
        })
      ])
    ]);

    var enfants = creer("div", { classe: "noeud__enfants" });
    if (!ouvert) enfants.hidden = true;
    bloc.enfants.forEach(function (enfant) { enfants.appendChild(rendreNoeud(enfant, profondeur + 1)); });

    return creer("div", { classe: "noeud" }, [ligne, bloc.enfants.length ? enfants : null]);
  }

  /* ---------------------------------------------------------------- *
     Inspecteur
   * ---------------------------------------------------------------- */
  function rendreInspecteur() {
    var panneau = $("#inspecteur");
    panneau.innerHTML = "";

    var bloc = etat.selection ? trouverBloc(etat.selection) : null;
    if (!bloc) {
      $("#inspecteur-titre").textContent = "Réglages de la page";
      panneau.appendChild(reglagesDePage());
      return;
    }

    $("#inspecteur-titre").textContent = bloc.etiquette;
    panneau.appendChild(creer("span", { classe: "etiquette-type", texte: bloc.balise + (bloc.classe ? " · " + bloc.classe : "") }));

    if (!bloc.champs.length) {
      panneau.appendChild(creer("p", {
        classe: "inspecteur__note",
        texte: bloc.contexte
          ? "Ce bloc est un conteneur : sélectionnez un élément à l'intérieur pour le modifier, ou ajoutez-en un."
          : "Ce bloc n'a pas de texte modifiable directement."
      }));
    }

    var formulaire = creer("div");
    panneau.appendChild(formulaire);
    var champs = construireChamps(bloc.champs, formulaire, valeursDe(bloc));

    var actions = creer("div", { classe: "inspecteur__actions" });

    if (bloc.champs.length) {
      actions.appendChild(creer("button", {
        type: "button", classe: "bouton bouton--primaire", texte: "Enregistrer",
        onclick: function () { enregistrerBloc(bloc, champs.lire()); }
      }));
    }

    if (bloc.contexte) {
      actions.appendChild(creer("button", {
        type: "button", classe: "bouton", texte: "＋ Ajouter à l'intérieur",
        onclick: function () { ajouterAupresDe(bloc); }
      }));
    }

    actions.appendChild(creer("button", {
      type: "button", classe: "bouton", texte: "↑ Monter",
      onclick: function () { deplacer(bloc.chemin, -1); }
    }));
    actions.appendChild(creer("button", {
      type: "button", classe: "bouton", texte: "↓ Descendre",
      onclick: function () { deplacer(bloc.chemin, 1); }
    }));
    actions.appendChild(creer("button", {
      type: "button", classe: "bouton", texte: "⧉ Dupliquer",
      onclick: function () { dupliquer(bloc.chemin); }
    }));
    actions.appendChild(creer("button", {
      type: "button", classe: "bouton bouton--danger", texte: "✕ Supprimer",
      onclick: function () { supprimer(bloc); }
    }));

    panneau.appendChild(actions);
  }

  function valeursDe(bloc) {
    var valeurs = {};
    bloc.champs.forEach(function (champ) { valeurs[champ.nom] = champ.valeur; });
    return valeurs;
  }

  function reglagesDePage() {
    var page = etat.pages.filter(function (p) { return p.fichier === etat.fichier; })[0] || {};
    var meta = (etat.arbre && etat.arbre.meta) || {};
    var conteneur = creer("div");

    conteneur.appendChild(creer("p", {
      classe: "inspecteur__note",
      texte: "Cliquez sur un bloc dans l'aperçu ou dans la colonne de gauche pour le modifier. " +
             "Chaque action est écrite immédiatement dans " + etat.fichier + " et reste annulable."
    }));

    var bloc = creer("div", { classe: "section-reglages" }, [creer("h3", { texte: "Référencement" })]);
    var champs = construireChamps([
      { nom: "titre", libelle: "Titre de l'onglet", type: "ligne", valeur: meta.titre },
      {
        nom: "description", libelle: "Description", type: "long", valeur: meta.description,
        aide: "Phrase affichée dans les résultats de recherche (150 à 160 caractères)."
      }
    ], bloc);
    conteneur.appendChild(bloc);

    conteneur.appendChild(creer("div", { classe: "inspecteur__actions" }, [
      creer("button", {
        type: "button", classe: "bouton bouton--primaire", texte: "Enregistrer",
        onclick: function () {
          var valeurs = champs.lire();
          valeurs.fichier = etat.fichier;
          api("page/meta", valeurs).then(function (reponse) {
            appliquerEtat(reponse);
            message("Référencement enregistré.", "ok");
          }).catch(function (err) { message(err.message, "erreur"); });
        }
      })
    ]));

    var menu = creer("div", { classe: "section-reglages" }, [creer("h3", { texte: "Menu du site" })]);
    var caseMenu = creer("input", { type: "checkbox", id: "case-menu" });
    caseMenu.checked = !!page.dansLeMenu;
    caseMenu.addEventListener("change", function () {
      var present = caseMenu.checked;
      api("page/menu", {
        fichier: etat.fichier,
        libelle: page.titre || etat.fichier,
        present: present
      }).then(function (reponse) {
        etat.pages = reponse.pages;
        message(present
          ? "Page ajoutée au menu de " + reponse.touchees.length + " fichiers."
          : "Page retirée du menu.", "ok");
        rendreListePages();
        rechargerApercu();
      }).catch(function (err) {
        caseMenu.checked = !present;
        message(err.message, "erreur");
      });
    });
    menu.appendChild(creer("div", { classe: "champ champ--case" }, [
      caseMenu,
      creer("label", { for: "case-menu", texte: "Afficher cette page dans le menu et le plan du site" })
    ]));
    conteneur.appendChild(menu);

    conteneur.appendChild(creer("div", { classe: "section-reglages" }, [
      creer("h3", { texte: "Historique" }),
      creer("button", {
        type: "button", classe: "bouton", texte: "Voir les dernières modifications",
        onclick: montrerHistorique
      })
    ]));

    return conteneur;
  }

  /* ---------------------------------------------------------------- *
     Actions sur les blocs
   * ---------------------------------------------------------------- */
  function appliquerEtat(reponse) {
    if (reponse.fichier && reponse.fichier !== etat.fichier) return;
    etat.arbre = { meta: reponse.meta, blocs: reponse.blocs, contexteRacine: reponse.contexteRacine };
    rendreArbre();
    rendreInspecteur();
    rechargerApercu();
  }

  function enregistrerBloc(bloc, valeurs) {
    api("bloc/modifier", { fichier: etat.fichier, chemin: bloc.chemin, valeurs: valeurs })
      .then(function (reponse) {
        appliquerEtat(reponse);
        message("Modification enregistrée.", "ok");
      })
      .catch(function (err) { message(err.message, "erreur"); });
  }

  function deplacer(chemin, sens) {
    api("bloc/deplacer", { fichier: etat.fichier, chemin: chemin, sens: sens })
      .then(function (reponse) {
        var parts = String(chemin).split(".");
        parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + sens);
        etat.selection = parts.join(".");
        appliquerEtat(reponse);
        message(sens < 0 ? "Bloc monté." : "Bloc descendu.", "ok");
      })
      .catch(function (err) { message(err.message, "erreur"); });
  }

  function dupliquer(chemin) {
    api("bloc/dupliquer", { fichier: etat.fichier, chemin: chemin })
      .then(function (reponse) {
        appliquerEtat(reponse);
        message("Bloc dupliqué.", "ok");
      })
      .catch(function (err) { message(err.message, "erreur"); });
  }

  function supprimer(bloc) {
    confirmer(
      "Supprimer ce bloc ?",
      "« " + bloc.etiquette + (bloc.apercu ? " — " + bloc.apercu : "") + " » sera retiré de la page. " +
      "L'action reste annulable depuis la barre du haut.",
      "Supprimer"
    ).then(function (accord) {
      if (!accord) return;
      return api("bloc/supprimer", { fichier: etat.fichier, chemin: bloc.chemin })
        .then(function (reponse) {
          etat.selection = cheminParent(bloc.chemin) || null;
          appliquerEtat(reponse);
          message("Bloc supprimé.", "ok");
        });
    }).catch(function (err) { message(err.message, "erreur"); });
  }

  /* Emplacement d'insertion : dans un conteneur, après un bloc simple. */
  function ajouterAupresDe(bloc) {
    if (bloc && bloc.contexte) {
      ouvrirAjout(bloc.chemin, bloc.enfants.length, bloc.contexte, "à la fin de « " + bloc.etiquette + " »");
      return;
    }
    var parent = bloc ? trouverBloc(cheminParent(bloc.chemin)) : null;
    var contexte = parent ? parent.contexte : "page";
    ouvrirAjout(
      bloc ? cheminParent(bloc.chemin) : "",
      bloc ? indexDe(bloc.chemin) + 1 : (etat.arbre ? etat.arbre.blocs.length : 0),
      contexte,
      bloc ? "juste après « " + bloc.etiquette + " »" : "à la fin de la page"
    );
  }

  function ouvrirAjout(cheminDuParent, position, contexte, emplacement) {
    var disponibles = etat.modeles.filter(function (m) { return m.contextes.indexOf(contexte) !== -1; });
    if (!disponibles.length) {
      message("Aucun type de bloc ne peut être ajouté ici.", "erreur");
      return;
    }

    var contenu = creer("div");
    contenu.appendChild(creer("p", { classe: "inspecteur__note", texte: "Le bloc sera inséré " + emplacement + "." }));

    var grille = creer("div", { classe: "modeles" });
    var formulaire = creer("div");
    var choix = null;
    var champs = null;

    disponibles.forEach(function (modele) {
      var carte = creer("button", { type: "button", classe: "modele" }, [
        creer("strong", { texte: modele.nom }),
        creer("span", { texte: modele.description })
      ]);
      carte.addEventListener("click", function () {
        choix = modele;
        Array.prototype.forEach.call(grille.children, function (c) { c.classList.remove("est-actif"); });
        carte.classList.add("est-actif");
        formulaire.innerHTML = "";
        champs = construireChamps(modele.champs, formulaire);
      });
      grille.appendChild(carte);
    });

    contenu.appendChild(grille);
    contenu.appendChild(creer("hr"));
    contenu.appendChild(formulaire);

    ouvrirFenetre({
      titre: "Ajouter un bloc",
      contenu: contenu,
      libelleValider: "Ajouter",
      surValider: function () {
        if (!choix) throw new Error("Choisissez un type de bloc.");
        var valeurs = champs.lire();
        var manquant = choix.champs.filter(function (c) {
          return c.requis && !valeurs[c.nom] || (c.requis && Array.isArray(valeurs[c.nom]) && !valeurs[c.nom].length);
        })[0];
        if (manquant) throw new Error("Le champ « " + manquant.libelle + " » est obligatoire.");

        return api("bloc/ajouter", {
          fichier: etat.fichier,
          cheminParent: cheminDuParent,
          position: position,
          modele: choix.cle,
          valeurs: valeurs
        }).then(function (reponse) {
          etat.selection = (cheminDuParent ? cheminDuParent + "." : "") + position;
          etat.ouverts[cheminDuParent] = true;
          appliquerEtat(reponse);
          message("Bloc ajouté.", "ok");
          return true;
        });
      }
    });
  }

  /* ---------------------------------------------------------------- *
     Pages
   * ---------------------------------------------------------------- */
  function rendreListePages() {
    var choix = $("#choix-page");
    choix.innerHTML = "";
    etat.pages.forEach(function (page) {
      choix.appendChild(creer("option", {
        value: page.fichier,
        texte: page.titre + " (" + page.fichier + ")"
      }));
    });
    if (etat.fichier) choix.value = etat.fichier;
  }

  function ouvrirPage(fichier) {
    return api("page?fichier=" + encodeURIComponent(fichier)).then(function (reponse) {
      etat.fichier = fichier;
      etat.selection = null;
      etat.ouverts = {};
      etat.arbre = { meta: reponse.meta, blocs: reponse.blocs, contexteRacine: reponse.contexteRacine };
      $("#choix-page").value = fichier;
      $("#lien-site").href = "/" + fichier;
      rendreArbre();
      rendreInspecteur();
      chargerApercu();
    });
  }

  function nouvellePage() {
    var contenu = creer("div");
    var modeles = etat.modelesPage.map(function (m) { return [m.cle, m.nom + " — " + m.description]; });

    var champs = construireChamps([
      { nom: "titre", libelle: "Titre de la page", type: "ligne", valeur: "", requis: true },
      {
        nom: "fichier", libelle: "Nom du fichier (facultatif)", type: "ligne", valeur: "",
        aide: "Déduit du titre si laissé vide, par exemple « nos-tissus » donnera nos-tissus.html."
      },
      { nom: "chapo", libelle: "Chapô d'introduction", type: "long", valeur: "" },
      {
        nom: "description", libelle: "Description pour les moteurs de recherche", type: "long", valeur: "",
        aide: "Laissée vide, une description par défaut est écrite ; à relire avant mise en ligne."
      },
      { nom: "modele", libelle: "Modèle", type: "choix", valeur: "simple", options: modeles },
      { nom: "menu", libelle: "Ajouter la page au menu de toutes les pages", type: "case", valeur: true }
    ], contenu);

    ouvrirFenetre({
      titre: "Nouvelle page",
      contenu: contenu,
      libelleValider: "Créer la page",
      surValider: function () {
        var valeurs = champs.lire();
        if (!valeurs.titre) throw new Error("Le titre est obligatoire.");
        return api("page/creer", valeurs).then(function (reponse) {
          etat.pages = reponse.pages;
          rendreListePages();
          message("Page " + reponse.fichier + " créée.", "ok");
          return ouvrirPage(reponse.fichier).then(function () { return true; });
        });
      }
    });
  }

  function montrerHistorique() {
    api("historique").then(function (reponse) {
      var liste = creer("ul", { classe: "journal" });
      reponse.historique.slice(0, 25).forEach(function (entree) {
        liste.appendChild(creer("li", {}, [
          creer("span", { texte: entree.libelle }),
          creer("time", { texte: new Date(entree.date).toLocaleString("fr-FR") + " · " + entree.fichiers.join(", ") })
        ]));
      });
      if (!reponse.historique.length) {
        liste.appendChild(creer("li", { texte: "Aucune modification enregistrée pour l'instant." }));
      }
      ouvrirFenetre({
        titre: "Dernières modifications",
        contenu: liste,
        sansValidation: true,
        libelleAnnuler: "Fermer"
      });
    }).catch(function (err) { message(err.message, "erreur"); });
  }

  function annulerDerniere() {
    confirmer(
      "Annuler la dernière action ?",
      "Les fichiers touchés par la dernière action seront remis dans leur état précédent.",
      "Annuler l'action"
    ).then(function (accord) {
      if (!accord) return;
      return api("annuler", {}).then(function (reponse) {
        etat.pages = reponse.pages;
        rendreListePages();
        message("Annulé : " + reponse.annule, "ok");
        return ouvrirPage(etat.fichier).catch(function () {
          return ouvrirPage(etat.pages[0].fichier);
        });
      });
    }).catch(function (err) { message(err.message, "erreur"); });
  }

  /* ---------------------------------------------------------------- *
     Aperçu
   * ---------------------------------------------------------------- */
  function chargerApercu() {
    etat.apercuPret = false;
    $("#apercu").src = "/" + etat.fichier + "?apercu=1&t=" + Date.now();
  }

  function rechargerApercu() { chargerApercu(); }

  function versApercu(donnees) {
    var cadre = $("#apercu");
    if (!cadre.contentWindow || !etat.apercuPret) return;
    donnees.source = "admin";
    cadre.contentWindow.postMessage(donnees, "*");
  }

  function selectionner(chemin, depuisApercu) {
    etat.selection = chemin;
    rendreArbre();
    rendreInspecteur();
    if (!depuisApercu) versApercu({ type: "selectionner", chemin: chemin });
  }

  function estUnePage(fichier) {
    return etat.pages.filter(function (p) { return p.fichier === fichier; }).length > 0;
  }

  /** Un lien suivi dans l'aperçu ouvre la page correspondante dans l'éditeur. */
  function ouvrirDepuisApercu(fichier) {
    if (fichier === etat.fichier) { rechargerApercu(); return; }
    if (!estUnePage(fichier)) {
      message("La page " + fichier + " ne fait pas partie des pages modifiables.", "erreur");
      rechargerApercu();
      return;
    }
    ouvrirPage(fichier)
      .then(function () { message("Page « " + fichier + " » ouverte.", "ok"); })
      .catch(function (err) { message(err.message, "erreur"); });
  }

  var EXPLICATIONS = {
    entete: "L'en-tête est commun à toutes les pages : il se modifie dans les fichiers.",
    pied: "Le pied de page est commun à toutes les pages : il se modifie dans les fichiers.",
    visionneuse: "La visionneuse d'images n'est pas modifiable depuis l'aperçu."
  };

  window.addEventListener("message", function (e) {
    var donnees = e.data || {};
    if (donnees.source !== "apercu") return;

    if (donnees.type === "pret") {
      etat.apercuPret = true;
      if (etat.selection) versApercu({ type: "selectionner", chemin: etat.selection, defiler: false });
    }
    if (donnees.type === "selection") selectionner(donnees.chemin, true);
    if (donnees.type === "naviguer") ouvrirDepuisApercu(donnees.fichier);
    if (donnees.type === "hors-contenu" && EXPLICATIONS[donnees.zone]) {
      message(EXPLICATIONS[donnees.zone], "info");
    }
  });

  /**
   * Filet de sécurité : l'aperçu ne doit jamais quitter le mode `?apercu=1`,
   * sans lequel le script de sélection n'est plus injecté et la page devient
   * inéditable. `apercu.js` neutralise les liens, mais si une navigation
   * passait malgré tout, on rouvre proprement la page atteinte.
   */
  function surChargementApercu() {
    var cadre = $("#apercu");
    var url;
    try { url = new URL(cadre.contentWindow.location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;          // about:blank au démarrage
    if (url.searchParams.has("apercu")) return;          // aperçu normal

    etat.apercuPret = false;
    var fichier = decodeURIComponent(url.pathname).replace(/^\//, "");
    if (fichier === "" || /\/$/.test(fichier)) fichier += "index.html";
    ouvrirDepuisApercu(fichier);
  }

  /* ---------------------------------------------------------------- *
     Démarrage
   * ---------------------------------------------------------------- */
  function brancherBarre() {
    $("#choix-page").addEventListener("change", function (e) {
      ouvrirPage(e.target.value).catch(function (err) { message(err.message, "erreur"); });
    });

    $("#apercu").addEventListener("load", surChargementApercu);

    $("#btn-nouvelle-page").addEventListener("click", nouvellePage);
    $("#btn-annuler").addEventListener("click", annulerDerniere);
    $("#btn-recharger").addEventListener("click", rechargerApercu);
    $("#btn-medias").addEventListener("click", function () {
      chargerMedias(true).then(function () { ouvrirMediatheque({ multiple: true, parcourir: true }); });
    });
    $("#btn-ajouter-section").addEventListener("click", function () {
      ouvrirAjout("", etat.arbre ? etat.arbre.blocs.length : 0, "page", "à la fin de la page");
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-largeur]"), function (bouton) {
      bouton.addEventListener("click", function () {
        var largeur = Number(bouton.getAttribute("data-largeur"));
        var cadre = $("#apercu-cadre");
        Array.prototype.forEach.call(document.querySelectorAll("[data-largeur]"), function (b) {
          b.classList.remove("est-actif");
        });
        bouton.classList.add("est-actif");
        cadre.classList.toggle("apercu--cadre", largeur > 0);
        $("#apercu").style.width = largeur ? largeur + "px" : "100%";
        $("#apercu").style.maxWidth = "100%";
      });
    });

    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        var bouton = $("#inspecteur .bouton--primaire");
        if (bouton) bouton.click();
      }
    });
  }

  function demarrer() {
    brancherBarre();
    Promise.all([api("pages"), api("modeles")])
      .then(function (reponses) {
        etat.pages = reponses[0].pages;
        etat.modelesPage = reponses[0].modelesPage;
        etat.modeles = reponses[1].modeles;
        rendreListePages();
        return ouvrirPage(etat.pages[0].fichier);
      })
      .catch(function (err) { message(err.message, "erreur"); });
  }

  demarrer();
})();
