import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components/ui';
import { MainLayout } from './components/layout';
import { ProtectedRoute } from './components/auth';
import {
  LandingPage,
  TermsPage,
  PrivacyPage,
  FAQPage,
  ContactPage,
  LoginPage,
  RegisterPage,
  OnboardingPage,
  SettingsPage,
} from './pages';
import {
  DashboardPage,
  FollowersPage,
  StrategiesPage,
  APISetupPage,
} from './pages/master';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route
              path="/"
              element={
                <MainLayout isAuthenticated={false} showSidebar={false}>
                  <LandingPage />
                </MainLayout>
              }
            />
            <Route
              path="/terms"
              element={
                <MainLayout isAuthenticated={false} showSidebar={false}>
                  <TermsPage />
                </MainLayout>
              }
            />
            <Route
              path="/privacy"
              element={
                <MainLayout isAuthenticated={false} showSidebar={false}>
                  <PrivacyPage />
                </MainLayout>
              }
            />
            <Route
              path="/faq"
              element={
                <MainLayout isAuthenticated={false} showSidebar={false}>
                  <FAQPage />
                </MainLayout>
              }
            />
            <Route
              path="/contact"
              element={
                <MainLayout isAuthenticated={false} showSidebar={false}>
                  <ContactPage />
                </MainLayout>
              }
            />

            {/* Authentication Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute requireEmailVerified={false} requireOnboarding={false}>
                  <OnboardingPage />
                </ProtectedRoute>
              }
            />

            {/* Master Trader Routes */}
            <Route
              path="/master/dashboard"
              element={
                <ProtectedRoute requiredRole="master" requireOnboarding={true}>
                  <MainLayout isAuthenticated={true} showSidebar={true}>
                    <DashboardPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/master/followers"
              element={
                <ProtectedRoute requiredRole="master" requireOnboarding={true}>
                  <MainLayout isAuthenticated={true} showSidebar={true}>
                    <FollowersPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/master/strategies"
              element={
                <ProtectedRoute requiredRole="master" requireOnboarding={true}>
                  <MainLayout isAuthenticated={true} showSidebar={true}>
                    <StrategiesPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/master/api-setup"
              element={
                <ProtectedRoute requiredRole="master" requireOnboarding={true}>
                  <MainLayout isAuthenticated={true} showSidebar={true}>
                    <APISetupPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Shared Routes */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute requireOnboarding={true}>
                  <MainLayout isAuthenticated={true} showSidebar={true}>
                    <SettingsPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </Router>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
