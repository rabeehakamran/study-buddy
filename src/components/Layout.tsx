import { NavLink, Outlet } from 'react-router-dom';
import { displayName, useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import PixelArt from '../pixel/PixelArt';
import { MASCOT_PALETTE, mascotRows } from '../pixel/sprites';
import { FocusProvider, fmtClock, useFocus } from '../focus/FocusProvider';
import CameraDock from '../presence/CameraDock';

const links = [
  { to: '/', label: 'Today', end: true },
  { to: '/focus', label: 'Focus', end: false },
  { to: '/subjects', label: 'Subjects', end: false },
  { to: '/timetable', label: 'Timetable', end: false },
  { to: '/progress', label: 'Progress', end: false },
  { to: '/friends', label: 'Friends', end: false },
];

export default function Layout() {
  const { session } = useAuth();
  return (
    <FocusProvider userId={session!.user.id}>
      <div className="min-h-screen pb-24">
        <header className="border-b-[3px] border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <span className="flex items-center gap-2">
              <PixelArt rows={mascotRows('happy')} palette={MASCOT_PALETTE} className="w-8" />
              <span className="font-pixel text-xl font-bold text-primary">Study Buddy</span>
            </span>
            <nav className="flex flex-wrap gap-1">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) =>
                    `font-pixel px-3 py-1.5 text-base ${isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:text-ink'}`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2 text-sm">
              <TimerChip />
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
      <CameraDock />
    </FocusProvider>
  );
}

/** Running timer, visible from every page. */
function TimerChip() {
  const { pomo } = useFocus();
  if (pomo.state.status === 'idle') return null;
  return (
    <NavLink to="/focus" className="font-pixel bg-primary-soft px-2 py-1 text-base text-primary tabular-nums">
      {pomo.state.status === 'paused' ? '❚❚' : pomo.state.mode === 'focus' ? '▶' : '☕'} {fmtClock(pomo.remainingMs)}
    </NavLink>
  );
}
