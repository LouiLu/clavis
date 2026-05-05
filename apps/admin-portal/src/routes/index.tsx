import { createRoute } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
import { authRoute } from './_auth';
import { api } from '../api/client';
import { Link } from '@tanstack/react-router';

interface ServicesResponse {
  items: Array<{ id: string; slug: string }>;
}

interface KeysResponse {
  items: Array<{ id: string }>;
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

function DashboardPage() {
  const results = useQueries({
    queries: [
      { queryKey: ['services'], queryFn: () => api.get<ServicesResponse>('/v1/services') },
      { queryKey: ['organizations'], queryFn: () => api.get<OrganizationsResponse>('/v1/organizations') },
      { queryKey: ['audit-logs'], queryFn: () => api.get<AuditLogsResponse>('/v1/audit-logs') },
    ],
  });

  const [servicesResult, orgsResult, auditResult] = results;
  const services = servicesResult.data?.items ?? [];
  const orgs = orgsResult.data?.items ?? [];

  // Count total keys by iterating services (simplified: count from audit logs)
  const totalMembers = orgs.reduce((sum, org) => sum + (org.members?.length ?? 0), 0);
  const totalServices = services.length;
  const recentAudit = auditResult.data?.items.slice(0, 5) ?? [];
  const isLoading = results.some((r) => r.isLoading);

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      {isLoading ? (
        <div className="empty-state"><p>Loading...</p></div>
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
              <div className="stat-value">{auditResult.data?.items.length ?? 0}</div>
              <div className="stat-label">Audit Log Entries</div>
            </div>
          </div>

          <div className="card mb-4">
            <h2>Quick Links</h2>
            <div className="flex-row" style={{ marginTop: 12 }}>
              <Link to="/services" className="btn-primary">Manage Services</Link>
              <Link to="/organization" className="btn-secondary">Organization</Link>
              <Link to="/audit-logs" className="btn-secondary">Audit Logs</Link>
            </div>
          </div>

          {recentAudit.length > 0 && (
            <div>
              <h2>Recent Activity</h2>
              <div className="data-table" style={{ marginTop: 12 }}>
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
        </>
      )}
    </div>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/',
  component: DashboardPage,
});
