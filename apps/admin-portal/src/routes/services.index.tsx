import { useState } from 'react';
import { createRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authRoute } from './_auth';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/confirm-dialog';

interface ServiceItem {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  base_url: string;
  status: string;
  default_rate_limit: {
    requests_per_interval: number;
    interval_seconds: number;
    burst_size: number;
  } | null;
  created_at: string;
  updated_at: string;
}

interface ServicesResponse {
  items: ServiceItem[];
}

function ServicesListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get<ServicesResponse>('/v1/services'),
  });

  const disableMutation = useMutation({
    mutationFn: (serviceId: string) => api.delete(`/v1/services/${serviceId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (serviceId: string) => api.post(`/v1/services/${serviceId}/delete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setDeleteTarget(null);
    },
  });

  const services = data?.items ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Backend Services</h1>
        <button className="btn-primary" onClick={() => navigate({ to: '/services/new' })}>
          Create Service
        </button>
      </div>

      {isLoading ? (
        <div className="empty-state"><p>Loading...</p></div>
      ) : services.length === 0 ? (
        <div className="empty-state">
          <p>No backend services yet.</p>
          <p><Link to="/services/new">Create your first service</Link></p>
        </div>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Base URL</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <tr key={svc.id}>
                  <td>
                    <Link to="/services/$serviceId" params={{ serviceId: svc.id }}>
                      {svc.name}
                    </Link>
                  </td>
                  <td><code>{svc.slug}</code></td>
                  <td className="text-mono">{svc.base_url}</td>
                  <td>
                    <span className={`badge badge-${svc.status === 'active' ? 'active' : 'disabled'}`}>
                      {svc.status}
                    </span>
                  </td>
                  <td>{new Date(svc.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="flex-row">
                      <Link
                        to="/services/$serviceId/keys"
                        params={{ serviceId: svc.id }}
                        className="btn-secondary"
                      >
                        Keys
                      </Link>
                      <button
                        className="btn-secondary"
                        onClick={() => navigate({ to: '/services/$serviceId', params: { serviceId: svc.id } })}
                      >
                        Edit
                      </button>
                      {svc.status === 'active' && (
                        <button
                          className="btn-danger"
                          onClick={() => {
                            if (confirm(`Disable "${svc.name}"?`)) {
                              disableMutation.mutate(svc.id);
                            }
                          }}
                        >
                          Disable
                        </button>
                      )}
                      {svc.status === 'disabled' && (
                        <button
                          className="btn-danger"
                          onClick={() => setDeleteTarget({ id: svc.id, name: svc.name })}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Backend Service"
          message={`Permanently delete "${deleteTarget.name}"? All API keys for this service will be deleted. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export const servicesIndexRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/services',
  component: ServicesListPage,
});
