import { createRoute } from '@tanstack/react-router';
import { authRoute } from './_auth';

export const servicesKeysRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/services/$serviceId/keys',
  component: () => null,
});
