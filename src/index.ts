import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { IntervalsClient } from "./intervalsClient.js";
import * as dotenv from "dotenv";
import { z } from "zod";

// MCP over stdio must stay silent on stdout; dotenv's default banner breaks the protocol.
dotenv.config({ quiet: true });

const INTERVALS_API_KEY = process.env.INTERVALS_API_KEY;
const INTERVALS_ATHLETE_ID = process.env.INTERVALS_ATHLETE_ID || "0";

if (!INTERVALS_API_KEY) {
    console.error("INTERVALS_API_KEY environment variable is required.");
    process.exit(1);
}

const client = new IntervalsClient({
    apiKey: INTERVALS_API_KEY,
    athleteId: INTERVALS_ATHLETE_ID,
});

const RECENT_ACTIVITY_TYPES = new Set(["Ride", "VirtualRide"]);
const GENEVA_TIME_ZONE = "Europe/Zurich";

const genevaDateTimeFormatter = new Intl.DateTimeFormat("fr-CH", {
    timeZone: GENEVA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
});

function formatGenevaDateTime(activity: any): string {
    const timestamp = activity.start_date || activity.start_date_local;
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        return String(timestamp).replace("T", " à ").slice(0, 21);
    }

    const parts = Object.fromEntries(
        genevaDateTimeFormatter
            .formatToParts(date)
            .map((part) => [part.type, part.value])
    );

    return `${parts.year}-${parts.month}-${parts.day} à ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatRecentActivity(activity: any): string {
    return `${activity.id} ${String(activity.type).padEnd(14, " ")} ${formatGenevaDateTime(activity)}`;
}

function formatRecentActivities(activities: any[]): string {
    return activities
        .filter((activity: any) => RECENT_ACTIVITY_TYPES.has(activity.type))
        .map(formatRecentActivity)
        .join("\n");
}

function formatNullableNumber(value: unknown, digits: number): string {
    return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function formatNullableInteger(value: unknown): string {
    return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "-";
}

function formatRampRate(value: unknown): string {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return "-";
    }

    const formatted = value.toFixed(2);
    return value > 0 ? `+${formatted}` : formatted;
}

function formatSleepHours(sleepSecs: unknown): string {
    return typeof sleepSecs === "number" && Number.isFinite(sleepSecs)
        ? `${(sleepSecs / 3600).toFixed(1)}h`
        : "-";
}

function formatWellnessDay(day: any): string {
    return [
        `[${day.id}]`,
        `Fitness: CTL ${formatNullableNumber(day.ctl, 1)} ATL ${formatNullableNumber(day.atl, 1)} RampRate ${formatRampRate(day.rampRate)}`,
        `Sleep: ${formatSleepHours(day.sleepSecs)} Score ${formatNullableInteger(day.sleepScore)}/100 Quality ${formatNullableInteger(day.sleepQuality)}/5 RHR ${formatNullableInteger(day.restingHR)}bpm HRV ${formatNullableInteger(day.hrv)}ms`,
    ].join("\n");
}

function formatRecentWellness(wellness: any[]): string {
    return wellness
        .slice()
        .sort((a: any, b: any) => String(b.id).localeCompare(String(a.id)))
        .map(formatWellnessDay)
        .join("\n\n");
}

function removeNullValues(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(removeNullValues);
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([, entryValue]) => entryValue !== null)
                .map(([key, entryValue]) => [key, removeNullValues(entryValue)])
        );
    }

    return value;
}

function normalizeActivityDetails(activity: any): any {
    const formattedActivity = { ...activity };

    if (formattedActivity.icu_intervals) {
        formattedActivity.laps = formattedActivity.icu_intervals.map((interval: any) => ({
            id: interval.id,
            type: interval.type,
            label: interval.label,
            average_power: interval.average_watts,
            np: interval.weighted_average_watts,
            time_spent: interval.moving_time,
            average_bpm: interval.average_heartrate,
            Wattscleaned: interval.Wattscleaned
        }));
        delete formattedActivity.icu_intervals;
    }

    return removeNullValues(formattedActivity);
}

function formatDuration(totalSeconds: unknown): string {
    if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds)) {
        return "-";
    }

    const seconds = Math.round(totalSeconds);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
        return `${hours}h${String(minutes).padStart(2, "0")}m${String(remainingSeconds).padStart(2, "0")}s`;
    }

    return `${minutes}m${String(remainingSeconds).padStart(2, "0")}s`;
}

function formatShortDuration(totalSeconds: unknown): string {
    if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds)) {
        return "-";
    }

    if (totalSeconds < 60) {
        return `${Math.round(totalSeconds)}s`;
    }

    return formatDuration(totalSeconds);
}

function formatDateMinute(value: unknown): string {
    return typeof value === "string" ? value.replace("T", " ").slice(0, 16) : "-";
}

function formatNumber(value: unknown, digits = 0): string {
    return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function formatRounded(value: unknown): string {
    return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "-";
}

function formatSignedRounded(value: unknown): string {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return "-";
    }

    const rounded = Math.round(value);
    return rounded > 0 ? `+${rounded}` : String(rounded);
}

function formatKilometers(meters: unknown): string {
    return typeof meters === "number" && Number.isFinite(meters) ? (meters / 1000).toFixed(1) : "-";
}

function formatKph(metersPerSecond: unknown): string {
    return typeof metersPerSecond === "number" && Number.isFinite(metersPerSecond)
        ? (metersPerSecond * 3.6).toFixed(1)
        : "-";
}

function formatPercent(value: unknown, digits = 0): string {
    return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function formatSource(value: unknown): string {
    return typeof value === "string"
        ? value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
        : "-";
}

function formatPowerMeter(value: unknown): string {
    if (typeof value !== "string") {
        return "-";
    }

    if (value.includes("FAVERO")) {
        return "Favero";
    }

    return formatSource(value);
}

function formatBattery(value: unknown): string {
    return typeof value === "string" ? value : "-";
}

function formatCompassDirection(degrees: unknown): string {
    if (typeof degrees !== "number" || !Number.isFinite(degrees)) {
        return "-";
    }

    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return directions[Math.round(degrees / 45) % directions.length];
}

function formatZoneThresholds(zones: unknown, unit: string): string {
    if (!Array.isArray(zones) || zones.length === 0) {
        return "-";
    }

    return zones
        .map((zone, index) => {
            const threshold = index === zones.length - 1 ? zones[index - 1] : zone;

            if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
                return `Z${index + 1}<-`;
            }

            if (index === zones.length - 1) {
                return `Z${index + 1}≥${Math.round(threshold)}${unit}`;
            }

            return `Z${index + 1}<${Math.round(threshold)}${unit}`;
        })
        .join(" | ");
}

function formatPowerZoneThresholds(zones: unknown, ftp: unknown): string {
    if (!Array.isArray(zones) || typeof ftp !== "number" || !Number.isFinite(ftp)) {
        return "-";
    }

    return zones
        .map((zone, index) => {
            const threshold = index === zones.length - 1 ? zones[index - 1] : zone;

            if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
                return `Z${index + 1}<-`;
            }

            const watts = Math.round((threshold / 100) * ftp);
            return index === zones.length - 1
                ? `Z${index + 1}≥${watts}w`
                : `Z${index + 1}<${watts}w`;
        })
        .join(" | ");
}

function formatPowerRange(minPercent: unknown, maxPercent: unknown, ftp: unknown): string {
    if (
        typeof minPercent !== "number" || !Number.isFinite(minPercent) ||
        typeof maxPercent !== "number" || !Number.isFinite(maxPercent) ||
        typeof ftp !== "number" || !Number.isFinite(ftp)
    ) {
        return "-";
    }

    return `${Math.round((minPercent / 100) * ftp)}–${Math.round((maxPercent / 100) * ftp)}w`;
}

function formatZoneTimes(zoneTimes: unknown): string[] {
    if (!Array.isArray(zoneTimes)) {
        return [];
    }

    return zoneTimes.map((zone: any, index) => {
        const id = zone && typeof zone === "object" && "id" in zone ? zone.id : `Z${index + 1}`;
        const secs = zone && typeof zone === "object" && "secs" in zone ? zone.secs : zone;
        return `${id}: ${formatDuration(secs)}`;
    });
}

function splitZoneLines(zones: string[]): string[] {
    const lines: string[] = [];
    for (let index = 0; index < zones.length; index += 4) {
        lines.push(`  ${zones.slice(index, index + 4).join(" | ")}`);
    }
    return lines;
}

function formatActivityGroups(groups: unknown): string[] {
    if (!Array.isArray(groups) || groups.length === 0) {
        return ["No auto-detected groups."];
    }

    return groups.map((group: any) => {
        const count = formatRounded(group.count).padStart(2, " ");
        const duration = formatShortDuration(group.moving_time).padStart(3, " ");
        return `${count}x ${duration} @ ${formatRounded(group.average_watts)}w avg | Z${formatRounded(group.zone)} | HR ${formatRounded(group.average_heartrate)} bpm | cad ${formatRounded(group.average_cadence)} rpm`;
    });
}

function formatAchievement(achievement: any): string {
    const duration = typeof achievement.secs === "number" && achievement.secs % 60 === 0
        ? `${Math.round(achievement.secs / 60)}min`
        : formatDuration(achievement.secs);

    if (achievement.type === "FTP_UP") {
        return `🏆 FTP UP:        ${formatRounded(achievement.watts)}w over ${duration} (new best)`;
    }

    if (achievement.type === "BEST_POWER") {
        return `⚡ Best Power ${duration}: ${formatRounded(achievement.watts)}w`;
    }

    return `${achievement.type}: ${formatRounded(achievement.watts)}w over ${duration}`;
}

function formatAchievements(achievements: unknown): string[] {
    if (!Array.isArray(achievements) || achievements.length === 0) {
        return ["No achievements."];
    }

    return achievements.map(formatAchievement);
}

function formatLaps(laps: unknown): string[] {
    if (!Array.isArray(laps) || laps.length === 0) {
        return ["No laps."];
    }

    return [
        " #  Type      Duration  Avg pwr  NP    Avg HR   Watts without coasting",
        ...laps.map((lap: any, index) => (
            `${String(index + 1).padStart(2, " ")}  ${String(lap.type || "-").padEnd(8, " ")}  ${formatDuration(lap.time_spent).padEnd(8, " ")}  ${`${formatRounded(lap.average_power)}w`.padEnd(7, " ")}  ${`${formatRounded(lap.np)}w`.padEnd(4, " ")}  ${`${formatRounded(lap.average_bpm)} bpm`.padEnd(8, " ")} ${lap.Wattscleaned || "-"}`
        )),
    ];
}

function section(title: string): string {
    return `── ${title} ${"─".repeat(Math.max(0, 70 - title.length))}`;
}

function formatActivityDetails(activity: any): string {
    const formattedActivity = normalizeActivityDetails(activity);
    const hrr = formattedActivity.icu_hrr || {};
    const wattsPerKg = typeof formattedActivity.icu_ftp === "number" && typeof formattedActivity.icu_weight === "number"
        ? (formattedActivity.icu_ftp / formattedActivity.icu_weight).toFixed(2)
        : "-";

    return [
        `${formattedActivity.type || "Activity"}: ${formattedActivity.name || "-"}, ${formatDateMinute(formattedActivity.start_date_local)}`,
        "",
        section("PERFORMANCE"),
        `Duration:      ${formatDuration(formattedActivity.icu_recording_time)} (moving: ${formatDuration(formattedActivity.moving_time)}, coasting: ${formatDuration(formattedActivity.coasting_time)})`,
        `Distance:      ${formatKilometers(formattedActivity.distance)} km`,
        `Elevation:     +${formatRounded(formattedActivity.total_elevation_gain)}m / -${formatRounded(formattedActivity.total_elevation_loss)}m | Avg altitude: ${formatRounded(formattedActivity.average_altitude)}m (min ${formatRounded(formattedActivity.min_altitude)}m / max ${formatRounded(formattedActivity.max_altitude)}m)`,
        `Avg speed:     ${formatKph(formattedActivity.average_speed)} km/h | Max: ${formatKph(formattedActivity.max_speed)} km/h`,
        `Avg cadence:   ${formatRounded(formattedActivity.average_cadence)} rpm`,
        `Calories:      ${formatRounded(formattedActivity.calories)} kcal | Carbs used: ${formatRounded(formattedActivity.carbs_used)}g`,
        "",
        section("POWER"),
        `FTP (set):     ${formatRounded(formattedActivity.icu_ftp)}w | Rolling FTP: ${formatRounded(formattedActivity.icu_rolling_ftp)}w (${formatSignedRounded(formattedActivity.icu_rolling_ftp_delta)}w delta)`,
        `Avg watts:     ${formatRounded(formattedActivity.icu_average_watts)}w | NP: ${formatRounded(formattedActivity.icu_weighted_avg_watts)}w | VI: ${formatNumber(formattedActivity.icu_variability_index, 2)}`,
        `IF:            ${formatPercent(formattedActivity.icu_intensity, 0)}% | EF: ${formatNumber(formattedActivity.icu_efficiency_factor, 2)} | Power/HR: ${formatNumber(formattedActivity.icu_power_hr, 2)}`,
        `W':            ${formatRounded(formattedActivity.icu_w_prime)} J | Max W' depletion: ${formatRounded(formattedActivity.icu_max_wbal_depletion)} J`,
        `Peak power:    ${formatRounded(formattedActivity.p_max)}w`,
        `Joules total:  ${formatRounded(formattedActivity.icu_joules)} J | Above FTP: ${formatRounded(formattedActivity.icu_joules_above_ftp)} J`,
        `kJ/h:          ${formatNumber(formattedActivity.KJperhour, 1)}`,
        `Time above FTP: ${formatNumber(formattedActivity.TimeAboveFTP, 1)} min`,
        "",
        section("HEART RATE"),
        `Avg HR:        ${formatRounded(formattedActivity.average_heartrate)} bpm | Max: ${formatRounded(formattedActivity.max_heartrate)} bpm | LTHR: ${formatRounded(formattedActivity.lthr)} bpm`,
        `Resting HR:    ${formatRounded(formattedActivity.icu_resting_hr)} bpm | Max HR: ${formatRounded(formattedActivity.athlete_max_hr)} bpm`,
        `TRIMP:         ${formatNumber(formattedActivity.trimp, 1)} | Decoupling: ${formatNumber(formattedActivity.decoupling, 1)}%`,
        `HRR (recovery): ${formatRounded(hrr.start_bpm)}→${formatRounded(hrr.end_bpm)} bpm in ${formatRounded((hrr.end_time || 0) - (hrr.start_time || 0))}s (-${formatRounded(hrr.hrr)} bpm)`,
        "",
        section("TRAINING LOAD"),
        `Power load:    ${formatRounded(formattedActivity.power_load)} | HR load: ${formatRounded(formattedActivity.hr_load)} (${formattedActivity.hr_load_type || "-"})`,
        `Training load: ${formatRounded(formattedActivity.icu_training_load)} | Strain score: ${formatNumber(formattedActivity.strain_score, 1)}`,
        `ATL:           ${formatNumber(formattedActivity.icu_atl, 1)} | CTL: ${formatNumber(formattedActivity.icu_ctl, 1)}`,
        `Intensity:     ${formatPercent(formattedActivity.icu_intensity, 0)}%`,
        "",
        section("POWER ZONES"),
        `Thresholds: ${formatPowerZoneThresholds(formattedActivity.icu_power_zones, formattedActivity.icu_ftp)}`,
        `Sweet spot: ${formatPowerRange(formattedActivity.icu_sweet_spot_min, formattedActivity.icu_sweet_spot_max, formattedActivity.icu_ftp)}`,
        "",
        "Time in zone:",
        ...splitZoneLines(formatZoneTimes(formattedActivity.icu_zone_times)),
        "",
        section("HR ZONES"),
        `Thresholds (bpm): ${formatZoneThresholds(formattedActivity.icu_hr_zones, "")}`,
        "",
        "Time in zone:",
        ...splitZoneLines(formatZoneTimes(formattedActivity.icu_hr_zone_times)),
        "",
        section("INTERVALS (auto-detected groups)"),
        ...formatActivityGroups(formattedActivity.icu_groups),
        "",
        section("ACHIEVEMENTS"),
        ...formatAchievements(formattedActivity.icu_achievements),
        "",
        section("LAPS"),
        ...formatLaps(formattedActivity.laps),
        "",
        section("WEATHER"),
        `Temp: ${formatNumber(formattedActivity.average_weather_temp, 1)}°C (feels like ${formatNumber(formattedActivity.average_feels_like, 1)}°C) | Range: ${formatNumber(formattedActivity.min_weather_temp, 1)}–${formatNumber(formattedActivity.max_weather_temp, 1)}°C`,
        `Wind: ${formatNumber(formattedActivity.average_wind_speed, 1)} m/s avg, gusts ${formatNumber(formattedActivity.average_wind_gust, 1)} m/s | Direction: ${formatCompassDirection(formattedActivity.prevailing_wind_deg)} (${formatRounded(formattedActivity.prevailing_wind_deg)}°)`,
        `Headwind: ${formatPercent(formattedActivity.headwind_percent, 0)}% | Tailwind: ${formatPercent(formattedActivity.tailwind_percent, 0)}% | Cloud cover: ${formatRounded(formattedActivity.average_clouds)}%`,
        `Rain: ${formatRounded(formattedActivity.max_rain)} | Snow: ${formatRounded(formattedActivity.max_snow)}`,
        "",
        section("ATHLETE PROFILE (at time of activity)"),
        `Weight: ${formatRounded(formattedActivity.icu_weight)} kg | FTP: ${formatRounded(formattedActivity.icu_ftp)}w (${wattsPerKg} w/kg)`,
        `LTHR: ${formatRounded(formattedActivity.lthr)} bpm | RHR: ${formatRounded(formattedActivity.icu_resting_hr)} bpm`,
        `VO2Max (Garmin): ${formatNumber(formattedActivity.VO2MaxGarmin, 1)} ml/kg/min`,
    ].join("\n");
}

function createServer() {
    const server = new McpServer({
        name: "intervals-icu-mcp",
        version: "1.0.0",
    });

    server.registerResource(
        "Recent Activities",
        "intervals://activities/recent",
        {
            description: "Fetch recent Ride and VirtualRide activities (last 30 days)",
            mimeType: "text/plain",
        },
        async (uri) => {
            const activities = await client.getRecentActivities();
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "text/plain",
                        text: formatRecentActivities(activities),
                    },
                ],
            };
        }
    );

    server.registerResource(
        "Current Wellness Metrics",
        "intervals://wellness/current",
        {
            description: "Fetch recent wellness data including sleep score, heart rate, and HRV (last 7 days)",
            mimeType: "text/plain",
        },
        async (uri) => {
            const wellness = await client.getRecentWellness();
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "text/plain",
                        text: formatRecentWellness(wellness),
                    },
                ],
            };
        }
    );

    server.registerResource(
        "Activity Details",
        new ResourceTemplate("intervals://activities/{activityId}", { list: undefined }),
        {
            description: "Fetch details and laps for a specific activity by its ID",
            mimeType: "text/plain",
        },
        async (uri, { activityId }) => {
            const activity = await client.getActivity(String(activityId), true);
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "text/plain",
                        text: formatActivityDetails(activity),
                    },
                ],
            };
        }
    );

    server.registerTool(
        "get_recent_activities",
        {
            description: "Fetch recent Ride and VirtualRide activities for the athlete. Default is last 30 days.",
            inputSchema: {
                daysBack: z.number().optional().describe("Number of days back to fetch activities for. Defaults to 30.")
            }
        },
        async ({ daysBack }) => {
            try {
                const activities = await client.getRecentActivities(daysBack);
                return {
                    content: [{ type: "text", text: formatRecentActivities(activities) }]
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error fetching activities: ${error.message}` }]
                };
            }
        }
    );

    server.registerTool(
        "get_activity",
        {
            description: "Fetch details for a specific activity by its ID. Includes lap details (average power, NP, time spent, average bpm, watts without coasting).",
            inputSchema: {
                activityId: z.string().describe("The ID of the activity to fetch")
            }
        },
        async ({ activityId }) => {
            try {
                const activity = await client.getActivity(activityId, true);

                return {
                    content: [{ type: "text", text: formatActivityDetails(activity) }]
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error fetching activity details: ${error.message}` }]
                };
            }
        }
    );

    server.registerTool(
        "get_recent_wellness",
        {
            description: "Fetch recent wellness data including sleep score, heart rate, and HRV. Default is last 7 days.",
            inputSchema: {
                daysBack: z.number().optional().describe("Number of days back to fetch wellness data for. Defaults to 7.")
            }
        },
        async ({ daysBack }) => {
            try {
                const wellness = await client.getRecentWellness(daysBack);
                return {
                    content: [{ type: "text", text: formatRecentWellness(wellness) }]
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error fetching wellness data: ${error.message}` }]
                };
            }
        }
    );

    return server;
}

async function runStdio() {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

async function runHttp() {
    const host = process.env.MCP_HOST || "127.0.0.1";
    const port = Number(process.env.MCP_PORT || "3030");
    const path = process.env.MCP_PATH || "/mcp";
    const displayHost = host === "0.0.0.0" || host === "::" ? "localhost" : host;
    const url = `http://${displayHost}:${port}${path}`;
    const app = createMcpExpressApp({ host });

    app.post(path, async (req: any, res: any) => {
        const server = createServer();
        try {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
            });
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            res.on("close", () => {
                console.log("Request closed");
                transport.close();
                server.close();
            });
        } catch (error) {
            console.error("Error handling MCP request:", error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32603,
                        message: "Internal server error",
                    },
                    id: null,
                });
            }
        }
    });

    app.get(path, async (_req: any, res: any) => {
        console.log("Received GET MCP request");
        res.writeHead(405).end(
            JSON.stringify({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Method not allowed.",
                },
                id: null,
            })
        );
    });

    app.delete(path, async (_req: any, res: any) => {
        console.log("Received DELETE MCP request");
        res.writeHead(405).end(
            JSON.stringify({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Method not allowed.",
                },
                id: null,
            })
        );
    });

    await new Promise<void>((resolve, reject) => {
        const httpServer = app.listen(port, host, () => {
            resolve();
        });

        httpServer.once("error", reject);
    });

    console.log("Intervals.icu MCP Server running with Streamable HTTP");
    console.log(`MCP URL: ${url}`);
    console.log("Use that URL in clients that require Remote MCP configuration.");
}

async function main() {
    if (process.argv.includes("--http") || process.env.MCP_TRANSPORT === "http") {
        await runHttp();
        return;
    }

    await runStdio();
}

main().catch((error) => {
    console.error("Server fatal error:", error);
    process.exit(1);
});
