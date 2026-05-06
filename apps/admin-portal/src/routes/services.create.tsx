import { createRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { authRoute } from './_auth';
import { api } from '../api/client';
import { useAuth } from '../auth/auth-context';

interface RouteRule {
  method: string;
  path: string;
}

interface CreateServiceInput {
  organization_id: string;
  name: string;
  slug: string;
  base_url: string;
  allowed_routes: RouteRule[];
  upstream_auth_config?: unknown;
  default_rate_limit?: {
    requests_per_interval: number;
    interval_seconds: number;
    burst_size: number;
  };
}

interface MeResponse {
  organizations: Array<{ id: string; name: string; role: string }>;
}

function CreateServicePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/v1/me'),
  });

  const [form, setForm] = useState({
    organization_id: '',
    name: '',
    slug: '',
    base_url: '',
    allowed_routes: '[{"method":"GET","path":"/*"}]',
    requests_per_interval: 1000,
    interval_seconds: 60,
    burst_size: 100,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateServiceInput) => api.post('/v1/services', input),
    onSuccess: () => navigate({ to: '/services' }),
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let allowedRoutes: RouteRule[];
    try {
      allowedRoutes = JSON.parse(form.allowed_routes);
    } catch {
      setError('allowed_routes must be valid JSON');
      return;
    }

    createMutation.mutate({
      organization_id: form.organization_id || user?.organizations[0]?.id || '',
      name: form.name,
      slug: form.slug,
      base_url: form.base_url,
      allowed_routes: allowedRoutes,
      default_rate_limit: {
        requests_per_interval: form.requests_per_interval,
        interval_seconds: form.interval_seconds,
        burst_size: form.burst_size,
      },
    });
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [field]: e.target.type === 'number' ? Number((e.target as HTMLInputElement).value) : e.target.value });

  const orgs = me?.organizations ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Create Backend Service</h1>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          {orgs.length > 0 && (
            <div className="form-group">
              <label htmlFor="org">Organization</label>
              <select id="org" value={form.organization_id} onChange={update('organization_id')} required>
                <option value="">Select organization</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input id="name" value={form.name} onChange={update('name')} required />
            </div>
            <div className="form-group">
              <label htmlFor="slug">Slug</label>
              <input id="slug" value={form.slug} onChange={update('slug')} required placeholder="my-service" />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="base_url">Base URL</label>
            <input id="base_url" value={form.base_url} onChange={update('base_url')} required placeholder="http://my-service:8080" />
          </div>
          <div className="form-group">
            <label htmlFor="routes">Allowed Routes (JSON)</label>
            <textarea
              id="routes"
              value={form.allowed_routes}
              onChange={update('allowed_routes')}
              rows={3}
              required
            />
          </div>
          <h3 style={{ marginTop: 20 }}>Default Rate Limit</h3>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rps">Requests / Interval</label>
              <input id="rps" type="number" value={form.requests_per_interval} onChange={update('requests_per_interval')} min={1} />
            </div>
            <div className="form-group">
              <label htmlFor="interval">Interval (seconds)</label>
              <input id="interval" type="number" value={form.interval_seconds} onChange={update('interval_seconds')} min={1} />
            </div>
            <div className="form-group">
              <label htmlFor="burst">Burst Size</label>
              <input id="burst" type="number" value={form.burst_size} onChange={update('burst_size')} min={1} />
            </div>
          </div>
          <div className="flex-row" style={{ marginTop: 8 }}>
            <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Service'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate({ to: '/services' })}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const servicesCreateRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/services/new',
  component: CreateServicePage,
});
