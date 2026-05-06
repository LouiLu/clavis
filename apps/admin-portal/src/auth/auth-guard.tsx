import { Navigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useAuth } from './auth-context';

export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
}
