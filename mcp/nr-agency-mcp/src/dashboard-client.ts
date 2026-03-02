/**
 * Dashboard API client for MCP → Dashboard communication.
 * All complex queries go through dashboard API to avoid duplicating business logic.
 */

const DASHBOARD_URL = process.env.DASHBOARD_URL;
const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY;

export class DashboardApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "DashboardApiError";
  }
}

/**
 * Fetch from dashboard internal API with auth + request source header.
 */
export async function dashboardFetch<T = any>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  if (!DASHBOARD_URL) {
    throw new DashboardApiError(0, "DASHBOARD_URL env var ikke sat");
  }
  if (!DASHBOARD_API_KEY) {
    throw new DashboardApiError(0, "DASHBOARD_API_KEY env var ikke sat");
  }

  const url = new URL(path, DASHBOARD_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${DASHBOARD_API_KEY}`,
      "X-Request-Source": "mcp",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DashboardApiError(res.status, `Dashboard ${res.status}: ${body}`);
  }

  return res.json();
}
