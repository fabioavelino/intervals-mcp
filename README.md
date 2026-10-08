# Intervals.icu MCP

Serveur MCP local pour exposer des données Intervals.icu à des assistants compatibles Model Context Protocol: Claude Desktop, Codex, Claude Code, clients CLI MCP, etc.

Le serveur interroge directement l'API Intervals.icu avec votre clé API, puis expose des outils et ressources lisibles par un agent. Il est pensé pour consulter des données d'entraînement sans devoir manipuler l'API Intervals.icu à la main.

## Fonctionnalités

Outils MCP exposés:

- `get_recent_activities`: récupère les activités récentes, filtrées sur `Ride` et `VirtualRide`, avec les horaires convertis en fuseau `Europe/Zurich`.
- `get_activity`: récupère le détail d'une activité Intervals.icu, avec les intervalles transformés en `laps` plus compacts.
- `get_activity_minutes`: récupère les intervalles de type `WORK` d'une activité, regroupe leurs streams 1 seconde par intervalle et renvoie, pour chacun, un résumé (durée, distance, dénivelé, vitesse, puissance moyenne/NP/VI/pic, watts sans coasting, temps en zone de puissance, FC, cadence, réserve W') suivi des lignes minute par minute (puissance, NP, pic, watts sans coasting, coasting, zone, FC, cadence, vitesse, distance, dénivelé). Si aucun intervalle `WORK` n'est détecté, la sortie indique les types trouvés. Les colonnes sans donnée sont retirées, et `bucketMinutes` permet d'agréger les lignes par N minutes.
- `get_recent_wellness`: récupère les données wellness récentes: sommeil, HRV, fréquence cardiaque au repos, CTL, ATL, ramp rate, etc.

Ressources MCP exposées:

- `intervals://activities/recent`
- `intervals://activities/{activityId}`
- `intervals://activities/{activityId}/minutes`
- `intervals://wellness/current`

## Prérequis

- Node.js 20 ou plus récent recommandé.
- Une clé API Intervals.icu.
- L'identifiant athlete Intervals.icu, optionnel. Si `INTERVALS_ATHLETE_ID` est absent, le serveur utilise `0`, ce qui correspond généralement à l'athlète associé à la clé API.

Pour créer une clé API Intervals.icu:

1. Ouvrir Intervals.icu.
2. Aller dans les paramètres du compte.
3. Générer ou copier une clé API.
4. Garder cette clé privée: elle donne accès à vos données sportives.

## Variables d'environnement

| Variable | Obligatoire | Description |
| --- | --- | --- |
| `INTERVALS_API_KEY` | Oui | Clé API Intervals.icu. Le serveur l'utilise comme mot de passe Basic Auth, avec `API_KEY` comme nom d'utilisateur. |
| `INTERVALS_ATHLETE_ID` | Non | Identifiant de l'athlète, par exemple `i123456`. Par défaut `0`, ce qui correspond à l'athlète associé à la clé API. |
| `MCP_TRANSPORT` | Non | `stdio` (défaut) ou `http`. |
| `MCP_HOST`, `MCP_PORT`, `MCP_PATH` | Non | Uniquement en mode HTTP. Défauts: `127.0.0.1`, `3030`, `/mcp`. |

## Installation du projet

Cloner le dépôt, puis installer les dépendances et compiler:

```bash
git clone git@github.com:fabioavelino/intervals-mcp.git
cd intervals-mcp
npm install
npm run build
```

Le code TypeScript est compilé dans `dist/`.

Pour un lancement local (`npm run dev`, `npm run start` ou en mode HTTP), le serveur charge un fichier `.env` via `dotenv`. Copiez le fichier d'exemple et renseignez vos valeurs:

```bash
cp .env.exemple .env
```

Le fichier `.env` est ignoré par git: ne committez jamais votre clé API.

## Configuration MCP

La configuration standard ressemble à ceci:

```json
{
  "mcpServers": {
    "intervals": {
      "command": "node",
      "args": [
        "/Users/fabio/Documents/Projects/intervals-mcp/dist/index.js"
      ],
      "env": {
        "INTERVALS_API_KEY": "votre-cle-api",
        "INTERVALS_ATHLETE_ID": "i123456"
      }
    }
  }
}
```

Remplacez `votre-cle-api` et `i123456` par vos valeurs, et adaptez le chemin dans `args` à l'emplacement où vous avez cloné le projet (un chemin absolu vers `dist/index.js` est attendu). Si vous voulez utiliser l'athlète associé à la clé API, vous pouvez supprimer `INTERVALS_ATHLETE_ID`.

## Installer dans Claude Desktop

Claude Desktop utilise une configuration JSON locale.

Emplacements courants:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Ajoutez le serveur:

```json
{
  "mcpServers": {
    "intervals": {
      "command": "node",
      "args": [
        "/Users/fabio/Documents/Projects/intervals-mcp/dist/index.js"
      ],
      "env": {
        "INTERVALS_API_KEY": "votre-cle-api",
        "INTERVALS_ATHLETE_ID": "i123456"
      }
    }
  }
}
```

Puis redémarrez Claude Desktop. Le serveur devrait apparaître dans les outils MCP disponibles.

## Installer dans Codex

Codex CLI et l'extension/desktop Codex partagent la configuration MCP dans `~/.codex/config.toml`.

Ajoutez:

```toml
[mcp_servers.intervals]
command = "node"
args = ["/Users/fabio/Documents/Projects/intervals-mcp/dist/index.js"]
enabled = true

[mcp_servers.intervals.env]
INTERVALS_API_KEY = "votre-cle-api"
INTERVALS_ATHLETE_ID = "i123456"
```

Vérifiez ensuite:

```bash
codex mcp list
```

Dans une session Codex, vous pouvez ensuite demander par exemple:

```text
Utilise le MCP Intervals pour lister mes sorties vélo des 14 derniers jours.
```

## Installer dans Claude Code CLI

Claude Code peut ajouter un serveur MCP local via `claude mcp add`.

Installation avec scope utilisateur:

```bash
claude mcp add --transport stdio \
  --scope user \
  --env INTERVALS_API_KEY=votre-cle-api \
  --env INTERVALS_ATHLETE_ID=i123456 \
  intervals -- node /Users/fabio/Documents/Projects/intervals-mcp/dist/index.js
```

Installation limitée au projet courant:

```bash
claude mcp add --transport stdio \
  --env INTERVALS_API_KEY=votre-cle-api \
  --env INTERVALS_ATHLETE_ID=i123456 \
  intervals -- node /Users/fabio/Documents/Projects/intervals-mcp/dist/index.js
```

Vérifier:

```bash
claude mcp list
```

Dans Claude Code, utilisez aussi:

```text
/mcp
```

pour confirmer que le serveur est connecté.

## Clients CLI compatibles MCP

Pour les clients CLI qui acceptent une configuration au format Claude Desktop, comme certains inspecteurs MCP ou clients agentiques, utilisez le bloc stdio suivant:

```json
{
  "mcpServers": {
    "intervals": {
      "command": "node",
      "args": [
        "/Users/fabio/Documents/Projects/intervals-mcp/dist/index.js"
      ],
      "env": {
        "INTERVALS_API_KEY": "votre-cle-api",
        "INTERVALS_ATHLETE_ID": "i123456"
      }
    }
  }
}
```

## Utilisation depuis un agent

Exemples de requêtes:

```text
Liste mes activités vélo des 30 derniers jours.
```

```text
Récupère le détail de l'activité i123456789 et résume les intervalles.
```

```text
Donne-moi la table minute par minute de l'activité i123456789, avec la puissance, la FC et la zone de chaque minute.
```

```text
Analyse mon sommeil, ma HRV et ma charge d'entraînement sur les 7 derniers jours.
```

Les exemples de sorties sont disponibles dans `output/`:

- `output/get_recent_activities.txt`
- `output/get_activity.txt`
- `output/get_activity_minutes.txt`
- `output/get_recent_wellness.txt`

## Développement

Démarrage TypeScript en développement:

```bash
npm run dev
```

Compilation:

```bash
npm run build
```

Démarrage du serveur compilé:

```bash
npm run start
```

Après une modification TypeScript, exécutez toujours:

```bash
npm run build
```

## Dépannage

`INTERVALS_API_KEY environment variable is required.`

La variable `INTERVALS_API_KEY` n'est pas fournie au processus MCP. Ajoutez-la dans le bloc `env` du client ou dans votre shell.

Le client ne voit aucun outil MCP.

Vérifiez que `npm run build` a été exécuté et que le chemin `/Users/fabio/Documents/Projects/intervals-mcp/dist/index.js` existe. Redémarrez ensuite le client.

Erreur d'authentification Intervals.icu.

Vérifiez la clé API. L'API Intervals.icu utilise Basic Auth avec `API_KEY` comme username et votre clé comme password; ce serveur le fait automatiquement.

Le mode HTTP ne répond pas.

Vérifiez que le serveur est lancé avec `MCP_TRANSPORT=http` ou `node dist/index.js --http`, puis utilisez l'URL exacte affichée au démarrage.

## Sécurité

Ne committez jamais votre clé API dans le dépôt. Préférez les variables d'environnement du client MCP ou un gestionnaire de secrets local.

Le serveur est en lecture seule côté MCP: il expose des outils de consultation et ne modifie pas vos données Intervals.icu.
