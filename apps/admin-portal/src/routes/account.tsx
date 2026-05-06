import { createRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { authRoute } from './_auth';
import { useAuth } from '../auth/auth-context';
import { api } from '../api/client';
import { Toast } from '../components/toast';

function AccountPage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavingProfile(true);
    try {
      await api.post('/v1/me/profile', { display_name: displayName });
      setToast('Profile updated');
    } catch {
      setError('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavingPassword(true);
    try {
      const result = await api.post<{ ok: boolean; error?: string }>(
        '/v1/me/change-password',
        { current_password: currentPassword, new_password: newPassword },
      );
      if (!result.ok) {
        setError(result.error ?? 'Failed to change password');
      } else {
        setToast('Password changed');
        setCurrentPassword('');
        setNewPassword('');
      }
    } catch {
      setError('Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user) {
    return <div className="empty-state"><p><span className="spinner" /> Loading...</p></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Account Settings</h1>
      </div>

      {error && <div className="form-error mb-4">{error}</div>}

      <div className="card mb-4">
        <h2>Profile</h2>
        <div className="detail-grid" style={{ marginTop: 8 }}>
          <strong>Email</strong>
          <span className="text-mono">{user.email}</span>

          <strong>User Type</strong>
          <span>{user.user_type}</span>

          <strong>Status</strong>
          <span className={`badge badge-${user.status === 'active' ? 'active' : 'disabled'}`}>
            {user.status}
          </span>

          <strong>Organizations</strong>
          <span>{user.organizations.map((o) => `${o.name} (${o.role})`).join(', ')}</span>
        </div>

        <form onSubmit={handleSaveProfile} style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
          <div className="form-group">
            <label htmlFor="display-name">Display Name</label>
            <input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={savingProfile}>
            {savingProfile ? <><span className="spinner" /> Saving...</> : 'Save'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Change Password</h2>
        <form onSubmit={handleChangePassword} style={{ marginTop: 12 }}>
          <div className="form-group">
            <label htmlFor="current-password">Current Password</label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="new-password">New Password</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={savingPassword}>
            {savingPassword ? <><span className="spinner" /> Changing...</> : 'Change Password'}
          </button>
        </form>
      </div>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

export const accountRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/account',
  component: AccountPage,
});
