import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { usePomodoro, type FinishedSession, type Mode } from '../lib/usePomodoro';
import { isLoggedInStatus, usePresence } from '../presence/usePresence';
import type { PresenceEvent, StudySession } from '../lib/types';

export const MODE_LABEL: Record<Mode, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' };

export function fmtClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function useFocusState(userId: string) {
  const [today, setToday] = useState<StudySession[]>([]);
  const [events, setEvents] = useState<PresenceEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<FinishedSession | null>(null);

  // ---------- today's data ----------
  useEffect(() => {
    const since = startOfToday().toISOString();
    supabase
      .from('study_sessions')
      .select('*')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .then(({ data, error }) => (error ? setError(error.message) : setToday((data ?? []) as StudySession[])));
    supabase
      .from('presence_events')
      .select('*')
      .gte('at', since)
      .order('at')
      .then(({ data, error }) => (error ? setError(error.message) : setEvents((data ?? []) as PresenceEvent[])));
  }, []);

  // ---------- pomodoro ----------
  async function saveSession(f: FinishedSession) {
    const { data, error } = await supabase
      .from('study_sessions')
      .insert({
        subject_id: f.subjectId,
        task_id: f.taskId,
        started_at: new Date(f.startedAt).toISOString(),
        ended_at: new Date(f.endedAt).toISOString(),
        focus_seconds: f.focusSeconds,
        planned_minutes: f.plannedMinutes,
        completed: f.completed,
      })
      .select()
      .single();
    if (error) return setError(`Couldn't save that session: ${error.message}`);
    if (f.startedAt >= startOfToday().getTime()) setToday((r) => [data as StudySession, ...r]);
    if (f.completed) setJustDone(f);
  }

  const pomo = usePomodoro(userId, saveSession);

  // ---------- camera buddy ----------
  const camKey = `sb.camera.${userId}`;
  const [cameraOn, setCameraOnState] = useState(() => {
    try {
      return localStorage.getItem(camKey) === '1';
    } catch {
      return false;
    }
  });
  const setCameraOn = useCallback(
    (on: boolean) => {
      setCameraOnState(on);
      try {
        localStorage.setItem(camKey, on ? '1' : '0');
      } catch {
        /* ignore */
      }
    },
    [camKey],
  );
  const [faceVersion, setFaceVersion] = useState(0);
  const presence = usePresence(userId, cameraOn, faceVersion);

  const logEvent = useCallback(async (kind: 'in' | 'out', reason: string | null, at = Date.now()) => {
    const { data, error } = await supabase
      .from('presence_events')
      .insert({ kind, reason, at: new Date(at).toISOString() })
      .select()
      .single();
    if (error) return setError(`Couldn't save desk log: ${error.message}`);
    setEvents((r) => [...r, data as PresenceEvent].sort((a, b) => (a.at < b.at ? -1 : 1)));
  }, []);

  const loggedIn = useRef(false);
  const pausedByPresence = useRef(false);

  useEffect(() => {
    const st = pomo.state;
    if (isLoggedInStatus(presence.status)) {
      if (!loggedIn.current) {
        loggedIn.current = true;
        logEvent('in', null);
      }
      if (pausedByPresence.current) {
        pausedByPresence.current = false;
        if (st.status === 'paused' && st.mode === 'focus') pomo.start();
      }
    } else if (presence.status === 'away') {
      const leftAt = presence.lastSeenAt();
      if (loggedIn.current) {
        loggedIn.current = false;
        logEvent('out', 'away', leftAt);
      }
      if (st.status === 'running' && st.mode === 'focus') {
        pomo.pause(leftAt); // time after she left doesn't count
        pausedByPresence.current = true;
      }
    } else if (presence.status === 'off' || presence.status === 'error' || presence.status === 'needs-setup') {
      if (loggedIn.current) {
        loggedIn.current = false;
        logEvent('out', 'camera off');
      }
      pausedByPresence.current = false;
    }
  }, [presence.status, pomo.state.status]); // react only to status changes

  // Log out if she signs out / the app unmounts while logged in.
  useEffect(
    () => () => {
      if (loggedIn.current) void logEvent('out', 'closed');
    },
    [logEvent],
  );

  // Countdown in the browser tab title, on every page.
  const { status, mode } = pomo.state;
  const clock = fmtClock(pomo.remainingMs);
  useEffect(() => {
    document.title = status === 'idle' ? 'Study Buddy' : `${clock} · ${MODE_LABEL[mode]}${status === 'paused' ? ' (paused)' : ''}`;
  }, [clock, status, mode]);

  return {
    pomo,
    today,
    events,
    error,
    clearError: () => setError(null),
    justDone,
    clearJustDone: () => setJustDone(null),
    camera: {
      on: cameraOn,
      setOn: setCameraOn,
      ...presence,
      pausedByPresence: () => pausedByPresence.current,
      faceChanged: () => setFaceVersion((v) => v + 1),
    },
  };
}

type FocusCtx = ReturnType<typeof useFocusState>;
const Ctx = createContext<FocusCtx | null>(null);

/** Pomodoro + camera buddy live here so they keep running on every page. */
export function FocusProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const value = useFocusState(userId);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFocus() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFocus must be used inside FocusProvider');
  return v;
}
