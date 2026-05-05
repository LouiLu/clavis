import { createRoute } from '@tanstack/react-router';
import { authRoute } from './_auth';

export const servicesDetailRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/services/$serviceId',
  component: () => null,
});
