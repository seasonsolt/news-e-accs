// What the growth endpoints return (packages/backend/src/admin/growth.ts, admin/analytics.ts, admin/metrics.ts).

export interface Range { range: string; from: string; to: string; days: number; previous: { from: string; to: string } }
export type Filters = Record<string, string>;

export interface Totals {
  visitors: number;
  newVisitors: number;
  sessions: number;
  views: number;
  bounces: number;
  engagedSessions: number;
  engagedMs: number;
  durationMs: number;
  conversions: number;
}

export interface SeriesPoint { bucket: string; visitors: number; sessions: number; views: number; bounces: number }
export interface BreakdownRow { key: string; visitors: number; sessions: number; views: number; bounces: number; engagedMs: number; conversions: number }
export interface PageRow { key: string; views: number; sessions: number; entries: number; exits: number; engagedMs: number }

export interface GrowthOverview {
  range: Range;
  filters: Filters;
  goal: string;
  goals: string[];
  channels: string[];
  since: string | null;
  hourly: boolean;
  totals: Totals;
  previous: Totals;
  series: SeriesPoint[];
  previousSeries: SeriesPoint[];
  breakdowns: Record<string, BreakdownRow[]> & { page: PageRow[]; page_path: PageRow[] };
  events: Array<{ key: string; count: number; sessions: number }>;
  filtered: Array<{ reason: string; count: number }>;
  live: { visitors: number; sessions: number; pages: Array<{ key: string; sessions: number }>; views: number[] };
}

export interface FunnelData {
  range: Range;
  filters: Filters;
  steps: Array<{ kind: "view" | "event"; value: string; sessions: number }>;
  events: string[];
  routes: string[];
}

export interface RetentionData { weeks: number; start: string; filters: Filters; since: string | null; cohorts: Array<{ cohort: string; weeks: number[] }> }
export interface JourneysData { range: Range; filters: Filters; depth: number; journeys: Array<{ path: string[]; sessions: number }> }

export interface EngagementData {
  days: number;
  mcp: {
    totals: { calls: number; successes: number; errors: number; initializes: number; discoveries: number; checks: number; activeDays: number; averageMs: number; maxMs: number; lastCallAt: string | null };
    daily: Array<{ day: string; calls: number; successes: number }>;
    tools: Array<{ tool: string; calls: number; successes: number; errors: number; averageMs: number; maxMs: number; lastCallAt: string }>;
    errors: Array<{ outcome: string; calls: number }>;
  };
  engagement: {
    totals: Array<{ event: string; count: number }>;
    daily: Array<{ day: string; counts: Record<string, number | null> }>;
    firstDays: Record<string, string | null>;
    firstStarDevices: number;
    topStarred: Array<{ id: string; title: string | null; net: number }>;
    /** The chronicle's walk: opened (page views of both editions), started, places reached, acts, where and when it was left, finished. */
    walk: {
      views: number;
      starts: number;
      finishes: number;
      reached: Array<{ place: string; count: number }>;
      acts: Array<{ act: string; count: number }>;
      left: Array<{ place: string; count: number }>;
      times: Array<{ time: string; count: number }>;
    };
  };
}

export interface FunnelCount { event: string; source: string; locale: string; reason: string; count: number }
export interface SubscribeFunnel { days: number; firstDays: Record<string, string | null>; daily: Array<{ day: string; counts: FunnelCount[] }>; totals: FunnelCount[] }

export interface QueryReading { page: string; query: string; clicks: number; impressions: number; ctr: number; position: number }
export interface SectionReading { clicks: number; impressions: number; inspected: number; indexed: number; reasons?: Record<string, number> }
export interface WeeklyReading {
  week: string;
  end: string;
  partial: boolean;
  days: number;
  views: number;
  sections: Record<string, number>;
  subscribers: number;
  signups: number;
  confirmations: number;
  distribution: Array<{ channel: string; visits: number; reads: number; confirmations: number }>;
  confirmationsBySource: Array<{ source: string | null; count: number }>;
  search: { clicks: number; impressions: number; inspected: number; indexed: number; sections: Record<string, SectionReading>; pageQueries: { property: string; rows: QueryReading[]; limitReached: boolean } | null } | null;
}
export interface WeeklyData { weeks: number; rows: WeeklyReading[]; searchConsole: { enabled: boolean } }
