#!/bin/bash
# Lance l'interface d'administration du site (voir CLAUDE.md, section 13).
# Double-cliquer ce fichier : demarre admin.mjs puis ouvre l'admin dans le navigateur.

cd "$(dirname "$0")"

PORT=5174

open "http://localhost:$PORT/admin"
node admin.mjs "$PORT"
