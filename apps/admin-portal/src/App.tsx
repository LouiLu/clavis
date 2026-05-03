export function App() {
  const controlPlaneUrl = import.meta.env.VITE_CONTROL_PLANE_URL ?? 'http://localhost:4000';

  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Internal Control Plane</p>
        <h1>API Key Platform</h1>
        <p>
          Foundation is running. The full admin portal will manage users, organizations, services,
          API keys, rate limits, and audit logs in later implementation tasks.
        </p>
        <a href={`${controlPlaneUrl}/health`}>Control plane health</a>
      </section>
    </main>
  );
}
