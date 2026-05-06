import { Link, Outlet } from '@tanstack/react-router';
import { useAuth } from '../auth/auth-context';

const navLink = (to: string, label: string) => (
  <Link
    key={to}
    to={to}
    className="nav-item"
    activeProps={{ className: 'nav-item active' }}
  >
    {label}
  </Link>
);

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">Clavis</h2>
        </div>
        <nav className="sidebar-nav">
          {navLink('/', 'Dashboard')}
          {navLink('/services', 'Services')}
          {navLink('/organization', 'Organization')}
          {navLink('/audit-logs', 'Audit Logs')}
        </nav>
        {user && (
          <div className="sidebar-footer">
            <span className="sidebar-user">{user.email}</span>
            <button className="btn-ghost" onClick={logout}>
              Sign out
            </button>
          </div>
        )}
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
