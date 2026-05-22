interface IntervalsClientConfig {
    apiKey: string;
    athleteId: string;
}
export declare class IntervalsClient {
    private base64Auth;
    private athleteId;
    constructor(config: IntervalsClientConfig);
    private fetchApi;
    /**
     * Fetches recent activities for the athlete.
     * By default, fetches activities from the last 30 days.
     */
    getRecentActivities(daysBack?: number): Promise<any>;
    /**
     * Fetches a specific activity by its ID
     */
    getActivity(activityId: string): Promise<any>;
    /**
     * Fetches recent wellness data (sleep, HRV, resting HR, etc.)
     * By default, fetches data from the last 7 days.
     */
    getRecentWellness(daysBack?: number): Promise<any>;
}
export {};
//# sourceMappingURL=intervalsClient.d.ts.map