import { NavLink, Outlet } from 'react-router-dom';
import { displayName, useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

const links = [
  { to: '/', label: 'Today', end: true },
  { to: '/subjects', label: 'Subjects', end: false },
  { to: '/timetable', label: 'Timetable', end: false },
];

export default function Layout() {
  const { session } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-lg font-extrabold text-primary">🎀 Study Buddy</span>
          <nav className="flex gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-semibold ${isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:text-ink'}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted">Hi, {displayName(session)}</span>
            <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
