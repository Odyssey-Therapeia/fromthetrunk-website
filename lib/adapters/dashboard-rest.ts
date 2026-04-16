import type {
  ActivityItem,
  DashboardMetrics,
  DashboardPort,
} from "@/lib/ports/dashboard";

class DashboardRestAdapter implements DashboardPort {
  async getMetrics(): Promise<DashboardMetrics> {
    const res = await fetch("/api/v2/admin/dashboard/metrics");
    if (!res.ok) throw new Error("Failed to load dashboard metrics");
    return res.json();
  }

  async getRecentActivity(limit = 20): Promise<ActivityItem[]> {
    const res = await fetch(
      `/api/v2/admin/dashboard/activity?limit=${limit}`,
    );
    if (!res.ok) throw new Error("Failed to load activity");
    return res.json();
  }
}

export const dashboardAdapter = new DashboardRestAdapter();
