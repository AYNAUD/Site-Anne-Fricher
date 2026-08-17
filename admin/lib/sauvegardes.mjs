/* =========================================================================
   Sauvegardes et annulation.

   Chaque opération de l'administration passe par une « transaction » :
   les fichiers touchés sont d'abord copiés dans `.admin-sauvegardes/`, puis
   écrits. Le journal permet de revenir en arrière opération par opération,
   y compris quand une seule action a modifié huit pages (ajout au menu).
   ========================================================================= */
import { readFile, writeFile, mkdir, copyFile, rm, stat } from "node:fs/promises";
import { join, dirname } from "node:path";

const DOSSIER = ".admin-sauvegardes";
const JOURNAL = "journal.json";
const MAX_ENTREES = 60;

const existe = (chemin) => stat(chemin).then(() => true).catch(() => false);

function horodatage() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function lireJournal(racine) {
  try {
    return JSON.parse(await readFile(join(racine, DOSSIER, JOURNAL), "utf8"));
  } catch {
    return [];
  }
}

async function ecrireJournal(racine, entrees) {
  await mkdir(join(racine, DOSSIER), { recursive: true });
  await writeFile(join(racine, DOSSIER, JOURNAL), JSON.stringify(entrees, null, 2), "utf8");
}

/**
 * Ouvre une transaction.
 * @param {string} racine racine du site
 * @param {string} libelle description lisible de l'opération
 */
export function transaction(racine, libelle) {
  const marque = horodatage();
  const dossier = join(racine, DOSSIER, marque);
  const fichiers = [];

  return {
    /** Écrit un fichier après en avoir sauvegardé la version précédente. */
    async ecrire(relatif, contenu) {
      const cible = join(racine, relatif);
      const dejaLa = await existe(cible);

      // Un même fichier peut être écrit deux fois dans une opération (une
      // page créée puis ajoutée au menu) : seule la toute première version
      // est sauvegardée, c'est celle qu'il faudra rétablir.
      const dejaSuivi = fichiers.some((f) => f.fichier === relatif);

      if (dejaLa && !dejaSuivi) {
        const copie = join(dossier, relatif);
        await mkdir(dirname(copie), { recursive: true });
        await copyFile(cible, copie);
      }

      await mkdir(dirname(cible), { recursive: true });
      await writeFile(cible, contenu, "utf8");
      if (!dejaSuivi) fichiers.push({ fichier: relatif, creation: !dejaLa });
    },

    /** Enregistre l'opération dans le journal. */
    async valider(details = {}) {
      if (!fichiers.length) return null;
      const entrees = await lireJournal(racine);
      const entree = {
        id: marque,
        date: new Date().toISOString(),
        libelle,
        fichiers,
        details
      };
      entrees.push(entree);

      // Purge des plus anciennes sauvegardes
      while (entrees.length > MAX_ENTREES) {
        const vieille = entrees.shift();
        await rm(join(racine, DOSSIER, vieille.id), { recursive: true, force: true });
      }

      await ecrireJournal(racine, entrees);
      return entree;
    }
  };
}

/** Journal des opérations, de la plus récente à la plus ancienne. */
export async function historique(racine) {
  const entrees = await lireJournal(racine);
  return entrees.slice().reverse().map((e) => ({
    id: e.id,
    date: e.date,
    libelle: e.libelle,
    fichiers: e.fichiers.map((f) => f.fichier)
  }));
}

/** Annule la dernière opération enregistrée. */
export async function annuler(racine) {
  const entrees = await lireJournal(racine);
  const entree = entrees.pop();
  if (!entree) throw new Error("Aucune modification à annuler.");

  for (const fichier of entree.fichiers) {
    const cible = join(racine, fichier.fichier);
    if (fichier.creation) {
      await rm(cible, { force: true });
      continue;
    }
    const copie = join(racine, DOSSIER, entree.id, fichier.fichier);
    if (await existe(copie)) await copyFile(copie, cible);
  }

  await rm(join(racine, DOSSIER, entree.id), { recursive: true, force: true });
  await ecrireJournal(racine, entrees);
  return entree;
}
