import { createRoute, Outlet } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { AuthGuard } from '../auth/auth-guard';
import { Layout } from '../components/layout';

export const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_auth',
  component: () => (
    <AuthGuard>
      <Layout />
    </AuthGuard>
  ),
});
