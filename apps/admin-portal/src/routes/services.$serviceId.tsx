import { createRoute, Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { authRoute } from './_auth';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/confirm-dialog';

interface ServiceDetail {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  base_url: string;
  allowed_routes: Array<{ method: string; path: string }>;
  upstream_auth_config: unknown;
  status: string;
  default_rate_limit: {
    requests_per_interval: number;
    interval_seconds: number;
    burst_size: number;
  } | null;
  created_at: string;
  updated_at: string;
}

function ServiceDetailPage() {
  const { serviceId } = useParams({ from: '/_auth/services/$serviceId' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const { data: service, isLoading } = useQuery({
    queryKey: ['service', serviceId],
    queryFn: () => api.get<ServiceDetail>(`/v1/services/${serviceId}`),
  });

  const [form, setForm] = useState({ name: '', base_url: '' });

  const updateMutation = useMutation({
    mutationFn: (input: { name?: string; base_url?: string }) =>
      api.patch<ServiceDetail>(`/v1/services/${serviceId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service', serviceId] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setEditing(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.post(`/v1/services/${serviceId}/delete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      navigate({ to: '/services' });
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => api.delete(`/v1/services/${serviceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      navigate({ to: '/services' });
    },
  });

  const startEdit = () => {
    if (service) {
      setForm({ name: service.name, base_url: service.base_url });
      setEditing(true);
      setError(null);
    }
  };

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  if (isLoading || !service) {
    return <div className="empty-state"><p>Loading...</p></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>{service.name}</h1>
        <div className="flex-row">
          <Link
            to="/services/$serviceId/keys"
            params={{ serviceId }}
            className="btn-primary"
          >
            Manage Keys
          </Link>
          {!editing && (
            <button className="btn-secondary" onClick={startEdit}>Edit</button>
          )}
          {service.status === 'active' && (
            <button
              className="btn-danger"
              onClick={() => {
                if (confirm(`Permanently disable "${service.name}"?`)) {
                  disableMutation.mutate();
                }
              }}
            >
              Disable
            </button>
          )}
          {service.status === 'disabled' && (
            <button className="btn-danger" onClick={() => setShowDelete(true)}>
              Delete
            </button>
          )}
        </div>
      </div>

      {error && <div className="form-error mb-4">{error}</div>}

      <div className="card mb-4">
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px 16px', fontSize: 14 }}>
          <strong>Status</strong>
          <span className={`badge badge-${service.status === 'active' ? 'active' : 'disabled'}`}>
            {service.status}
          </span>

          <strong>Slug</strong>
          {editing ? <span>{service.slug}</span> : <code>{service.slug}</code>}

          <strong>Base URL</strong>
          {editing ? (
            <input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
          ) : (
            <span className="text-mono">{service.base_url}</span>
          )}

          <strong>Name</strong>
          {editing ? (
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          ) : (
            <span>{service.name}</span>
          )}

          <strong>Allowed Routes</strong>
          <code>{JSON.stringify(service.allowed_routes)}</code>

          {service.default_rate_limit && (
            <>
              <strong>Rate Limit</strong>
              <span>
                {service.default_rate_limit.requests_per_interval} req / {service.default_rate_limit.interval_seconds}s
                (burst {service.default_rate_limit.burst_size})
              </span>
            </>
          )}

          <strong>Created</strong>
          <span>{new Date(service.created_at).toLocaleString()}</span>

          <strong>Updated</strong>
          <span>{new Date(service.updated_at).toLocaleString()}</span>
        </div>

        {editing && (
          <div className="flex-row" style={{ marginTop: 16 }}>
            <button className="btn-primary" onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
            <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        )}
      </div>

      {showDelete && (
        <ConfirmDialog
          title="Delete Backend Service"
          message={`Permanently delete "${service.name}"? All API keys for this service will be deleted. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}

export const servicesDetailRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/services/$serviceId',
  component: ServiceDetailPage,
});
