import { createRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { authRoute } from './_auth';
import { api } from '../api/client';

interface AuditLogItem {
  id: string;
  organization_id: string | null;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  metadata: unknown;
  created_at: string;
}

interface AuditLogsResponse {
  items: AuditLogItem[];
}

function actionColor(action: string): string {
  if (action.endsWith('.created')) return '#065f46';
  if (action.endsWith('.revoked')) return '#991b1b';
  if (action.endsWith('.deleted')) return '#9a3412';
  if (action.endsWith('.updated')) return '#1e40af';
  if (action.endsWith('.rotated')) return '#6b21a8';
  return '#6b7f7a';
}

function AuditLogsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => api.get<AuditLogsResponse>('/v1/audit-logs'),
  });

  const logs = data?.items ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Audit Logs</h1>
      </div>

      {isLoading ? (
        <div className="empty-state"><p><span className="spinner" /> Loading...</p></div>
      ) : logs.length === 0 ? (
        <div className="empty-state"><p>No audit log entries yet.</p></div>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Target Type</th>
                <th>Target ID</th>
                <th>Actor</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.created_at).toLocaleString()}</td>
                  <td>
                    <span style={{ color: actionColor(entry.action), fontWeight: 600, fontSize: 13 }}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="text-mono">{entry.target_type}</td>
                  <td className="text-mono" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {entry.target_id}
                  </td>
                  <td className="text-mono" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {entry.actor_user_id ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const auditLogsRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/audit-logs',
  component: AuditLogsPage,
});
