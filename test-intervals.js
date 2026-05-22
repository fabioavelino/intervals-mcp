const { IntervalsClient } = require('./dist/intervalsClient.js');
const dotenv = require('dotenv');
dotenv.config();

async function main() {
    const client = new IntervalsClient({
        apiKey: process.env.INTERVALS_API_KEY,
        athleteId: process.env.INTERVALS_ATHLETE_ID || "0"
    });
    // First get a recent activity ID
    const activities = await client.getRecentActivities(30);
    if (!activities || activities.length === 0) {
        console.log("No recent activities found");
        return;
    }
    const activityId = activities[0].id;
    console.log("Fetching activity", activityId);
    
    // Now fetch activity with intervals? Wait, the API docs say `?intervals=true` or just get Activity?
    // Let's modify the class temporarily or just use node-fetch to make it easier to add query params if needed.
    const base64Auth = Buffer.from(`API_KEY:${process.env.INTERVALS_API_KEY}`).toString("base64");
    
    // Let's try both paths
    const res = await fetch(`https://intervals.icu/api/v1/activity/${activityId}`, {
        headers: { "Authorization": `Basic ${base64Auth}`, "Accept": "application/json" }
    });
    const activity = await res.json();
    
    const res2 = await fetch(`https://intervals.icu/api/v1/activity/${activityId}?intervals=true`, {
        headers: { "Authorization": `Basic ${base64Auth}`, "Accept": "application/json" }
    });
    const activityWithIntervals = await res2.json();
    
    console.log("Has icu_intervals without param?", !!activity.icu_intervals);
    console.log("Has icu_intervals with param?", !!activityWithIntervals.icu_intervals);
    
    if (activityWithIntervals.icu_intervals && activityWithIntervals.icu_intervals.length > 0) {
        console.log("First interval:", JSON.stringify(activityWithIntervals.icu_intervals[0], null, 2));
    } else {
        console.log("No intervals found in this activity.");
    }
}
main().catch(console.error);
