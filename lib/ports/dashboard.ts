export type DashboardMetrics = {
  revenue: { totalPaise: number; periodLabel: string };
  orders: { total: number; pending: number };
  products: { total: number; published: number; drafts: number; lowStock: number };
  customers: { total: number; newThisWeek: number };
};

export type ActivityItem = {
  id: string;
  type: "order" | "product" | "customer";
  description: string;
  timestamp: string;
};

/** Port for dashboard data. */
export interface DashboardPort {
  getMetrics(): Promise<DashboardMetrics>;
  getRecentActivity(limit?: number): Promise<ActivityItem[]>;
}
