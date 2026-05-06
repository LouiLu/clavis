import { createRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { authRoute } from './_auth';
import { api } from '../api/client';

interface Member {
  id: string;
  role: string;
  status: string;
  user: {
    id: string;
    email: string;
    display_name: string;
    status: string;
  };
}

interface OrganizationItem {
  id: string;
  name: string;
  organization_type: string;
  status: string;
  members: Member[];
}

interface OrganizationsResponse {
  items: OrganizationItem[];
}

interface MembersResponse {
  items: Member[];
}

function OrganizationPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newMember, setNewMember] = useState({ email: '', display_name: '', password: '', role: 'developer' });

  const { data, isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.get<OrganizationsResponse>('/v1/organizations'),
  });

  const org = data?.items[0];

  const { data: membersData } = useQuery({
    queryKey: ['members', org?.id],
    queryFn: () => api.get<MembersResponse>(`/v1/organizations/${org!.id}/members`),
    enabled: !!org?.id,
  });

  const addMemberMutation = useMutation({
    mutationFn: () =>
      api.post(`/v1/organizations/${org!.id}/members`, newMember),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', org?.id] });
      setAdding(false);
      setNewMember({ email: '', display_name: '', password: '', role: 'developer' });
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ memberId, input }: { memberId: string; input: { role?: string; status?: string } }) =>
      api.patch(`/v1/organizations/${org!.id}/members/${memberId}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', org?.id] }),
  });

  const members = membersData?.items ?? org?.members ?? [];
  const roles = ['platform_admin', 'org_admin', 'service_admin', 'developer', 'viewer'];

  if (isLoading) {
    return <div className="empty-state"><p><span className="spinner" /> Loading...</p></div>;
  }

  if (!org) {
    return <div className="empty-state"><p>No organization found.</p></div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{org.name}</h1>
          <p style={{ margin: 0 }}>
            <span className={`badge badge-active mr-2`}>{org.organization_type}</span>
            {org.status}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          Add Member
        </button>
      </div>

      {error && <div className="form-error mb-4">{error}</div>}

      {adding && (
        <div className="card mb-4">
          <h2>Add Member</h2>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="mem-email">Email</label>
              <input id="mem-email" type="email" value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} required />
            </div>
            <div className="form-group">
              <label htmlFor="mem-name">Display Name</label>
              <input id="mem-name" value={newMember.display_name} onChange={(e) => setNewMember({ ...newMember, display_name: e.target.value })} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="mem-password">Password</label>
              <input id="mem-password" type="password" value={newMember.password} onChange={(e) => setNewMember({ ...newMember, password: e.target.value })} required />
            </div>
            <div className="form-group">
              <label htmlFor="mem-role">Role</label>
              <select id="mem-role" value={newMember.role} onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="flex-row">
            <button className="btn-primary" onClick={() => addMemberMutation.mutate()} disabled={addMemberMutation.isPending}>
              {addMemberMutation.isPending ? 'Adding...' : 'Add Member'}
            </button>
            <button className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Display Name</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.user.email}</td>
                <td>{m.user.display_name}</td>
                <td>
                  <select
                    value={m.role}
                    onChange={(e) => updateMemberMutation.mutate({ memberId: m.id, input: { role: e.target.value } })}
                  >
                    {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td>
                  <select
                    value={m.status}
                    onChange={(e) => updateMemberMutation.mutate({ memberId: m.id, input: { status: e.target.value } })}
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const organizationRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/organization',
  component: OrganizationPage,
});
