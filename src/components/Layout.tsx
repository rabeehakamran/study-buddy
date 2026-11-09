import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { displayName, useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import PixelArt from '../pixel/PixelArt';
import { MASCOT_PALETTE, mascotRows } from '../pixel/sprites';
import { FocusProvider, fmtClock, useFocus } from '../focus/FocusProvider';
import CameraDock from '../presence/CameraDock';

const links = [
  { to: '/', label: 'Today', icon: '🏠', end: true },
  { to: '/focus', label: 'Focus', icon: '⏳', end: false },
  { to: '/subjects', label: 'Subjects', icon: '📚', end: false },
  { to: '/timetable', label: 'Timetable', icon: '📅', end: false },
  { to: '/tutor', label: 'Ask Buddy', icon: '💬', end: false },
  { to: '/quiz', label: 'Quiz', icon: '✨', end: false },
  { to: '/progress', label: 'Progress', icon: '🔥', end: false },
  { to: '/friends', label: 'Friends', icon: '🏆', end: false },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `font-pixel px-3 py-1.5 text-base ${isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:text-ink'}`;

export default function Layout() {
  const { session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the phone menu after navigating.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <FocusProvider userId={session!.user.id}>
      <div className="min-h-screen pb-24">
        <header className="sticky top-0 z-30 border-b-[3px] border-line bg-bg/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <NavLink to="/" className="flex items-center gap-2">
              <PixelArt rows={mascotRows('happy')} palette={MASCOT_PALETTE} className="w-8" />
              <span className="font-pixel text-xl font-bold text-primary">Study Buddy</span>
            </NavLink>

            {/* Laptop: links in the header */}
            <nav className="hidden flex-wrap gap-1 lg:flex" aria-label="Main">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                  {l.label}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2 text-sm">
              <TimerChip />
              <span className="hidden text-muted lg:inline">Hi, {displayName(session)}</span>
              <button className="btn btn-ghost hidden lg:inline-flex" onClick={() => supabase.auth.signOut()}>
                Sign out
              </button>
              {/* Phone / tablet: menu button */}
              <button
                className="btn btn-ghost px-3 lg:hidden"
                aria-expanded={menuOpen}
                aria-controls="phone-menu"
                onClick={() => setMenuOpen((o) => !o)}
              >
                {menuOpen ? '✕' : '☰'} Menu
              </button>
            </div>
          </div>

          {menuOpen && (
            <nav id="phone-menu" aria-label="Main" className="mx-auto max-w-6xl border-t-[3px] border-line px-4 pb-4 pt-3 lg:hidden">
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                {links.map((l) => (
                  <NavLink key={l.to} to={l.to} end={l.end} className={(s) => `${linkClass(s)} flex items-center gap-2 py-2.5`}>
                    <span aria-hidden>{l.icon}</span>
                    {l.label}
                  </NavLink>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t-[3px] border-line pt-3 text-sm">
                <span className="text-muted">Hi, {displayName(session)} 🎀</span>
                <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>
                  Sign out
                </button>
              </div>
            </nav>
          )}
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
