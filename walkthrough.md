# Intervals.icu MCP Server Walkthrough

I have successfully built and compiled the Intervals.icu MCP server! The server exposes three resources per your requirements, adhering to the DRY and YAGNI principles by focusing exactly on what was requested.

## Features Implemented

The server provides read-only **Resources** and **Resource Templates** that LLMs can access.

1. `intervals://activities/recent`: Fetches current activities from the last 30 days.
2. `intervals://activities/{activityId}`: Fetches details for a specific activity by its ID.
3. `intervals://wellness/current`: Fetches wellness data (sleep score, HRV, heart rate) for the last 7 days.

## How to Compile & Run

The project is located at: `[intervals-mcp](file:///Users/fabio/.gemini/antigravity/playground/sidereal-observatory/intervals-mcp)`

To rebuild the project, simply run:
```bash
npm install
npm run build
```

The compiled code sits in the `dist/` directory.

## Integrating With Claude Desktop

To use this server, you'll need to configure your LLM client (like Claude Desktop or Cursor) to start the server. Add the following to your MCP configuration file (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "intervals": {
      "command": "node",
      "args": [
        "/Users/fabio/Documents/Projects/intervals-mcp/dist/index.js"
      ],
      "env": {
        "INTERVALS_API_KEY": "4ibhm0wbla72wg89wzbro9elk",
        "INTERVALS_ATHLETE_ID": "i227982" 
      }
    }
  }
}
```

> [!TIP]
> The `INTERVALS_ATHLETE_ID` defaults to `"0"`, which automatically maps to the athlete who generated the API key. You only need to provide the `INTERVALS_API_KEY`.

> [!NOTE]
> The server runs entirely locally and communicates directly with the Intervals.icu API. All responses are parsed and served verbatim to the LLM. 
