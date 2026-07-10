import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

/* ============================================================
   ProtectedRoute — Guards /ngo/* routes
   Redirects unauthenticated users to the Landing page
   ============================================================ */

export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}
