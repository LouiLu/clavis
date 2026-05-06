import { createRoute, Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { authRoute } from './_auth';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/confirm-dialog';
import { Toast } from '../components/toast';

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

type ConfirmAction = {
  type: 'disable' | 'delete';
} | null;

function ServiceDetailPage() {
  const { serviceId } = useParams({ from: '/_auth/services/$serviceId' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: service, isLoading } = useQuery({
    queryKey: ['service', serviceId],
    queryFn: () => api.get<ServiceDetail>(`/v1/services/${serviceId}`),
  });

  const [form, setForm] = useState({ name: '', slug: '', base_url: '' });

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/v1/services/${serviceId}`, { name: form.name, slug: form.slug, base_url: form.base_url });
      queryClient.invalidateQueries({ queryKey: ['service', serviceId] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setEditing(false);
      setError(null);
      setToast('Changes saved');
    } catch {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const disableMutation = useMutation({
    mutationFn: () => api.delete(`/v1/services/${serviceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['service', serviceId] });
      setConfirmAction(null);
      setToast('Service disabled');
    },
    onError: () => setError('Failed to disable service'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.post(`/v1/services/${serviceId}/delete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      navigate({ to: '/services' });
    },
    onError: () => setError('Failed to delete service'),
  });

  const startEdit = () => {
    if (service) {
      setForm({ name: service.name, slug: service.slug, base_url: service.base_url });
      setEditing(true);
      setError(null);
    }
  };

  if (isLoading || !service) {
    return <div className="empty-state"><p><span className="spinner" /> Loading...</p></div>;
  }

  return (
    <div>
      <div className="sub-nav">
        <Link to="/services">Services</Link>
        <span style={{ margin: '0 4px', color: 'var(--text-muted)' }}>/</span>
        {service.name}
      </div>

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
              className="btn-warning"
              onClick={() => setConfirmAction({ type: 'disable' })}
            >
              Disable
            </button>
          )}
          {service.status === 'disabled' && (
            <button className="btn-danger" onClick={() => setConfirmAction({ type: 'delete' })}>
              Delete
            </button>
          )}
        </div>
      </div>

      {error && <div className="form-error mb-4">{error}</div>}

      <div className="card mb-4">
        <div className="detail-grid">
          <strong>Status</strong>
          <span className={`badge badge-${service.status === 'active' ? 'active' : 'disabled'}`}>
            {service.status}
          </span>

          <strong>Name</strong>
          {editing ? (
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          ) : (
            <span>{service.name}</span>
          )}

          <strong>Slug</strong>
          {editing ? (
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          ) : (
            <code>{service.slug}</code>
          )}

          <strong>Base URL</strong>
          {editing ? (
            <input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
          ) : (
            <span className="text-mono">{service.base_url}</span>
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
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner" /> Saving...</> : 'Save Changes'}
            </button>
            <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        )}
      </div>

      {confirmAction?.type === 'disable' && (
        <ConfirmDialog
          title="Disable Backend Service"
          message={`Disable "${service.name}"? Any API keys for this service will stop working. The service can be re-enabled later.`}
          confirmLabel={disableMutation.isPending ? 'Disabling...' : 'Disable'}
          pending={disableMutation.isPending}
          onConfirm={() => disableMutation.mutate()}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction?.type === 'delete' && (
        <ConfirmDialog
          title="Delete Backend Service"
          message={`Permanently delete "${service.name}"? All API keys for this service will be deleted. This cannot be undone.`}
          confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          danger
          pending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

export const servicesDetailRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/services/$serviceId',
  component: ServiceDetailPage,
});
