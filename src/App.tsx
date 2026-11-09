import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { supabaseConfigured } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Subjects from './pages/Subjects';
import Timetable from './pages/Timetable';
import Focus from './pages/Focus';
import FaceSetup from './pages/FaceSetup';
import Mascot from './pixel/Mascot';

export default function App() {
  if (!supabaseConfigured) return <SetupNeeded />;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <p className="p-8 text-center text-muted">Loading…</p>;
  if (!session) return <Login />;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="subjects" element={<Subjects />} />
          <Route path="timetable" element={<Timetable />} />
          <Route path="focus" element={<Focus />} />
          <Route path="face-setup" element={<FaceSetup />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function SetupNeeded() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-md p-6 text-center">
        <Mascot mood="sad" className="mb-4 w-20" />
        <h1 className="mb-2 text-2xl font-bold">Almost ready</h1>
        <p className="text-sm text-muted">
          Supabase isn't connected yet. Copy <code>.env.example</code> to <code>.env</code>, fill in your project URL and key,
          then restart <code>npm run dev</code>. See README.md for the steps.
        </p>
      </div>
    </div>
  );
}
