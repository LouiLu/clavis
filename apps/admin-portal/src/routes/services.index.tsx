import { createRoute } from '@tanstack/react-router';
import { authRoute } from './_auth';

function ServicesListPage() {
  return (
    <div>
      <div className="page-header">
        <h1>Backend Services</h1>
      </div>
      <div className="card">
        <p>Service management will be built in the next task.</p>
      </div>
    </div>
  );
}

export const servicesIndexRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/services',
  component: ServicesListPage,
});
