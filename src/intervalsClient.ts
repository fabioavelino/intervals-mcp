import { z } from "zod";

const API_BASE = "https://intervals.icu/api/v1";

interface IntervalsClientConfig {
    apiKey: string;
    athleteId: string;
}

export class IntervalsClient {
    private base64Auth: string;
    private athleteId: string;

    constructor(config: IntervalsClientConfig) {
        this.athleteId = config.athleteId;

        // Intervals.icu basic auth uses the literal string "API_KEY" as username
        // and the actual generated token as the password
        this.base64Auth = Buffer.from(`API_KEY:${config.apiKey}`).toString("base64");
    }

    private async fetchApi<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
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

        return (await response.json()) as T;
    }

    /**
     * Fetches recent activities for the athlete.
     * By default, fetches activities from the last 30 days.
     */
    async getRecentActivities(daysBack: number = 30): Promise<any> {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - daysBack);

        // Format YYYY-MM-DD
        const oldest = startDate.toISOString().split("T")[0];
        const newest = endDate.toISOString().split("T")[0];

        return this.fetchApi<any>(`/athlete/${this.athleteId}/activities`, {
            oldest,
            newest
        });
    }

    /**
     * Fetches a specific activity by its ID
     */
    async getActivity(activityId: string, intervals: boolean = false): Promise<any> {
        const params = intervals ? { intervals: "true" } : undefined;
        return this.fetchApi<any>(`/activity/${activityId}`, params);
    }

    /**
     * Fetches recent wellness data (sleep, HRV, resting HR, etc.)
     * By default, fetches data from the last 7 days.
     */
    async getRecentWellness(daysBack: number = 7): Promise<any> {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - daysBack);

        // Format YYYY-MM-DD
        const oldest = startDate.toISOString().split("T")[0];
        const newest = endDate.toISOString().split("T")[0];

        return this.fetchApi<any>(`/athlete/${this.athleteId}/wellness`, {
            oldest,
            newest
        });
    }
}
