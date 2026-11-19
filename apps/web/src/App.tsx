import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { Toaster } from 'sonner';
import { isFirebaseConfigured } from './lib/config';
import { AuthProvider, useAuth } from './state/auth';
import { useWorkspace, WorkspaceProvider } from './state/workspace';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';
import { LandingPage } from './pages/Landing';
import { SetupRequiredPage } from './pages/SetupRequired';
import { SignInPage, SignUpPage } from './pages/AuthPages';
import { OnboardingPage } from './pages/Onboarding';
import { VerifyBanner } from './components/VerifyBanner';

const DashboardPage = lazy(() => import('./pages/Dashboard'));
const MeetingsPage = lazy(() => import('./pages/Meetings'));
const NewMeetingPage = lazy(() => import('./pages/NewMeeting'));
const MeetingDetailPage = lazy(() => import('./pages/MeetingDetail'));
const LiveCapturePage = lazy(() => import('./pages/LiveCapture'));
const CommitmentsPage = lazy(() => import('./pages/Commitments'));
const CommitmentDetailPage = lazy(() => import('./pages/CommitmentDetail'));
const DecisionsPage = lazy(() => import('./pages/Decisions'));
const MemoryPage = lazy(() => import('./pages/Memory'));
const PreparePage = lazy(() => import('./pages/Prepare'));
const ExecutionPage = lazy(() => import('./pages/Execution'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const NotFoundPage = lazy(() => import('./pages/NotFound'));

function FullPageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="size-5" />
    </div>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<FullPageSpinner />}>{children}</Suspense>;
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return (
    <WorkspaceProvider>
      <RequireWorkspace />
    </WorkspaceProvider>
  );
}

function RequireWorkspace() {
  const { workspacesLoaded, workspace, error } = useWorkspace();
  if (!workspacesLoaded) return <FullPageSpinner />;
  if (!workspace) return <OnboardingPage error={error} />;
  return <AppShell banner={<VerifyBanner />} />;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (user) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/app') ? next : '/app'} replace />;
  }
  return <>{children}</>;
}

function Root() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }} />
    </AuthProvider>
  );
}

const router = isFirebaseConfigured
  ? createBrowserRouter([
      {
        element: <Root />,
        children: [
          { path: '/', element: <LandingPage /> },
          { path: '/signin', element: <PublicOnly><SignInPage /></PublicOnly> },
          { path: '/signup', element: <PublicOnly><SignUpPage /></PublicOnly> },
          {
            path: '/app',
            element: <RequireAuth />,
            children: [
              { index: true, element: <Lazy><DashboardPage /></Lazy> },
              { path: 'meetings', element: <Lazy><MeetingsPage /></Lazy> },
              { path: 'meetings/new', element: <Lazy><NewMeetingPage /></Lazy> },
              { path: 'meetings/:id', element: <Lazy><MeetingDetailPage /></Lazy> },
              { path: 'meetings/:id/live', element: <Lazy><LiveCapturePage /></Lazy> },
              { path: 'commitments', element: <Lazy><CommitmentsPage /></Lazy> },
              { path: 'commitments/:id', element: <Lazy><CommitmentDetailPage /></Lazy> },
              { path: 'decisions', element: <Lazy><DecisionsPage /></Lazy> },
              { path: 'memory', element: <Lazy><MemoryPage /></Lazy> },
              { path: 'prepare', element: <Lazy><PreparePage /></Lazy> },
              { path: 'execution', element: <Lazy><ExecutionPage /></Lazy> },
              { path: 'settings', element: <Lazy><SettingsPage /></Lazy> },
              { path: '*', element: <Lazy><NotFoundPage /></Lazy> },
            ],
          },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ])
  : createBrowserRouter([
      { path: '/', element: <LandingPage setupMode /> },
      { path: '*', element: <SetupRequiredPage /> },
    ]);

export function App() {
  return <RouterProvider router={router} />;
}
