"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntervalsClient = void 0;
const API_BASE = "https://intervals.icu/api/v1";
class IntervalsClient {
    base64Auth;
    athleteId;
    constructor(config) {
        this.athleteId = config.athleteId;
        // Intervals.icu basic auth uses the literal string "API_KEY" as username
        // and the actual generated token as the password
        this.base64Auth = Buffer.from(`API_KEY:${config.apiKey}`).toString("base64");
    }
    async fetchApi(endpoint, params) {
        const url = new URL(`${API_BASE}${endpoint}`);
        if (params) {
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined) {
                    url.searchParams.append(key, value);
                }
            }
        }
        const response = await fetch(url.toString(), {
            headers: {
                "Authorization": `Basic ${this.base64Auth}`,
                "Accept": "application/json"
            }
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Intervals.icu API HTTP error! status: ${response.status}, message: ${text}`);
        }
        return (await response.json());
    }
    /**
     * Fetches recent activities for the athlete.
     * By default, fetches activities from the last 30 days.
     */
    async getRecentActivities(daysBack = 30) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - daysBack);
        // Format YYYY-MM-DD
        const oldest = startDate.toISOString().split("T")[0];
        const newest = endDate.toISOString().split("T")[0];
        return this.fetchApi(`/athlete/${this.athleteId}/activities`, {
            oldest,
            newest
        });
    }
    /**
     * Fetches a specific activity by its ID
     */
    async getActivity(activityId, intervals = false) {
        const params = intervals ? { intervals: "true" } : undefined;
        return this.fetchApi(`/activity/${activityId}`, params);
    }
    /**
     * Fetches the 1 second resolution streams of an activity
     * (time, watts, heartrate, cadence, distance, altitude, ...)
     */
    async getActivityStreams(activityId, streams) {
        return this.fetchApi(`/activity/${activityId}/streams`, {
            streams: streams.join(",")
        });
    }
    /**
     * Fetches recent wellness data (sleep, HRV, resting HR, etc.)
     * By default, fetches data from the last 7 days.
     */
    async getRecentWellness(daysBack = 7) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - daysBack);
        // Format YYYY-MM-DD
        const oldest = startDate.toISOString().split("T")[0];
        const newest = endDate.toISOString().split("T")[0];
        return this.fetchApi(`/athlete/${this.athleteId}/wellness`, {
            oldest,
            newest
        });
    }
}
exports.IntervalsClient = IntervalsClient;
