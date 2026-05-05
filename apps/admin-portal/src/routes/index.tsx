import { createRoute } from '@tanstack/react-router';
import { authRoute } from './_auth';

function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>Services, keys, and activity overview.</p>
    </div>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/',
  component: DashboardPage,
});
