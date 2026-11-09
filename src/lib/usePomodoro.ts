import { useEffect, useRef, useState } from 'react';
import { playChime, unlockAudio } from './sound';

export type Mode = 'focus' | 'short' | 'long';
export type Status = 'idle' | 'running' | 'paused';

export type Settings = {
  focus: number; // minutes
  short: number;
  long: number;
  longEvery: number; // long break after this many focus sessions
  autoStartBreaks: boolean;
};

export const DEFAULT_SETTINGS: Settings = { focus: 25, short: 5, long: 15, longEvery: 4, autoStartBreaks: true };

export type TimerState = {
  mode: Mode;
  status: Status;
  totalMs: number; // length of the current phase
  remainingMs: number; // valid while idle / paused
  endsAt: number | null; // valid while running
  runStartedAt: number | null; // start of the current running stretch
  focusedMs: number; // focus time banked before the current stretch
  focusStartedAt: number | null;
  cycle: number; // focus sessions finished since the last long break
  subjectId: string | null;
  taskId: string | null;
};

export type FinishedSession = {
  subjectId: string | null;
  taskId: string | null;
  startedAt: number;
  endedAt: number;
  focusSeconds: number;
  plannedMinutes: number;
  completed: boolean;
};

const MIN_PARTIAL_MS = 60_000; // stopped sessions shorter than 1 min are not saved

export function modeMs(mode: Mode, s: Settings) {
  return (mode === 'focus' ? s.focus : mode === 'short' ? s.short : s.long) * 60_000;
}

function load<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode etc. — timer still works, just won't survive refresh */
  }
}

function idle(mode: Mode, cycle: number, s: Settings, keep: Pick<TimerState, 'subjectId' | 'taskId'>): TimerState {
  const ms = modeMs(mode, s);
  return {
    mode,
    status: 'idle',
    totalMs: ms,
    remainingMs: ms,
    endsAt: null,
    runStartedAt: null,
    focusedMs: 0,
    focusStartedAt: null,
    cycle,
    ...keep,
  };
}

/**
 * Pomodoro engine. Time is computed from timestamps (not by counting ticks),
 * so it stays accurate when the tab is in the background and survives a refresh.
 * `onFinish` is called when a focus session ends (fully, or stopped after ≥ 1 min).
 */
export function usePomodoro(
  userId: string,
  onFinish: (s: FinishedSession) => void,
  /** Called once when a NEW focus session starts (not on resume) — used to register it with the server. */
  onFocusBegin?: (s: TimerState) => void,
) {
  const settingsKey = `sb.pomo.settings.${userId}`;
  const stateKey = `sb.pomo.state.${userId}`;

  const settingsRef = useRef<Settings>(load(settingsKey, DEFAULT_SETTINGS));
  const stateRef = useRef<TimerState>(
    load(stateKey, idle('focus', 0, settingsRef.current, { subjectId: null, taskId: null })),
  );
  const onFinishRef = useRef(onFinish);
  const onFocusBeginRef = useRef(onFocusBegin);
  const [, rerender] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    onFinishRef.current = onFinish;
    onFocusBeginRef.current = onFocusBegin;
  });

  function commit(next: TimerState) {
    stateRef.current = next;
    store(stateKey, next);
    rerender((n) => n + 1);
  }

  const keep = () => ({ subjectId: stateRef.current.subjectId, taskId: stateRef.current.taskId });

  function reportFocus(st: TimerState, endedAt: number, completed: boolean) {
    const running = st.status === 'running' && st.runStartedAt !== null ? endedAt - st.runStartedAt : 0;
    const focused = Math.min(st.focusedMs + running, st.totalMs);
    if (!completed && focused < MIN_PARTIAL_MS) return;
    onFinishRef.current({
      subjectId: st.subjectId,
      taskId: st.taskId,
      startedAt: st.focusStartedAt ?? endedAt - focused,
      endedAt,
      focusSeconds: Math.round(focused / 1000),
      plannedMinutes: Math.round(st.totalMs / 60_000),
      completed,
    });
  }

  /** Current phase reached zero. */
  function complete(st: TimerState) {
    const s = settingsRef.current;
    const at = st.endsAt!;
    const fresh = Date.now() - at < 10_000; // don't chime for phases that ended while the app was closed

    if (st.mode === 'focus') {
      reportFocus(st, at, true);
      const cycle = st.cycle + 1;
      const next: Mode = cycle % s.longEvery === 0 ? 'long' : 'short';
      const base = idle(next, cycle, s, keep());
      commit(s.autoStartBreaks ? { ...base, status: 'running', endsAt: at + base.totalMs, runStartedAt: at } : base);
      if (fresh) playChime('up');
    } else {
      commit(idle('focus', st.mode === 'long' ? 0 : st.cycle, s, keep()));
      if (fresh) playChime('down');
    }
  }

  useEffect(() => {
    const tick = () => {
      const st = stateRef.current;
      if (st.status === 'running' && st.endsAt !== null && Date.now() >= st.endsAt) complete(st);
      setNow(Date.now());
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, []); // runs once; reads everything through refs

  const st = stateRef.current;

  const actions = {
    start() {
      const cur = stateRef.current;
      if (cur.status === 'running') return;
      unlockAudio();
      const t = Date.now();
      const isNewFocus = cur.mode === 'focus' && cur.focusStartedAt === null;
      const next: TimerState = {
        ...cur,
        status: 'running',
        endsAt: t + cur.remainingMs,
        runStartedAt: t,
        focusStartedAt: cur.mode === 'focus' ? (cur.focusStartedAt ?? t) : null,
      };
      commit(next);
      if (isNewFocus) onFocusBeginRef.current?.(next);
    },
    /** Pause now, or "as of" an earlier moment (used when she walked away). */
    pause(at?: number) {
      const cur = stateRef.current;
      if (cur.status !== 'running' || cur.endsAt === null || cur.runStartedAt === null) return;
      const t = Math.min(Date.now(), Math.max(at ?? Date.now(), cur.runStartedAt));
      commit({
        ...cur,
        status: 'paused',
        remainingMs: Math.max(0, cur.endsAt - t),
        endsAt: null,
        runStartedAt: null,
        focusedMs: cur.mode === 'focus' ? cur.focusedMs + (t - cur.runStartedAt) : cur.focusedMs,
      });
    },
    /** End the current focus early (saved if ≥ 1 min) or cancel a break. */
    stop() {
      const cur = stateRef.current;
      if (cur.mode === 'focus' && cur.status !== 'idle') reportFocus(cur, Date.now(), false);
      commit(idle('focus', cur.mode === 'long' ? 0 : cur.cycle, settingsRef.current, keep()));
    },
    setMode(mode: Mode) {
      if (stateRef.current.status !== 'idle') return;
      commit(idle(mode, stateRef.current.cycle, settingsRef.current, keep()));
    },
    setTarget(subjectId: string | null, taskId: string | null) {
      commit({ ...stateRef.current, subjectId, taskId });
    },
    setSettings(next: Settings) {
      settingsRef.current = next;
      store(settingsKey, next);
      const cur = stateRef.current;
      if (cur.status === 'idle') commit(idle(cur.mode, cur.cycle, next, keep()));
      else rerender((n) => n + 1);
    },
  };

  const remainingMs = st.status === 'running' && st.endsAt !== null ? Math.max(0, st.endsAt - now) : st.remainingMs;

  return { state: st, settings: settingsRef.current, remainingMs, ...actions };
}
