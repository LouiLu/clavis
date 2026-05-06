import { createRoute, Link, useParams } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { authRoute } from './_auth';
import { api } from '../api/client';
import { ApiKeyReveal } from '../components/api-key-reveal';
import { ConfirmDialog } from '../components/confirm-dialog';

interface KeyItem {
  id: string;
  organization_id: string;
  backend_service_id: string;
  backend_service_slug: string;
  name: string;
  prefix: string;
  status: string;
  expires_at: string | null;
  last_used_at: string | null;
  rotated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface KeysResponse {
  items: KeyItem[];
}

interface CreateKeyResponse extends KeyItem {
  api_key: string;
}

interface RotateKeyResponse extends KeyItem {
  api_key: string;
}

interface ServiceDetail {
  name: string;
  slug: string;
}

type ConfirmAction = { type: 'revoke' | 'delete'; keyId: string; keyName: string } | null;

function ApiKeysPage() {
  const { serviceId } = useParams({ from: '/_auth/services/$serviceId/keys' });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');

  const { data: service } = useQuery({
    queryKey: ['service', serviceId],
    queryFn: () => api.get<ServiceDetail>(`/v1/services/${serviceId}`),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys', serviceId],
    queryFn: () => api.get<KeysResponse>(`/v1/services/${serviceId}/api-keys`),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      api.post<CreateKeyResponse>(`/v1/services/${serviceId}/api-keys`, { name }),
    onSuccess: (result) => {
      setRevealedKey(result.api_key);
      queryClient.invalidateQueries({ queryKey: ['api-keys', serviceId] });
      setShowCreate(false);
      setNewKeyName('');
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const rotateMutation = useMutation({
    mutationFn: (keyId: string) =>
      api.post<RotateKeyResponse>(`/v1/api-keys/${keyId}/rotate`),
    onSuccess: (result) => {
      setRevealedKey(result.api_key);
      queryClient.invalidateQueries({ queryKey: ['api-keys', serviceId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => api.post(`/v1/api-keys/${keyId}/revoke`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys', serviceId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => api.delete(`/v1/api-keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', serviceId] });
      setConfirmAction(null);
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newKeyName.trim()) {
      createMutation.mutate(newKeyName.trim());
    }
  };

  const keys = data?.items ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{service?.name ?? '...'} — API Keys</h1>
          <p style={{ margin: 0 }}>
            <Link to="/services/$serviceId" params={{ serviceId }}>Back to service</Link>
            {' · '}
            <Link to="/services">All services</Link>
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setShowCreate(true); setNewKeyName(''); }}>
          Create Key
        </button>
      </div>

      {revealedKey && (
        <ApiKeyReveal apiKey={revealedKey} onDone={() => setRevealedKey(null)} />
      )}

      {showCreate && (
        <div className="card mb-4">
          <h2>Create API Key</h2>
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label htmlFor="key-name">Key Name</label>
                <input
                  id="key-name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Production CI"
                  autoFocus
                  required
                />
              </div>
            </div>
            <div className="flex-row" style={{ marginTop: 4 }}>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {error && <div className="form-error mb-4">{error}</div>}

      {isLoading ? (
        <div className="empty-state"><p>Loading...</p></div>
      ) : keys.length === 0 ? (
        <div className="empty-state">
          <p>No API keys for this service yet.</p>
          <p><button className="btn-primary" onClick={() => { setShowCreate(true); setNewKeyName(''); }}>Create your first key</button></p>
        </div>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Used</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td>{key.name}</td>
                  <td className="text-mono">{key.prefix}</td>
                  <td>
                    <span className={`badge badge-${key.status === 'active' ? 'active' : key.status === 'revoked' ? 'revoked' : 'expired'}`}>
                      {key.status}
                    </span>
                  </td>
                  <td>{new Date(key.created_at).toLocaleDateString()}</td>
                  <td>{key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}</td>
                  <td>{key.expires_at ? new Date(key.expires_at).toLocaleDateString() : 'Never'}</td>
                  <td>
                    <div className="flex-row">
                      {key.status === 'active' && (
                        <>
                          <button
                            className="btn-secondary"
                            onClick={() => rotateMutation.mutate(key.id)}
                            disabled={rotateMutation.isPending}
                          >
                            Rotate
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => setConfirmAction({ type: 'revoke', keyId: key.id, keyName: key.name })}
                          >
                            Revoke
                          </button>
                        </>
                      )}
                      <button
                        className="btn-danger"
                        onClick={() => setConfirmAction({ type: 'delete', keyId: key.id, keyName: key.name })}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.type === 'revoke' ? 'Revoke API Key' : 'Delete API Key'}
          message={
            confirmAction.type === 'revoke'
              ? `Revoke "${confirmAction.keyName}"? Requests using this key will be rejected.`
              : `Permanently delete "${confirmAction.keyName}"? This cannot be undone.`
          }
          confirmLabel={confirmAction.type === 'revoke' ? 'Revoke' : 'Delete'}
          danger
          onConfirm={() => {
            if (confirmAction.type === 'revoke') {
              revokeMutation.mutate(confirmAction.keyId);
            } else {
              deleteMutation.mutate(confirmAction.keyId);
            }
            setConfirmAction(null);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

export const servicesKeysRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/services/$serviceId/keys',
  component: ApiKeysPage,
});
