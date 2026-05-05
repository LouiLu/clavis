import { Link, Outlet } from '@tanstack/react-router';
import { useAuth } from '../auth/auth-context';

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">API Key Platform</h2>
        </div>
        <nav className="sidebar-nav">
          <Link to="/" className="nav-item" activeProps={{ className: 'nav-item active' }}>
            Dashboard
          </Link>
          <Link to="/services" className="nav-item" activeProps={{ className: 'nav-item active' }}>
            Services
          </Link>
          <Link to="/organization" className="nav-item" activeProps={{ className: 'nav-item active' }}>
            Organization
          </Link>
          <Link to="/audit-logs" className="nav-item" activeProps={{ className: 'nav-item active' }}>
            Audit Logs
          </Link>
        </nav>
        {user && (
          <div className="sidebar-footer">
            <span className="sidebar-user">{user.email}</span>
            <button className="btn-ghost" onClick={logout}>
              Log out
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
