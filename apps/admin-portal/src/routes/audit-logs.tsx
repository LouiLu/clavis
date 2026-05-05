import { createRoute } from '@tanstack/react-router';
import { authRoute } from './_auth';

function AuditLogsPage() {
  return (
    <div>
      <div className="page-header">
        <h1>Audit Logs</h1>
      </div>
      <div className="card">
        <p>Audit log viewer will be built in a later task.</p>
      </div>
    </div>
  );
}

export const auditLogsRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/audit-logs',
  component: AuditLogsPage,
});
