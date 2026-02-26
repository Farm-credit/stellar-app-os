import { Activity, Archive, Clock3, Coins, FolderKanban, HandCoins } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/molecules/Card";
import { TrendChart } from "@/components/organisms/AdminDashboard/TrendChart";
import { getAdminDashboardData } from "@/lib/api/mock/adminDashboard";
import type { DashboardActivity } from "@/lib/types/adminDashboard";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const eventTime = new Date(timestamp).getTime();
  const diffMs = eventTime - now;
  const diffMinutes = Math.round(diffMs / (1000 * 60));

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

function getActivityLabel(activity: DashboardActivity): string {
  switch (activity.type) {
    case "project":
      return "Project";
    case "donation":
      return "Donation";
    case "mint":
      return "Mint";
    case "retire":
      return "Retirement";
    default:
      return "Activity";
  }
}

export default async function AdminDashboardPage() {
  const { metrics, trends, recentActivity } = await getAdminDashboardData();

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8" aria-label="Admin dashboard">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Admin dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Centralized platform health metrics, operational trends, and latest system activity.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          Updated moments ago
        </div>
      </header>

      <section aria-labelledby="overview-heading" className="mb-8 space-y-4">
        <h2 id="overview-heading" className="text-xl font-semibold text-foreground">
          Overview
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2 text-muted-foreground">
                <FolderKanban className="h-4 w-4" aria-hidden="true" />
                Total projects
              </CardDescription>
              <CardTitle className="text-3xl">{formatCount(metrics.totalProjects)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Active {metrics.activeProjects} | Pending {metrics.pendingProjects} | Archived {metrics.archivedProjects}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2 text-muted-foreground">
                <HandCoins className="h-4 w-4" aria-hidden="true" />
                Donations processed
              </CardDescription>
              <CardTitle className="text-3xl">{formatCurrency(metrics.totalDonationsProcessed)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Cumulative donation value processed by the platform.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2 text-muted-foreground">
                <Coins className="h-4 w-4" aria-hidden="true" />
                Credits minted
              </CardDescription>
              <CardTitle className="text-3xl">{formatCount(metrics.totalCreditsMinted)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Total credits issued since platform launch.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2 text-muted-foreground">
                <Archive className="h-4 w-4" aria-hidden="true" />
                Credits retired
              </CardDescription>
              <CardTitle className="text-3xl">{formatCount(metrics.totalCreditsRetired)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Total credits permanently retired by buyers.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mb-8">
        <TrendChart points={trends} />
      </section>

      <section aria-labelledby="activity-heading">
        <Card>
          <CardHeader>
            <CardTitle id="activity-heading" className="text-xl">
              Recent activity feed
            </CardTitle>
            <CardDescription>Latest platform actions in chronological order.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4" role="list">
              {recentActivity.map((activity) => (
                <li key={activity.id} className="flex items-start gap-3 rounded-lg border border-border p-4">
                  <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-stellar-blue/15 text-stellar-blue">
                    <Activity className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {activity.title}
                      <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {getActivityLabel(activity)}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{activity.detail}</p>
                  </div>
                  <time
                    dateTime={activity.timestamp}
                    className="shrink-0 text-xs text-muted-foreground"
                    aria-label={`Occurred ${formatRelativeTime(activity.timestamp)}`}
                  >
                    {formatRelativeTime(activity.timestamp)}
                  </time>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
