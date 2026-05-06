import { useCallback, useState } from 'react';
import { Link, Outlet } from '@tanstack/react-router';
import { useAuth } from '../auth/auth-context';

export function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  const navLink = (to: string, label: string) => (
    <Link
      key={to}
      to={to}
      className="nav-item"
      activeProps={{ className: 'nav-item active' }}
      onClick={close}
    >
      {label}
    </Link>
  );

  return (
    <div className="layout">
      <button className="menu-toggle" onClick={() => setOpen(!open)} aria-label="Toggle menu">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>

      {open && <div className="sidebar-overlay" onClick={close} />}

      <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <a href="/" className="sidebar-brand">
            <img src="/clavis-icon.svg" alt="" width="22" height="22" className="sidebar-logo" />
            <h2 className="sidebar-title">Clavis</h2>
          </a>
        </div>
        <nav className="sidebar-nav">
          {navLink('/', 'Dashboard')}
          {navLink('/services', 'Services')}
          {navLink('/organization', 'Organization')}
          {navLink('/audit-logs', 'Audit Logs')}
        </nav>
        {user && (
          <div className="sidebar-footer">
            <button
              className="sidebar-user-btn"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span className="sidebar-user-avatar">
                {(user.display_name ?? user.email)[0].toUpperCase()}
              </span>
              <span className="sidebar-user-info">
                <span className="sidebar-user-name">{user.display_name ?? user.email}</span>
                <span className="sidebar-user-email">{user.email}</span>
              </span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`sidebar-chevron${menuOpen ? ' sidebar-chevron-up' : ''}`}>
                <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {menuOpen && (
              <div className="sidebar-menu">
                <Link
                  to="/account"
                  className="sidebar-menu-item"
                  onClick={() => setMenuOpen(false)}
                >
                  Account Settings
                </Link>
                <button className="sidebar-menu-item" onClick={logout}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
