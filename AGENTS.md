# Intervals.icu MCP

Ce projet fournit un serveur MCP pour interroger l'API Intervals.icu et exposer des donnees sportives utilisables par un agent ou un client compatible Model Context Protocol.

L'interet principal est de donner a un assistant un acces structure a des donnees d'entrainement reelles sans manipuler directement l'API Intervals.icu a chaque demande. Le MCP encapsule l'authentification, les appels HTTP, le filtrage et certains formats de sortie utiles.

## Ce Que Fait Le Projet

Le serveur expose trois outils MCP :

- `get_recent_activities` : recupere les activites recentes de l'athlete. La sortie est filtree pour ne garder que les activites `Ride` et `VirtualRide`, puis formatee en texte lisible avec l'heure convertie au fuseau horaire de Geneve (`Europe/Zurich`).
- `get_activity` : recupere le detail d'une activite precise via son identifiant Intervals.icu. L'appel inclut les intervalles, puis transforme `icu_intervals` en un tableau `laps` plus compact contenant les informations principales.
- `get_recent_wellness` : recupere les donnees wellness recentes, notamment sommeil, HRV, frequence cardiaque au repos, charge CTL/ATL et metriques associees.

Le serveur expose aussi des ressources MCP equivalentes pour consulter les activites recentes, les metriques wellness et le detail d'une activite.

## Fonctionnement Technique

Le projet est ecrit en TypeScript et compile vers `dist/`.

- [src/index.ts](/Users/fabio/Documents/Projects/intervals-mcp/src/index.ts) configure le serveur MCP, declare les ressources et les outils, applique les transformations de sortie et demarre le transport stdio ou HTTP.
- [src/intervalsClient.ts](/Users/fabio/Documents/Projects/intervals-mcp/src/intervalsClient.ts) encapsule les appels a l'API Intervals.icu, l'authentification Basic Auth et la construction des requetes.
- [package.json](/Users/fabio/Documents/Projects/intervals-mcp/package.json) definit les scripts principaux : `npm run build`, `npm run start` et `npm run dev`.
- [tsconfig.json](/Users/fabio/Documents/Projects/intervals-mcp/tsconfig.json) configure la compilation TypeScript en mode `NodeNext`.

L'authentification Intervals.icu utilise le couple Basic Auth attendu par l'API :

- username : `API_KEY`
- password : la cle API Intervals.icu

Les variables d'environnement attendues sont :

- `INTERVALS_API_KEY` : cle API Intervals.icu requise.
- `INTERVALS_ATHLETE_ID` : identifiant athlete Intervals.icu. Si absent, la valeur par defaut est `0`.
- `MCP_TRANSPORT` : `stdio` par defaut, ou `http` pour lancer le serveur en HTTP.
- `MCP_HOST`, `MCP_PORT`, `MCP_PATH` : options utilisees uniquement avec le transport HTTP.

## Formats De Sortie

Les exemples de sortie des outils sont stockes dans le dossier [output](/Users/fabio/Documents/Projects/intervals-mcp/output).

- `get_recent_activities` : [output/get_recent_activities.txt](/Users/fabio/Documents/Projects/intervals-mcp/output/get_recent_activities.txt)
- `get_activity` : [output/get_activity.txt](/Users/fabio/Documents/Projects/intervals-mcp/output/get_activity.txt)
- `get_recent_wellness` : [output/get_recent_wellness.txt](/Users/fabio/Documents/Projects/intervals-mcp/output/get_recent_wellness.txt)

Ces fichiers servent d'exemples de reference pour comprendre le format retourne par chaque outil. Leur contenu n'est pas duplique ici afin de garder ce document lisible.

## Commandes Utiles

Installer les dependances :

```bash
npm install
```

Compiler le projet :

```bash
npm run build
```

Lancer le serveur compile :

```bash
npm run start
```

Lancer en developpement TypeScript :

```bash
npm run dev
```

## Notes Pour Les Agents

Avant de modifier le comportement d'un outil, verifier a la fois `src/index.ts` et les fichiers d'exemple dans `output/`.

Apres une modification TypeScript, executer `npm run build` pour mettre a jour `dist/` et verifier que la compilation reste valide.

Pour `get_recent_activities`, conserver la conversion explicite en fuseau `Europe/Zurich`, car les heures affichees doivent correspondre au fuseau horaire de Geneve.
