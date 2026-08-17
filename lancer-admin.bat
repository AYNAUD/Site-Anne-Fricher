@echo off
rem Lance l'interface d'administration du site (voir CLAUDE.md, section 13).
rem Double-cliquer ce fichier : demarre admin.mjs puis ouvre l'admin dans le navigateur.

cd /d "%~dp0"

set PORT=5174

start "" http://localhost:%PORT%/admin
node admin.mjs %PORT%
