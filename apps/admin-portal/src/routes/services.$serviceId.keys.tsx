import { createRoute, Link, useParams } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { authRoute } from './_auth';
import { api } from '../api/client';
import { ApiKeyReveal } from '../components/api-key-reveal';
import { ConfirmDialog } from '../components/confirm-dialog';
import { RateLimitForm, RateLimitValues } from '../components/rate-limit-form';
import { Toast } from '../components/toast';

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

type ConfirmAction = { type: 'revoke' | 'delete' | 'rotate'; keyId: string; keyName: string } | null;

function ApiKeysPage() {
  const { serviceId } = useParams({ from: '/_auth/services/$serviceId/keys' });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
  const [editingExpiry, setEditingExpiry] = useState<{ keyId: string; expiresAt: string; x: number; y: number } | null>(null);
  const [rateLimitKeyId, setRateLimitKeyId] = useState<string | null>(null);

  const { data: service } = useQuery({
    queryKey: ['service', serviceId],
    queryFn: () => api.get<ServiceDetail>(`/v1/services/${serviceId}`),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys', serviceId],
    queryFn: () => api.get<KeysResponse>(`/v1/services/${serviceId}/api-keys`),
  });

  const createMutation = useMutation({
    mutationFn: ({ name, expiresAt }: { name: string; expiresAt?: string }) =>
      api.post<CreateKeyResponse>(`/v1/services/${serviceId}/api-keys`, {
        name,
        expires_at: expiresAt || undefined,
      }),
    onSuccess: (result) => {
      setRevealedKey(result.api_key);
      queryClient.invalidateQueries({ queryKey: ['api-keys', serviceId] });
      setShowCreate(false);
      setNewKeyName('');
      setNewKeyExpiry('');
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateKeyMutation = useMutation({
    mutationFn: ({ keyId, data: data_ }: { keyId: string; data: { expires_at?: string | null } }) =>
      api.patch(`/v1/api-keys/${keyId}`, data_),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', serviceId] });
      setEditingExpiry(null);
      setToast('Key updated');
    },
    onError: (err: Error) => setError(err.message),
  });

  const rotateMutation = useMutation({
    mutationFn: (keyId: string) =>
      api.post<RotateKeyResponse>(`/v1/api-keys/${keyId}/rotate`),
    onSuccess: (result) => {
      setRevealedKey(result.api_key);
      queryClient.invalidateQueries({ queryKey: ['api-keys', serviceId] });
      setConfirmAction(null);
    },
    onError: () => setError('Failed to rotate key'),
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => api.post(`/v1/api-keys/${keyId}/revoke`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', serviceId] });
      setToast('Key revoked');
    },
    onError: () => setError('Failed to revoke key'),
  });

  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => api.delete(`/v1/api-keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', serviceId] });
      setConfirmAction(null);
      setToast('Key deleted');
    },
    onError: () => setError('Failed to delete key'),
  });

  const { data: keyRateLimit } = useQuery({
    queryKey: ['key-rate-limit', rateLimitKeyId],
    queryFn: () => api.get<RateLimitValues | null>(`/v1/api-keys/${rateLimitKeyId}/rate-limit`),
    enabled: !!rateLimitKeyId,
  });

  const upsertKeyRateLimitMutation = useMutation({
    mutationFn: ({ keyId, values }: { keyId: string; values: RateLimitValues }) =>
      api.put(`/v1/api-keys/${keyId}/rate-limit`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['key-rate-limit', rateLimitKeyId] });
      setToast('Key rate limit updated');
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteKeyRateLimitMutation = useMutation({
    mutationFn: (keyId: string) => api.delete(`/v1/api-keys/${keyId}/rate-limit`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['key-rate-limit', rateLimitKeyId] });
      setRateLimitKeyId(null);
      setToast('Key rate limit removed');
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newKeyName.trim()) {
      createMutation.mutate({ name: newKeyName.trim(), expiresAt: newKeyExpiry || undefined });
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
              <div className="form-group">
                <label htmlFor="key-expiry">Expires (optional)</label>
                <input
                  id="key-expiry"
                  type="date"
                  value={newKeyExpiry}
                  onChange={(e) => setNewKeyExpiry(e.target.value)}
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
        <div className="empty-state"><p><span className="spinner" /> Loading...</p></div>
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
                  <td style={{ position: 'relative' }}>
                    <span
                      onClick={(e) => {
                        if (key.status !== 'active') return;
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        setEditingExpiry({
                          keyId: key.id,
                          expiresAt: key.expires_at ? key.expires_at.slice(0, 10) : '',
                          x: rect.left,
                          y: rect.bottom + 4,
                        });
                      }}
                      style={{ cursor: key.status === 'active' ? 'pointer' : 'default' }}
                      title={key.status === 'active' ? 'Click to edit' : undefined}
                    >
                      {key.expires_at ? new Date(key.expires_at).toLocaleDateString() : 'Never'}
                      {key.status === 'active' && ' ✎'}
                    </span>
                    {editingExpiry?.keyId === key.id && (
                      <>
                        <div className="expiry-popover-backdrop" onClick={() => setEditingExpiry(null)} />
                        <div className="expiry-popover" style={{ left: editingExpiry.x, top: editingExpiry.y }}>
                        <input
                          type="date"
                          value={editingExpiry.expiresAt}
                          onChange={(e) => setEditingExpiry({ ...editingExpiry, expiresAt: e.target.value })}
                          className="expiry-popover-input"
                          autoFocus
                        />
                        <div className="expiry-popover-actions">
                          <button
                            className="btn-primary"
                            onClick={() => updateKeyMutation.mutate({
                              keyId: key.id,
                              data: { expires_at: editingExpiry.expiresAt || null },
                            })}
                            disabled={updateKeyMutation.isPending}
                          >
                            {updateKeyMutation.isPending ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => setEditingExpiry(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                      </>
                    )}
                  </td>
                  <td>
                    <div className="flex-row">
                      {key.status === 'active' && (
                        <>
                          <button
                            className="btn-secondary"
                            onClick={() => setConfirmAction({ type: 'rotate', keyId: key.id, keyName: key.name })}
                          >
                            Rotate
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => setConfirmAction({ type: 'revoke', keyId: key.id, keyName: key.name })}
                          >
                            Revoke
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => setRateLimitKeyId(rateLimitKeyId === key.id ? null : key.id)}
                          >
                            Rate
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

      {rateLimitKeyId && (
        <div className="card mb-4" style={{ marginTop: 16 }}>
          <h2>Rate Limit for Key</h2>
          <p className="text-muted" style={{ margin: 0 }}>
            Overrides the service-level default when set.
          </p>
          <RateLimitForm
            initial={keyRateLimit ?? null}
            onSave={async (values) => {
              await upsertKeyRateLimitMutation.mutateAsync({ keyId: rateLimitKeyId, values });
            }}
            onCancel={() => setRateLimitKeyId(null)}
            onRemove={
              keyRateLimit
                ? async () => {
                    await deleteKeyRateLimitMutation.mutateAsync(rateLimitKeyId);
                  }
                : undefined
            }
          />
        </div>
      )}

      {confirmAction && (() => {
        const { type, keyId, keyName } = confirmAction;
        if (type === 'rotate') {
          return (
            <ConfirmDialog
              title="Rotate API Key"
              message={`Rotate "${keyName}"? The current key will be invalidated and a new key will be issued.`}
              confirmLabel={rotateMutation.isPending ? 'Rotating...' : 'Rotate'}
              pending={rotateMutation.isPending}
              onConfirm={() => rotateMutation.mutate(keyId)}
              onCancel={() => setConfirmAction(null)}
            />
          );
        }
        if (type === 'revoke') {
          return (
            <ConfirmDialog
              title="Revoke API Key"
              message={`Revoke "${keyName}"? Requests using this key will be rejected.`}
              confirmLabel={revokeMutation.isPending ? 'Revoking...' : 'Revoke'}
              danger
              pending={revokeMutation.isPending}
              onConfirm={() => revokeMutation.mutate(keyId)}
              onCancel={() => setConfirmAction(null)}
            />
          );
        }
        return (
          <ConfirmDialog
            title="Delete API Key"
            message={`Permanently delete "${keyName}"? This cannot be undone.`}
            confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            danger
            pending={deleteMutation.isPending}
            onConfirm={() => deleteMutation.mutate(keyId)}
            onCancel={() => setConfirmAction(null)}
          />
        );
      })()}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

export const servicesKeysRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/services/$serviceId/keys',
  component: ApiKeysPage,
});
