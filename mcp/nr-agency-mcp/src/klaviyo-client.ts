/**
 * Standalone Klaviyo API client for NR Agency MCP
 *
 * Adapted from neble-rohde-dashboard/src/lib/klaviyo-api.ts
 * No Next.js dependencies — pure fetch().
 */

const BASE_URL = "https://a.klaviyo.com/api";
const API_REVISION = "2024-10-15";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── In-memory cache (per API key) ─────────────────────────────────────────

interface CachedData<T> { data: T; expiresAt: number }
const metricsCache = new Map<string, CachedData<KlaviyoMetric[]>>();
const flowsCache = new Map<string, CachedData<KlaviyoFlow[]>>();

function getCached<T>(cache: Map<string, CachedData<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  if (entry) cache.delete(key);
  return null;
}

function setCache<T>(cache: Map<string, CachedData<T>>, key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KlaviyoMetric {
  id: string;
  name: string;
  integration?: { id: string; name: string };
}

export interface KlaviyoFlow {
  id: string;
  name: string;
  status: "draft" | "manual" | "live" | "archived";
  trigger_type?: string;
  created?: string;
  updated?: string;
}

export interface KlaviyoCampaign {
  id: string;
  name: string;
  status: string;
  channel: "email" | "sms";
  send_time?: string;
  created_at?: string;
  updated_at?: string;
}

export interface KlaviyoSegment {
  id: string;
  name: string;
  created?: string;
  updated?: string;
  is_active?: boolean;
  is_starred?: boolean;
}

export interface KlaviyoList {
  id: string;
  name: string;
  created?: string;
  updated?: string;
  opt_in_process?: string;
}

export interface KlaviyoAggregateResult {
  measurements: { [key: string]: number[] };
  dimensions: string[];
  data: {
    dimensions: string[];
    measurements: { [key: string]: number };
  }[];
}

export interface FlowWithPerformance extends KlaviyoFlow {
  received: number;
  opened: number;
  clicked: number;
  revenue: number;
  openRate: number;
  clickRate: number;
  revenuePerEmail: number;
}

export interface CampaignWithPerformance extends KlaviyoCampaign {
  received: number;
  opened: number;
  clicked: number;
  revenue: number;
  openRate: number;
  clickRate: number;
  ctor: number;
  revenuePerEmail: number;
}

export interface RevenueAttribution {
  flowRevenue: number;
  campaignRevenue: number;
  totalRevenue: number;
  flowPercentage: number;
  campaignPercentage: number;
  topFlows: { id: string; name: string; revenue: number }[];
  topCampaigns: { id: string; name: string; revenue: number }[];
}

export interface SubscriberStats {
  totalProfiles: number;
  lists: { id: string; name: string; profileCount: number }[];
  segments: { id: string; name: string; profileCount: number; isStarred: boolean; isActive: boolean }[];
}

// ─── Base request ────────────────────────────────────────────────────────────

async function klaviyoRequest<T>(
  apiKey: string,
  endpoint: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown>; params?: Record<string, string> } = {},
): Promise<T> {
  const { method = "GET", body, params } = options;

  let url = `${BASE_URL}${endpoint}`;
  if (params) {
    url += `?${new URLSearchParams(params).toString()}`;
  }

  const headers: Record<string, string> = {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    revision: API_REVISION,
    Accept: "application/json",
  };
  if (body) headers["Content-Type"] = "application/json";

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 429) {
      const wait = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Klaviyo API error (${response.status}): ${errorText.slice(0, 200)}`);
    }

    return response.json() as Promise<T>;
  }
  throw new Error("Klaviyo API: rate limited after 3 retries");
}

// ─── List functions ──────────────────────────────────────────────────────────

export async function listMetrics(apiKey: string): Promise<KlaviyoMetric[]> {
  const cached = getCached(metricsCache, apiKey);
  if (cached) return cached;

  const response = await klaviyoRequest<{
    data: { id: string; attributes: { name: string; integration?: { id: string; name: string } } }[];
  }>(apiKey, "/metrics");
  const metrics = response.data.map((m) => ({ id: m.id, name: m.attributes.name, integration: m.attributes.integration }));
  setCache(metricsCache, apiKey, metrics);
  return metrics;
}

export async function listFlows(apiKey: string): Promise<KlaviyoFlow[]> {
  const cached = getCached(flowsCache, apiKey);
  if (cached) return cached;

  const response = await klaviyoRequest<{
    data: { id: string; attributes: { name: string; status: KlaviyoFlow["status"]; trigger_type?: string; created?: string; updated?: string } }[];
  }>(apiKey, "/flows");
  const flows = response.data.map((f) => ({
    id: f.id, name: f.attributes.name, status: f.attributes.status,
    trigger_type: f.attributes.trigger_type, created: f.attributes.created, updated: f.attributes.updated,
  }));
  setCache(flowsCache, apiKey, flows);
  return flows;
}

export async function listCampaigns(
  apiKey: string,
  options: { channel?: "email" | "sms" } = {},
): Promise<KlaviyoCampaign[]> {
  const channel = options.channel || "email";
  const params: Record<string, string> = {
    filter: `equals(messages.channel,'${channel}')`,
  };

  const response = await klaviyoRequest<{
    data: { id: string; attributes: { name: string; status: string; channel: "email" | "sms"; send_time?: string; created_at?: string; updated_at?: string } }[];
  }>(apiKey, "/campaigns", { params });
  return response.data.map((c) => ({
    id: c.id, name: c.attributes.name, status: c.attributes.status,
    channel: c.attributes.channel, send_time: c.attributes.send_time,
    created_at: c.attributes.created_at, updated_at: c.attributes.updated_at,
  }));
}

export async function listSegments(apiKey: string): Promise<KlaviyoSegment[]> {
  const response = await klaviyoRequest<{
    data: { id: string; attributes: { name: string; created?: string; updated?: string; is_active?: boolean; is_starred?: boolean } }[];
  }>(apiKey, "/segments");
  return response.data.map((s) => ({
    id: s.id, name: s.attributes.name, created: s.attributes.created,
    updated: s.attributes.updated, is_active: s.attributes.is_active, is_starred: s.attributes.is_starred,
  }));
}

export async function listLists(apiKey: string): Promise<KlaviyoList[]> {
  const response = await klaviyoRequest<{
    data: { id: string; attributes: { name: string; created?: string; updated?: string; opt_in_process?: string } }[];
  }>(apiKey, "/lists");
  return response.data.map((l) => ({
    id: l.id, name: l.attributes.name, created: l.attributes.created,
    updated: l.attributes.updated, opt_in_process: l.attributes.opt_in_process,
  }));
}

// ─── Metric aggregates ───────────────────────────────────────────────────────

export async function queryMetricAggregates(
  apiKey: string,
  options: {
    metricId: string;
    measurements: ("count" | "sum_value" | "unique")[];
    startDate: string;
    endDate: string;
    interval?: "day" | "week" | "month";
    by?: string[];
    filter?: string[];
  },
): Promise<KlaviyoAggregateResult> {
  const { metricId, measurements, startDate, endDate, interval = "day", by, filter } = options;

  const attributes: Record<string, unknown> = {
    metric_id: metricId,
    measurements,
    interval,
    filter: [`greater-or-equal(datetime,${startDate})`, `less-than(datetime,${endDate})`, ...(filter || [])],
    timezone: "Europe/Copenhagen",
  };
  if (by && by.length > 0) attributes.by = by;

  const response = await klaviyoRequest<{ data: { attributes: KlaviyoAggregateResult } }>(
    apiKey, "/metric-aggregates",
    { method: "POST", body: { data: { type: "metric-aggregate", attributes } } },
  );
  return response.data.attributes;
}

// ─── Measurement helpers ────────────────────────────────────────────────────

function sumArr(arr?: number[]): number {
  return arr?.reduce((a, b) => a + b, 0) || 0;
}

/** Sum a measurement across all data entries (non-by) or from top-level measurements */
function sumMeasurement(result: KlaviyoAggregateResult, key: string): number {
  // Non-by queries: data has single entry with measurements arrays
  if (result.data?.length === 1 && !result.data[0].dimensions?.length) {
    return sumArr(result.data[0].measurements?.[key] as unknown as number[]);
  }
  // Or top-level measurements (older format)
  if (result.measurements?.[key]) {
    return sumArr(result.measurements[key]);
  }
  // Sum across all entries
  return result.data?.reduce((sum, entry) => sum + sumArr(entry.measurements?.[key] as unknown as number[]), 0) || 0;
}

// ─── Email metrics (aggregate) ───────────────────────────────────────────────

export async function getEmailMetrics(
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<{ received: number; opened: number; clicked: number; ordersPlaced: number; revenue: number }> {
  const metrics = await listMetrics(apiKey);
  const receivedM = metrics.find((m) => m.name === "Received Email");
  const openedM = metrics.find((m) => m.name === "Opened Email");
  const clickedM = metrics.find((m) => m.name === "Clicked Email");
  const orderedM = metrics.find((m) => m.name === "Placed Order");

  const results = { received: 0, opened: 0, clicked: 0, ordersPlaced: 0, revenue: 0 };

  // Run sequentially to avoid rate limits (Klaviyo 429s easily with parallel calls)
  if (receivedM) {
    const d = await queryMetricAggregates(apiKey, { metricId: receivedM.id, measurements: ["count"], startDate, endDate });
    results.received = sumMeasurement(d, "count");
  }
  if (openedM) {
    const d = await queryMetricAggregates(apiKey, { metricId: openedM.id, measurements: ["unique"], startDate, endDate });
    results.opened = sumMeasurement(d, "unique");
  }
  if (clickedM) {
    const d = await queryMetricAggregates(apiKey, { metricId: clickedM.id, measurements: ["unique"], startDate, endDate });
    results.clicked = sumMeasurement(d, "unique");
  }
  if (orderedM) {
    // No $attribution_type filter — Klaviyo API doesn't support it. Use $attributed_channel instead.
    const d = await queryMetricAggregates(apiKey, { metricId: orderedM.id, measurements: ["count", "sum_value"], startDate, endDate, by: ["$attributed_channel"] });
    // Sum only email + sms channels (= Klaviyo-attributed)
    for (const entry of d.data || []) {
      const ch = entry.dimensions?.[0] || "";
      if (ch.includes("email") || ch.includes("sms")) {
        results.ordersPlaced += sumArr(entry.measurements?.count as unknown as number[]);
        results.revenue += sumArr(entry.measurements?.sum_value as unknown as number[]);
      }
    }
  }

  return results;
}

// ─── Flows with performance ──────────────────────────────────────────────────

export async function getFlowsWithPerformance(
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<FlowWithPerformance[]> {
  const [flows, metrics] = await Promise.all([listFlows(apiKey), listMetrics(apiKey)]);

  const receivedM = metrics.find((m) => m.name === "Received Email");
  const openedM = metrics.find((m) => m.name === "Opened Email");
  const clickedM = metrics.find((m) => m.name === "Clicked Email");
  const orderedM = metrics.find((m) => m.name === "Placed Order");

  // Run sequentially to avoid Klaviyo rate limits
  const receivedData = receivedM ? await queryMetricAggregates(apiKey, { metricId: receivedM.id, measurements: ["count"], startDate, endDate, by: ["$flow"] }) : null;
  const openedData = openedM ? await queryMetricAggregates(apiKey, { metricId: openedM.id, measurements: ["unique"], startDate, endDate, by: ["$flow"] }) : null;
  const clickedData = clickedM ? await queryMetricAggregates(apiKey, { metricId: clickedM.id, measurements: ["unique"], startDate, endDate, by: ["$flow"] }) : null;
  const revenueData = orderedM ? await queryMetricAggregates(apiKey, { metricId: orderedM.id, measurements: ["sum_value"], startDate, endDate, by: ["$flow"] }) : null;

  const byFlow = (data: KlaviyoAggregateResult | null, key: string): Record<string, number> => {
    const map: Record<string, number> = {};
    data?.data.forEach((item) => {
      const dim = item.dimensions?.[0];
      if (dim) map[dim] = sumArr(item.measurements?.[key] as unknown as number[]); // sum across date periods
    });
    return map;
  };

  const receivedMap = byFlow(receivedData, "count");
  const openedMap = byFlow(openedData, "unique");
  const clickedMap = byFlow(clickedData, "unique");
  const revenueMap = byFlow(revenueData, "sum_value");

  return flows.map((flow) => {
    const received = receivedMap[flow.id] || 0;
    const opened = openedMap[flow.id] || 0;
    const clicked = clickedMap[flow.id] || 0;
    const revenue = revenueMap[flow.id] || 0;
    return {
      ...flow, received, opened, clicked, revenue,
      openRate: received > 0 ? (opened / received) * 100 : 0,
      clickRate: received > 0 ? (clicked / received) * 100 : 0,
      revenuePerEmail: received > 0 ? revenue / received : 0,
    };
  });
}

// ─── Campaigns with performance ──────────────────────────────────────────────

export async function getCampaignsWithPerformance(
  apiKey: string,
  startDate: string,
  endDate: string,
  channel?: "email" | "sms",
): Promise<CampaignWithPerformance[]> {
  const [campaigns, metrics] = await Promise.all([listCampaigns(apiKey, { channel }), listMetrics(apiKey)]);

  const receivedM = metrics.find((m) => m.name === "Received Email");
  const openedM = metrics.find((m) => m.name === "Opened Email");
  const clickedM = metrics.find((m) => m.name === "Clicked Email");
  const orderedM = metrics.find((m) => m.name === "Placed Order");

  // Run sequentially to avoid Klaviyo rate limits
  const receivedData = receivedM ? await queryMetricAggregates(apiKey, { metricId: receivedM.id, measurements: ["count"], startDate, endDate, by: ["$message"] }) : null;
  const openedData = openedM ? await queryMetricAggregates(apiKey, { metricId: openedM.id, measurements: ["unique"], startDate, endDate, by: ["$message"] }) : null;
  const clickedData = clickedM ? await queryMetricAggregates(apiKey, { metricId: clickedM.id, measurements: ["unique"], startDate, endDate, by: ["$message"] }) : null;
  const revenueData = orderedM ? await queryMetricAggregates(apiKey, { metricId: orderedM.id, measurements: ["sum_value"], startDate, endDate, by: ["$message"] }) : null;

  const byMsg = (data: KlaviyoAggregateResult | null, key: string): Record<string, number> => {
    const map: Record<string, number> = {};
    data?.data.forEach((item) => {
      const dim = item.dimensions?.[0];
      if (dim) map[dim] = sumArr(item.measurements?.[key] as unknown as number[]);
    });
    return map;
  };

  const receivedMap = byMsg(receivedData, "count");
  const openedMap = byMsg(openedData, "unique");
  const clickedMap = byMsg(clickedData, "unique");
  const revenueMap = byMsg(revenueData, "sum_value");

  return campaigns.map((campaign) => {
    const received = receivedMap[campaign.id] || 0;
    const opened = openedMap[campaign.id] || 0;
    const clicked = clickedMap[campaign.id] || 0;
    const revenue = revenueMap[campaign.id] || 0;
    return {
      ...campaign, received, opened, clicked, revenue,
      openRate: received > 0 ? (opened / received) * 100 : 0,
      clickRate: received > 0 ? (clicked / received) * 100 : 0,
      ctor: opened > 0 ? (clicked / opened) * 100 : 0,
      revenuePerEmail: received > 0 ? revenue / received : 0,
    };
  });
}

// ─── Revenue attribution ─────────────────────────────────────────────────────

export async function getRevenueAttribution(
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<RevenueAttribution> {
  // Sequential to avoid rate limits
  const flowsWithPerf = await getFlowsWithPerformance(apiKey, startDate, endDate);
  const campaignsWithPerf = await getCampaignsWithPerformance(apiKey, startDate, endDate);

  const flowRevenue = flowsWithPerf.reduce((sum, f) => sum + f.revenue, 0);
  const campaignRevenue = campaignsWithPerf.reduce((sum, c) => sum + c.revenue, 0);
  const totalRevenue = flowRevenue + campaignRevenue;

  const topFlows = [...flowsWithPerf].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
    .map((f) => ({ id: f.id, name: f.name, revenue: f.revenue }));
  const topCampaigns = [...campaignsWithPerf].filter((c) => c.status === "Sent")
    .sort((a, b) => b.revenue - a.revenue).slice(0, 5)
    .map((c) => ({ id: c.id, name: c.name, revenue: c.revenue }));

  return {
    flowRevenue, campaignRevenue, totalRevenue,
    flowPercentage: totalRevenue > 0 ? (flowRevenue / totalRevenue) * 100 : 0,
    campaignPercentage: totalRevenue > 0 ? (campaignRevenue / totalRevenue) * 100 : 0,
    topFlows, topCampaigns,
  };
}

// ─── Subscriber stats ────────────────────────────────────────────────────────

async function audienceProfileCount(apiKey: string, type: "lists" | "segments", id: string): Promise<number> {
  try {
    const response = await klaviyoRequest<{ data: { id: string }[]; links?: { next?: string } }>(
      apiKey, `/${type}/${id}/profiles`, { params: { "page[size]": "1" } },
    );
    return response.links?.next ? 100 : (response.data?.length || 0); // rough estimate
  } catch { return 0; }
}

export async function getSubscriberStats(apiKey: string): Promise<SubscriberStats> {
  const [lists, segments] = await Promise.all([listLists(apiKey), listSegments(apiKey)]);

  const listCounts = await Promise.all(
    lists.slice(0, 10).map(async (l) => ({
      id: l.id, name: l.name,
      profileCount: await audienceProfileCount(apiKey, "lists", l.id),
    })),
  );

  const segmentCounts = await Promise.all(
    segments.slice(0, 10).map(async (s) => ({
      id: s.id, name: s.name,
      profileCount: await audienceProfileCount(apiKey, "segments", s.id),
      isStarred: s.is_starred || false, isActive: s.is_active || false,
    })),
  );

  const totalProfiles = Math.max(...listCounts.map((l) => l.profileCount), 0);

  return { totalProfiles, lists: listCounts, segments: segmentCounts };
}

// ─── Validate ────────────────────────────────────────────────────────────────

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try { await listMetrics(apiKey); return true; } catch { return false; }
}
