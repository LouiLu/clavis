import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { AuthProvider } from './auth/auth-context';
import { rootRoute } from './routes/__root';
import { loginRoute } from './routes/login';
import { authRoute } from './routes/_auth';
import { indexRoute } from './routes/index';
import { servicesIndexRoute } from './routes/services.index';
import { servicesCreateRoute } from './routes/services.create';
import { servicesDetailRoute } from './routes/services.$serviceId';
import { servicesKeysRoute } from './routes/services.$serviceId.keys';
import { organizationRoute } from './routes/organization';
import { accountRoute } from './routes/account';
import { auditLogsRoute } from './routes/audit-logs';
import { docsRoute } from './routes/docs';
import './styles.css';

const routeTree = rootRoute.addChildren([
  loginRoute,
  authRoute.addChildren([
    indexRoute,
    servicesIndexRoute,
    servicesCreateRoute,
    servicesDetailRoute,
    servicesKeysRoute,
    accountRoute,
    organizationRoute,
    auditLogsRoute,
    docsRoute,
  ]),
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
