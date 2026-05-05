import { createRoute } from '@tanstack/react-router';
import { authRoute } from './_auth';

export const servicesCreateRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/services/new',
  component: () => null,
});
