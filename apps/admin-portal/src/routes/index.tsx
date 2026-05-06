import { useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
import { authRoute } from './_auth';
import { api } from '../api/client';

interface ServiceItem {
  id: string;
  slug: string;
  name: string;
}

interface ServicesResponse {
  items: ServiceItem[];
}

interface OrganizationsResponse {
  items: Array<{ id: string; members: Array<{ id: string }> }>;
}

interface AuditLogItem {
  id: string;
  action: string;
  target_type: string;
  created_at: string;
  actor_user_id: string | null;
}

interface AuditLogsResponse {
  items: AuditLogItem[];
}

interface MetricsOverviewResponse {
  total_requests: number;
  unique_keys: number;
  active_services: number;
}

interface KeyBreakdown {
  key_id: string;
  key_prefix: string;
  requests: number;
}

interface UsageBucket {
  bucket: string;
  requests: number;
  avg_latency_ms: number;
  keys?: KeyBreakdown[];
}

interface UsageResponse {
  items: UsageBucket[];
}

function DashboardPage() {
  const results = useQueries({
    queries: [
      { queryKey: ['services'], queryFn: () => api.get<ServicesResponse>('/v1/services') },
      { queryKey: ['organizations'], queryFn: () => api.get<OrganizationsResponse>('/v1/organizations') },
      { queryKey: ['audit-logs'], queryFn: () => api.get<AuditLogsResponse>('/v1/audit-logs') },
      { queryKey: ['metrics-overview'], queryFn: () => api.get<MetricsOverviewResponse>('/v1/metrics/overview?days=1') },
    ],
  });

  const [servicesResult, orgsResult, auditResult, metricsResult] = results;
  const services = servicesResult.data?.items ?? [];
  const orgs = orgsResult.data?.items ?? [];

  const totalMembers = orgs.reduce((sum, org) => sum + (org.members?.length ?? 0), 0);
  const totalServices = services.length;
  const recentAudit = auditResult.data?.items.slice(0, 5) ?? [];
  const isLoading = results.some((r) => r.isLoading);
  const [tooltip, setTooltip] = useState<{ svcIdx: number; bucketIdx: number; x: number; y: number } | null>(null);

  const usageQueries = useQueries({
    queries: services.map((svc) => ({
      queryKey: ['metrics', 'service', svc.id],
      queryFn: () =>
        api.get<UsageResponse>(
          `/v1/metrics/services/${svc.id}/usage?days=7&resolution=hour&include_keys=true`,
        ),
      enabled: services.length > 0,
    })),
  });

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      {isLoading ? (
        <div className="empty-state"><p><span className="spinner" /> Loading...</p></div>
      ) : (

        <>
          <div className="stat-cards">
            <div className="stat-card">
              <div className="stat-value">{totalServices}</div>
              <div className="stat-label">Backend Services</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{totalMembers}</div>
              <div className="stat-label">Organization Members</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{metricsResult.data?.total_requests ?? '--'}</div>
              <div className="stat-label">Requests (24h)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{metricsResult.data?.unique_keys ?? '--'}</div>
              <div className="stat-label">Active API Keys</div>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="dashboard-charts">
              {services.map((svc, i) => {
                const buckets: UsageBucket[] = usageQueries[i]?.data?.items ?? [];
                const totalRequests = buckets.reduce((s, b) => s + b.requests, 0);
                const peakRequests = Math.max(0, ...buckets.map((b) => b.requests));
                const avgLatency =
                  buckets.length > 0
                    ? Math.round(
                        buckets.reduce((s, b) => s + b.avg_latency_ms * b.requests, 0) /
                          Math.max(1, totalRequests),
                      )
                    : 0;
                const maxReq = Math.max(1, peakRequests);

                return (
                  <div className="chart-container" key={svc.id}>
                    <div className="chart-header">
                      <h3>
                        {svc.name}{' '}
                        <span className="chart-subtitle">({svc.slug})</span>
                      </h3>
                      <span className="chart-legend">
                        <span className="chart-legend-dot" />
                        Requests per hour
                      </span>
                    </div>

                    <div className="chart-stats">
                      <div className="chart-stat">
                        <span className="chart-stat-value">{totalRequests.toLocaleString()}</span>
                        <span className="chart-stat-label">Total requests</span>
                      </div>
                      <div className="chart-stat">
                        <span className="chart-stat-value">{peakRequests.toLocaleString()}</span>
                        <span className="chart-stat-label">Peak req/hour</span>
                      </div>
                      <div className="chart-stat">
                        <span className="chart-stat-value">{avgLatency}ms</span>
                        <span className="chart-stat-label">Avg latency</span>
                      </div>
                    </div>

                    {buckets.length === 0 ? (
                      <p className="text-muted" style={{ margin: '12px 0 0' }}>
                        No usage data yet. Requests will appear here once traffic flows through the gateway.
                      </p>
                    ) : (
                      <div className="chart-body">
                        <div className="chart-y-axis">
                          <span>{maxReq}</span>
                          <span>{Math.round(maxReq / 2)}</span>
                          <span>0</span>
                        </div>
                        <div className="chart-area">
                          <div className="bar-chart-full">
                            {buckets.map((b, j) => (
                              <div
                                key={j}
                                className={`bar ${b.requests === 0 ? 'bar-empty' : ''}`}
                                style={{
                                  height: `${Math.max(2, (b.requests / maxReq) * 100)}%`,
                                  opacity: b.requests === 0 ? undefined : 0.45 + (b.requests / maxReq) * 0.55,
                                  cursor: b.requests > 0 ? 'pointer' : undefined,
                                }}
                                onMouseEnter={(e) => {
                                  if (b.requests === 0) return;
                                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                                  setTooltip({ svcIdx: i, bucketIdx: j, x: rect.left + rect.width / 2, y: rect.top });
                                }}
                                onMouseLeave={() => setTooltip(null)}
                              />
                            ))}
                          </div>
                          <div className="chart-x-labels">
                            {buckets
                              .filter((_, j) => j % 24 === 0)
                              .map((b, j) => (
                                <span key={j}>{fmtLabel(b.bucket)}</span>
                              ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {tooltip && tooltip.svcIdx === i && (() => {
                      const b = buckets[tooltip.bucketIdx];
                      if (!b) return null;
                      return (
                        <div className="chart-tooltip" style={{ left: Math.min(tooltip.x, window.innerWidth - 260), top: tooltip.y - 10 }}>
                          <div className="chart-tooltip-time">{fmtBucket(b.bucket)}</div>
                          <div className="chart-tooltip-row">
                            <span>Requests</span>
                            <strong>{b.requests}</strong>
                          </div>
                          <div className="chart-tooltip-row">
                            <span>Avg latency</span>
                            <strong>{b.avg_latency_ms}ms</strong>
                          </div>
                          {b.keys && b.keys.length > 0 && (
                            <>
                              <div className="chart-tooltip-divider" />
                              <div className="chart-tooltip-heading">Per API Key</div>
                              {b.keys.slice(0, 5).map((k) => (
                                <div className="chart-tooltip-row" key={k.key_id}>
                                  <span className="chart-tooltip-key">{k.key_prefix}</span>
                                  <strong>{k.requests}</strong>
                                </div>
                              ))}
                              {b.keys.length > 5 && (
                                <div className="chart-tooltip-more">+{b.keys.length - 5} more keys</div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>

            <div className="dashboard-sidebar">
              {recentAudit.length > 0 && (
                <div>
                  <h2>Recent Activity</h2>
                  <div className="data-table" style={{ marginTop: 8 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Action</th>
                          <th>Target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentAudit.map((entry) => (
                          <tr key={entry.id}>
                            <td>{new Date(entry.created_at).toLocaleString()}</td>
                            <td style={{ color: entry.action.endsWith('.created') ? '#065f46' : entry.action.endsWith('.revoked') ? '#991b1b' : '#1e40af', fontWeight: 600, fontSize: 13 }}>
                              {entry.action}
                            </td>
                            <td className="text-mono">{entry.target_type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function fmtBucket(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' });
}

function fmtLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const indexRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/',
  component: DashboardPage,
});
