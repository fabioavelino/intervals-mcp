---
name: intervals
description: Query Intervals.icu training data. Use for recent rides, activity details and laps, minute-by-minute WORK intervals, or wellness/sleep/HRV/load.
---

# Intervals.icu

Read-only access to Intervals.icu via the bundled `intervals` MCP server.
Tools: `get_recent_activities`, `get_activity`, `get_activity_minutes`,
`get_recent_wellness`. All times display in `Europe/Zurich`.

## When to use which tool

- Recent rides: `get_recent_activities` with `daysBack` (default 30).
  Output lines are `<id> <type> <YYYY-MM-DD à HH:MM:SS>`.
- One activity: `get_activity` with the id from the list above.
  Returns performance, power, heart rate, zones, groups, achievements, laps.
- Minute by minute: `get_activity_minutes` with `activityId` and optional
  `bucketMinutes` (default 1). Returns one block per `WORK` interval:
  summary plus `T Pwr NP Max WoC Cst Z HR HRx Cad km/h Dist E` rows.
  If no `WORK` interval exists the tool names the detected types instead.
- Recovery and load: `get_recent_wellness` with `daysBack` (default 7).
  Each day shows CTL/ATL/ramp rate, sleep hours and score, RHR and HRV.

## Guidance

- Ask for an activity id when the user has not provided one; list recents first.
- `get_activity_minutes` output is large. Prefer one interval at a time and
  use `bucketMinutes` 2-5 for long rides unless the user asks for full detail.
- Never ask for or repeat API keys. Auth comes from the host environment
  (`INTERVALS_API_KEY`, optional `INTERVALS_ATHLETE_ID`).
- The server is read-only; it cannot modify Intervals.icu data.

## Example prompts

- "List my rides from the last 14 days."
- "Detail activity <id> and summarise the intervals."
- "Minute table for activity <id>, 2-minute buckets."
- "Sleep, HRV and training load over the last 7 days."
