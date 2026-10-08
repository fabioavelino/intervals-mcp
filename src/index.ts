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

const MINUTE_STREAMS = ["watts", "heartrate", "cadence", "distance", "altitude"];
const NORMALIZED_POWER_WINDOW = 30;
const ELEVATION_NOISE_THRESHOLD = 1;
const CROSS_BUCKET_GAP_LIMIT = 3;
const WORK_INTERVAL_TYPE = "WORK";
const MISSING = "-";

function formatMinuteClock(totalSeconds: unknown): string {
    const seconds = typeof totalSeconds === "number" && Number.isFinite(totalSeconds)
        ? Math.max(0, Math.round(totalSeconds))
        : 0;

    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function toStreamMap(streams: unknown): Map<string, number[]> {
    const map = new Map<string, number[]>();

    if (Array.isArray(streams)) {
        for (const stream of streams) {
            if (!stream || typeof stream !== "object") {
                continue;
            }

            const key = typeof (stream as any).name === "string" ? (stream as any).name : (stream as any).type;
            if (typeof key === "string" && Array.isArray((stream as any).data)) {
                map.set(key, (stream as any).data);
            }
        }
    }

    return map;
}

function rollingAverage(values: number[], window: number): number[] {
    const result = new Array<number>(values.length);
    const sample = (index: number) => (typeof values[index] === "number" && Number.isFinite(values[index]) ? values[index] : 0);
    let sum = 0;

    for (let index = 0; index < values.length; index++) {
        sum += sample(index);
        if (index >= window) {
            sum -= sample(index - window);
        }
        result[index] = sum / Math.min(index + 1, window);
    }

    return result;
}

function mean(values: number[]): number | null {
    return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function buildPowerZoneThresholds(zones: unknown, ftp: unknown): number[] {
    if (!Array.isArray(zones) || typeof ftp !== "number" || !Number.isFinite(ftp) || ftp <= 0) {
        return [];
    }

    return zones
        .filter((zone): zone is number => typeof zone === "number" && Number.isFinite(zone) && zone < 999)
        .map((zone) => (zone / 100) * ftp);
}

function powerZoneFor(watts: number, thresholds: number[]): number {
    for (let index = 0; index < thresholds.length; index++) {
        if (watts < thresholds[index]) {
            return index + 1;
        }
    }

    return thresholds.length + 1;
}

function formatPowerZoneLegend(zones: unknown, ftp: unknown): string {
    const thresholds = buildPowerZoneThresholds(zones, ftp);
    if (thresholds.length === 0) {
        return "";
    }

    const parts = thresholds.map((threshold, index) => `Z${index + 1}<${Math.round(threshold)}w`);
    parts.push(`Z${thresholds.length + 1}+`);

    return `${parts.join(" | ")} (FTP ${formatRounded(ftp)}w)`;
}

interface MinuteRow {
    elapsed: number;
    bucketSeconds: number;
    stop: boolean;
    segment: number | null;
    zoneSeconds: number[];
    power: number | null;
    normalized: number | null;
    peak: number | null;
    wattsMoving: number | null;
    coastSecs: number;
    zone: number | null;
    heartRate: number | null;
    heartRateMax: number | null;
    cadence: number | null;
    speedKph: number | null;
    distance: number | null;
    elevation: string | null;
}

function buildMinuteRows(
    streamMap: Map<string, number[]>,
    segments: Array<{ start: number; end: number; work: boolean }>,
    thresholds: number[],
    bucketSeconds: number
): MinuteRow[] {
    const time = streamMap.get("time") || [];
    const watts = streamMap.get("watts");
    const heartRate = streamMap.get("heartrate");
    const cadence = streamMap.get("cadence");
    const distance = streamMap.get("distance");
    const altitude = streamMap.get("altitude");
    const hasPower = Array.isArray(watts) && watts.length > 0;

    const rolling = hasPower ? rollingAverage(watts as number[], NORMALIZED_POWER_WINDOW) : [];
    const buckets = new Map<number, number[]>();

    for (let index = 0; index < time.length; index++) {
        const elapsed = typeof time[index] === "number" && Number.isFinite(time[index]) ? time[index] : index;
        const key = Math.floor(elapsed / bucketSeconds);
        const bucket = buckets.get(key);
        if (bucket) {
            bucket.push(index);
        } else {
            buckets.set(key, [index]);
        }
    }

    const rows: MinuteRow[] = [];
    const firstKey = Math.min(...buckets.keys());
    const lastKey = Math.max(...buckets.keys());

    for (let key = firstKey; key <= lastKey; key++) {
        const indices = buckets.get(key);
        const elapsed = key * bucketSeconds;
        const activeSegment = segments.findIndex((segment) => elapsed >= segment.start && elapsed < segment.end);

        if (segments.length > 0 && (activeSegment < 0 || !segments[activeSegment].work)) {
            continue;
        }

        if (!indices) {
            rows.push({
                elapsed,
                bucketSeconds,
                stop: true,
                segment: activeSegment >= 0 ? activeSegment + 1 : null,
                zoneSeconds: [],
                power: null,
                normalized: null,
                peak: null,
                wattsMoving: null,
                coastSecs: 0,
                zone: null,
                heartRate: null,
                heartRateMax: null,
                cadence: null,
                speedKph: null,
                distance: null,
                elevation: null
            });
            continue;
        }

        const last = indices[indices.length - 1];
        const previous = indices[0] - 1;
        const start = previous >= 0 && (time[last] ?? 0) - (time[previous] ?? 0) <= CROSS_BUCKET_GAP_LIMIT
            ? previous
            : indices[0];

        const slice = (values: number[] | undefined, keep: (value: number) => boolean) => {
            if (!values) {
                return [];
            }
            return indices.map((index) => values[index]).filter((value) => typeof value === "number" && Number.isFinite(value) && keep(value));
        };

        const powerValues = slice(watts, (value) => value >= 0);
        const power = mean(powerValues);
        const normalized = mean(
            indices
                .filter((index) => typeof rolling[index] === "number")
                .map((index) => Math.pow(rolling[index], 4))
        );
        const coastIndices = indices.filter((index) => {
            const w = watts?.[index];
            const c = cadence?.[index];
            return typeof w === "number" && w <= 5 && (typeof c !== "number" || c <= 5);
        });
        const coastSet = new Set(coastIndices);
        const movingValues = indices
            .filter((index) => !coastSet.has(index))
            .map((index) => watts?.[index])
            .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

        const heartRateValues = slice(heartRate, (value) => value > 0);
        const cadenceValues = slice(cadence, (value) => value > 0);

        let distanceMeters: number | null = null;
        let speedKph: number | null = null;
        if (distance && distance.length > 0) {
            let meters = 0;
            let span = 0;
            for (let index = start; index <= last; index++) {
                const gap = (time[index] ?? 0) - (time[index - 1] ?? 0);
                if (gap > 0 && typeof distance[index] === "number" && typeof distance[index - 1] === "number") {
                    meters += distance[index] - distance[index - 1];
                    span += Math.min(gap, bucketSeconds);
                }
            }
            distanceMeters = meters;
            speedKph = span > 0 ? (meters / span) * 3.6 : null;
        }

        let elevation: string | null = null;
        if (altitude && altitude.length > 0) {
            let gain = 0;
            let loss = 0;
            let pendingGain = 0;
            let pendingLoss = 0;
            for (let index = start + 1; index <= last; index++) {
                const current = altitude[index];
                const previousAltitude = altitude[index - 1];
                if (typeof current !== "number" || typeof previousAltitude !== "number") {
                    continue;
                }
                const delta = current - previousAltitude;
                if (delta > 0) {
                    pendingGain += delta;
                    if (pendingGain >= ELEVATION_NOISE_THRESHOLD) {
                        gain += pendingGain;
                        pendingGain = 0;
                    }
                } else if (delta < 0) {
                    pendingLoss += -delta;
                    if (pendingLoss >= ELEVATION_NOISE_THRESHOLD) {
                        loss += pendingLoss;
                        pendingLoss = 0;
                    }
                }
            }
            elevation = gain > 0 || loss > 0
                ? `${gain > 0 ? `+${Math.round(gain)}` : ""}${gain > 0 && loss > 0 ? "/" : ""}${loss > 0 ? `-${Math.round(loss)}` : ""}`
                : "0";
        }

        const movingPower = mean(movingValues);
        const zone = power !== null && power > 5 && thresholds.length > 0 ? powerZoneFor(power, thresholds) : null;
        const zoneSeconds: number[] = [];

        if (hasPower && thresholds.length > 0) {
            for (const index of indices) {
                const value = watts?.[index];
                const sampleTime = time[index] ?? index;
                if (typeof value !== "number" || value <= 0) {
                    continue;
                }
                if (activeSegment >= 0 && (sampleTime < segments[activeSegment].start || sampleTime >= segments[activeSegment].end)) {
                    continue;
                }
                const sampleZone = powerZoneFor(value, thresholds) - 1;
                zoneSeconds[sampleZone] = (zoneSeconds[sampleZone] || 0) + 1;
            }
        }

        rows.push({
            elapsed,
            bucketSeconds,
            stop: false,
            segment: activeSegment >= 0 ? activeSegment + 1 : null,
            zoneSeconds,
            power,
            normalized: normalized === null ? null : Math.round(Math.pow(normalized, 0.25)),
            peak: powerValues.length > 0 ? Math.max(...powerValues) : null,
            wattsMoving: movingPower,
            coastSecs: coastIndices.length,
            zone,
            heartRate: mean(heartRateValues),
            heartRateMax: heartRateValues.length > 0 ? Math.max(...heartRateValues) : null,
            cadence: mean(cadenceValues),
            speedKph,
            distance: distanceMeters,
            elevation
        });
    }

    return rows;
}

const MINUTE_COLUMNS: Array<{ key: string; legend: string; get: (row: MinuteRow) => string }> = [
    { key: "T", legend: "T=elapsed start (m:ss)", get: (row) => (row.stop ? `${formatMinuteClock(row.elapsed)}-${formatMinuteClock(row.elapsed + row.bucketSeconds)}` : formatMinuteClock(row.elapsed)) },
    { key: "Pwr", legend: "Pwr/NP/Max/WoC in W", get: (row) => formatRounded(row.power) },
    { key: "NP", legend: "", get: (row) => formatRounded(row.normalized) },
    { key: "Max", legend: "", get: (row) => formatRounded(row.peak) },
    { key: "WoC", legend: "", get: (row) => formatRounded(row.wattsMoving) },
    { key: "Cst", legend: "Cst=coasting s", get: (row) => (row.coastSecs > 0 ? `${row.coastSecs}s` : MISSING) },
    { key: "Z", legend: "Z=power zone", get: (row) => (row.zone === null ? MISSING : `Z${row.zone}`) },
    { key: "HR", legend: "HR/HRx bpm", get: (row) => formatRounded(row.heartRate) },
    { key: "HRx", legend: "", get: (row) => formatRounded(row.heartRateMax) },
    { key: "Cad", legend: "Cad rpm", get: (row) => formatRounded(row.cadence) },
    { key: "km/h", legend: "km/h", get: (row) => formatNumber(row.speedKph, 1) },
    { key: "Dist", legend: "Dist m", get: (row) => formatRounded(row.distance) },
    { key: "E", legend: "E=elev +gain/-loss m", get: (row) => row.elevation ?? MISSING }
];

function getVisibleMinuteColumns(rows: MinuteRow[]) {
    return MINUTE_COLUMNS.filter((column) => rows.some((row) => column.get(row) !== MISSING));
}

function formatMinuteLegend(columns: ReturnType<typeof getVisibleMinuteColumns>): string {
    return columns.map((column) => column.legend).filter((legend) => legend.length > 0).join(" | ");
}

function formatMinuteRows(rows: MinuteRow[], columns: ReturnType<typeof getVisibleMinuteColumns>): string[] {
    return [
        columns.map((column) => column.key).join(" "),
        ...rows.map((row) => columns.map((column) => column.get(row)).join(" "))
    ];
}

function labeled(label: string, value: string): string {
    return `${label}:`.padEnd(12, " ") + value;
}

function summarizeZoneSeconds(rows: MinuteRow[]): string {
    const totals: number[] = [];

    for (const row of rows) {
        row.zoneSeconds.forEach((seconds, index) => {
            totals[index] = (totals[index] || 0) + seconds;
        });
    }

    return totals
        .map((seconds, index) => ({ zone: index + 1, seconds: seconds || 0 }))
        .filter((entry) => entry.seconds > 0)
        .map((entry) => `Z${entry.zone} ${formatShortDuration(entry.seconds)}`)
        .join(" | ");
}

function formatWorkIntervalSummary(interval: any, rows: MinuteRow[]): string[] {
    if (!interval) {
        return [];
    }

    const averageWatts = interval.average_watts;
    const variability = typeof averageWatts === "number" && averageWatts > 0 && typeof interval.weighted_average_watts === "number"
        ? formatNumber(interval.weighted_average_watts / averageWatts, 2)
        : null;
    const coastSecs = rows.reduce((total, row) => total + row.coastSecs, 0);
    const zoneTimes = summarizeZoneSeconds(rows);
    const wbal = typeof interval.wbal_start === "number" && typeof interval.wbal_end === "number"
        ? `${Math.round(interval.wbal_start)}>${Math.round(interval.wbal_end)}`
        : null;

    return [
        labeled("Duration", [
            formatShortDuration(interval.elapsed_time),
            `${formatKilometers(interval.distance)} km`,
            `+${formatRounded(interval.total_elevation_gain)}m`,
            `${formatKph(interval.average_speed)} km/h`
        ].join(" | ")),
        labeled("Power", [
            `${formatRounded(averageWatts)}w avg`,
            `${formatRounded(interval?.weighted_average_watts)}w NP`,
            variability && `VI ${variability}`,
            `${formatRounded(interval?.max_watts)}w peak`,
            interval?.Wattscleaned ? `w/o coast ${interval.Wattscleaned}` : null,
            coastSecs > 0 ? `${coastSecs}s coast` : null,
            wbal && `W' ${wbal}`
        ].filter((part): part is string => typeof part === "string" && part.length > 0).join(" | ")),
        ...(zoneTimes ? [labeled("Zones", zoneTimes)] : []),
        labeled("Heart rate", [
            `${formatRounded(interval.average_heartrate)} bpm avg`,
            typeof interval.max_heartrate === "number" ? `max ${formatRounded(interval.max_heartrate)}` : null,
            `${formatRounded(interval.average_cadence)} rpm`
        ].filter((part): part is string => typeof part === "string" && part.length > 0).join(" | "))
    ];
}

function formatActivityMinutes(activity: any, streams: unknown, bucketMinutes: number): string {
    const streamMap = toStreamMap(streams);
    const bucketSeconds = Math.max(1, Math.round(bucketMinutes)) * 60;
    const intervals: any[] = Array.isArray(activity.icu_intervals) ? activity.icu_intervals : [];
    const thresholds = buildPowerZoneThresholds(activity.icu_power_zones, activity.icu_ftp);
    const segments = intervals
        .map((interval: any) => ({
            start: interval.start_time,
            end: interval.end_time,
            work: String(interval.type || "").toUpperCase() === WORK_INTERVAL_TYPE
        }))
        .filter((segment: any) => typeof segment.start === "number" && typeof segment.end === "number");

    const minuteRows = buildMinuteRows(streamMap, segments, thresholds, bucketSeconds);

    if (minuteRows.length === 0) {
        const detectedTypes = [...new Set(intervals.map((interval: any) => String(interval.type || MISSING).toUpperCase()))];
        return [
            `${activity.type || "Activity"}: ${activity.name || "-"}, ${formatDateMinute(activity.start_date_local)} | ${formatDuration(activity.icu_recording_time)} recorded`,
            "",
            section(`${WORK_INTERVAL_TYPE} INTERVALS`),
            (streamMap.get("time") || []).length > 0
                ? `No minutes inside ${WORK_INTERVAL_TYPE} intervals (detected types: ${detectedTypes.join(", ") || "none"}).`
                : "No stream data available for this activity."
        ].join("\n");
    }

    const groups = new Map<number | null, MinuteRow[]>();
    for (const row of minuteRows) {
        const group = groups.get(row.segment);
        if (group) {
            group.push(row);
        } else {
            groups.set(row.segment, [row]);
        }
    }

    const columns = getVisibleMinuteColumns(minuteRows);
    const zoneLegend = minuteRows.some((row) => row.zone !== null)
        ? formatPowerZoneLegend(activity.icu_power_zones, activity.icu_ftp)
        : "";
    const workDuration = formatDuration(
        segments.filter((segment: any) => segment.work).reduce((total: number, segment: any) => total + (segment.end - segment.start), 0)
    );
    const bucketLabel = bucketSeconds === 60 ? "minute by minute" : `${bucketMinutes} min buckets`;
    const lines: string[] = [
        [
            `${activity.type || "Activity"}: ${activity.name || "-"}, ${formatDateMinute(activity.start_date_local)}`,
            `${formatDuration(activity.icu_recording_time)} recorded`,
            `${workDuration} in ${groups.size} ${WORK_INTERVAL_TYPE} interval${groups.size > 1 ? "s" : ""}`,
            bucketLabel
        ].filter((part) => part).join(" | "),
        ...(zoneLegend ? [`Zones: ${zoneLegend}`] : []),
        "",
        formatMinuteLegend(columns),
        ""
    ];

    let first = true;
    for (const [segmentNumber, rows] of groups) {
        const interval = segmentNumber === null ? null : intervals[(segmentNumber as number) - 1];
        const title = segmentNumber === null
            ? `MINUTES OUTSIDE ANY INTERVAL ${formatMinuteClock(rows[0].elapsed)}-${formatMinuteClock(rows[rows.length - 1].elapsed)}`
            : `INTERVAL ${segmentNumber} ${WORK_INTERVAL_TYPE} ${formatMinuteClock(interval.start_time)}-${formatMinuteClock(interval.end_time)}`;

        if (!first) {
            lines.push("");
        }
        first = false;
        lines.push(section(title));
        lines.push(...formatWorkIntervalSummary(interval, rows));
        lines.push(...formatMinuteRows(rows, columns));
    }

    return lines.join("\n");
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

    server.registerResource(
        "Activity Minutes",
        new ResourceTemplate("intervals://activities/{activityId}/minutes", { list: undefined }),
        {
            description: "Fetch the minute by minute breakdown of an activity plus its detected intervals",
            mimeType: "text/plain",
        },
        async (uri, { activityId }) => {
            const [activity, streams] = await Promise.all([
                client.getActivity(String(activityId), true),
                client.getActivityStreams(String(activityId), MINUTE_STREAMS)
            ]);
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "text/plain",
                        text: formatActivityMinutes(activity, streams, 1),
                    },
                ],
            };
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

    server.registerTool(
        "get_activity_minutes",
        {
            description: "Fetch the WORK intervals of an activity (intervals=true), group their 1s streams per interval and return, for each one, a summary (duration, distance, elevation, speed, average/NP/VI/peak power, watts without coasting, time in power zone, HR, cadence, W' balance) followed by its minute by minute rows (power, NP, peak, watts without coasting, coasting, zone, HR, cadence, speed, distance, elevation).",
            inputSchema: {
                activityId: z.string().describe("The ID of the activity to fetch"),
                bucketMinutes: z.number().optional().describe("Aggregate the table into buckets of N minutes instead of 1. Defaults to 1.")
            }
        },
        async ({ activityId, bucketMinutes }) => {
            try {
                const [activity, streams] = await Promise.all([
                    client.getActivity(activityId, true),
                    client.getActivityStreams(activityId, MINUTE_STREAMS)
                ]);

                return {
                    content: [{ type: "text", text: formatActivityMinutes(activity, streams, bucketMinutes ?? 1) }]
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error fetching activity minutes: ${error.message}` }]
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
