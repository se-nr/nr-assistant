/**
 * TypeScript interfaces for Dashboard API responses.
 * Used by MCP tools that call dashboardFetch().
 */

// ─── /api/dashboard/insights ─────────────────────────────────────────────────

export interface InsightsSummary {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  cpc: number;
  cpm: number;
  ctr: number;
  purchases: number;
  purchase_value: number;
  roas: number;
  cpa: number;
  add_to_cart: number;
  checkouts_initiated: number;
  content_views: number;
  landing_page_views: number;
  video_views: number;
  thumbstop_ratio: number;
  hook_rate: number;
  hold_rate: number;
}

export interface ChannelBreakdownItem {
  channel: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchase_value: number;
  roas: number;
  ctr: number;
  cpa: number;
}

export interface InsightsResponse {
  summary: InsightsSummary | null;
  comparisonSummary: InsightsSummary | null;
  daily: Array<{ date: string; spend: number; roas: number; purchases: number; purchase_value: number; impressions: number; ctr: number; cpc: number }>;
  channelBreakdown: ChannelBreakdownItem[];
  mtdData: { spend: number; purchase_value: number } | null;
  yesterdayData: { spend: number; purchase_value: number } | null;
}

// ─── /api/internal/top-ads ───────────────────────────────────────────────────

export interface TopAd {
  ad_id: string;
  name: string;
  spend: number;
  roas: number;
  purchases: number;
  ctr: number;
  cpa: number;
  purchase_value: number;
}

export interface TopAdsResponse {
  ads: TopAd[];
  sort_by: string;
  limit: number;
}

// ─── /api/internal/demographics ──────────────────────────────────────────────

export interface DemographicRow {
  dimension: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  roas: number;
  ctr: number;
}

export interface DemographicsResponse {
  breakdown: string;
  data: DemographicRow[];
}

// ─── /api/internal/targets ───────────────────────────────────────────────────

export interface TargetsResponse {
  clientName: string;
  targets: Record<string, any>;
  actuals: {
    roas: number;
    ctr: number;
    cpa: number;
    cpm: number;
    spend: number;
    purchases: number;
    purchaseValue: number;
  };
  period: { since: string; until: string };
}

// ─── /api/lead-cohorts ───────────────────────────────────────────────────────

export interface LeadCohortMetric {
  daysSinceLead: number;
  convRate: number;
  revenue: number;
  roas: number;
}

export interface LeadCohortAdSet {
  adSetName: string;
  leads: number;
  convRate: number;
  revenue: number;
  revPerLead: number;
}

export interface LeadCohort {
  month: string;
  leadsCount: number;
  metrics: LeadCohortMetric[];
  byAdSet: LeadCohortAdSet[];
  adSpend: number;
  costPerLead: number;
  totalRevenue: number;
  roas: number;
  totalRoas: number;
}

export interface LeadCohortSummary {
  totalLeads: number;
  totalConverted: number;
  overallConvRate: number;
  costPerLead: number;
}

export interface LeadCohortsResponse {
  cohorts: LeadCohort[];
  summary: LeadCohortSummary;
}
