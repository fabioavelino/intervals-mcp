#!/bin/zsh
set -e

cd "$(dirname "$0")"

export MCP_TRANSPORT="${MCP_TRANSPORT:-http}"
export MCP_HOST="${MCP_HOST:-127.0.0.1}"
export MCP_PORT="${MCP_PORT:-3030}"
export MCP_PATH="${MCP_PATH:-/mcp}"
export INTERVALS_ATHLETE_ID="i227982"
export INTERVALS_API_KEY="4ibhm0wbla72wg89wzbro9elk"

display_host="$MCP_HOST"
if [[ "$display_host" == "0.0.0.0" || "$display_host" == "::" ]]; then
  display_host="localhost"
fi

mcp_url="http://${display_host}:${MCP_PORT}${MCP_PATH}"

echo "Starting Intervals.icu MCP server..."
echo "Remote MCP URL: ${mcp_url}"
echo
echo "Use this URL in your LLM app's Remote MCP configuration."
echo "Leave this window open while the MCP server is in use."
echo

npm run build
exec node dist/index.js --http
