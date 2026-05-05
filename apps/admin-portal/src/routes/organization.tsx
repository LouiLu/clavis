import { createRoute } from '@tanstack/react-router';
import { authRoute } from './_auth';

function OrganizationPage() {
  return (
    <div>
      <div className="page-header">
        <h1>Organization</h1>
      </div>
      <div className="card">
        <p>Organization management will be built in a later task.</p>
      </div>
    </div>
  );
}

export const organizationRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/organization',
  component: OrganizationPage,
});
