import { IntervalsClient } from "./src/intervalsClient.js";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const API_KEY = process.env.INTERVALS_API_KEY;
    const ATHLETE_ID = process.env.INTERVALS_ATHLETE_ID || "0";

    if (!API_KEY) {
        console.error("No API KEY");
        return;
    }

    const client = new IntervalsClient({
        apiKey: API_KEY,
        athleteId: ATHLETE_ID
    });

    const activities = await client.getRecentActivities(30);
    if (!activities || activities.length === 0) {
        console.log("No recent activities");
        return;
    }

    const activityId = activities[0].id;
    console.log("Activity ID:", activityId);

    const base64Auth = Buffer.from(`API_KEY:${API_KEY}`).toString("base64");

    // Fetch with ?intervals=true
    const url = `https://intervals.icu/api/v1/activity/${activityId}?intervals=true`;
    console.log("Fetching", url);
    const res = await fetch(url, {
        headers: {
            "Authorization": `Basic ${base64Auth}`,
            "Accept": "application/json"
        }
    });

    if (!res.ok) {
        console.error("Failed to fetch", await res.text());
        return;
    }

    const activity = await res.json();
    console.log("Intervals present:", !!activity.icu_intervals);
    if (activity.icu_intervals && activity.icu_intervals.length > 0) {
        console.log("First interval keys:", Object.keys(activity.icu_intervals[0]));
        console.log("First interval:", JSON.stringify(activity.icu_intervals[0], null, 2));
    }
}

main().catch(console.error);
