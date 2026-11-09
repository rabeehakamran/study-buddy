import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { fmtHours, userTimeZone } from '../lib/stats';
import ErrorBanner from '../components/ErrorBanner';
import PageHeader from '../components/PageHeader';
import PixelArt from '../pixel/PixelArt';
import { FLAME, FLAME_OFF_PALETTE, FLAME_PALETTE, TROPHY, TROPHY_PALETTE } from '../pixel/sprites';

type Group = { id: string; name: string; invite_code: string; created_by: string; created_at: string };
type Row = {
  user_id: string;
  display_name: string;
  week_seconds: number;
  today_seconds: number;
  streak: number;
  is_me: boolean;
};

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Friends() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const pickKey = `sb.group.${userId}`;
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return localStorage.getItem(pickKey);
    } catch {
      return null;
    }
  });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadGroups = useCallback(async () => {
    const { data, error } = await supabase.from('study_groups').select('*').order('created_at');
    if (error) return setError(error.message);
    setGroups((data ?? []) as Group[]);
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const group = groups?.find((g) => g.id === selected) ?? groups?.[0] ?? null;

  function pick(id: string) {
    setSelected(id);
    try {
      localStorage.setItem(pickKey, id);
    } catch {
      /* ignore */
    }
  }

  // Leaderboard, refreshed every minute.
  useEffect(() => {
    if (!group) return;
    let alive = true;
    const load = () =>
      supabase.rpc('group_leaderboard', { gid: group.id, tz: userTimeZone() }).then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(error.message);
        else
          setRows(
            ((data ?? []) as Row[]).sort(
              (a, b) => b.week_seconds - a.week_seconds || b.streak - a.streak || a.display_name.localeCompare(b.display_name),
            ),
          );
      });
    setRows(null);
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [group?.id]); // only refetch when the group changes

  async function onCreated(g: Group) {
    await loadGroups();
    pick(g.id);
  }

  async function leave() {
    if (!group || !confirm(`Leave "${group.name}"? You can join again later with the code.`)) return;
    const { error } = await supabase.rpc('leave_group', { gid: group.id });
    if (error) return setError(error.message);
    setSelected(null);
    await loadGroups();
  }

  // ---------- owner tools ----------
  const isOwner = !!group && group.created_by === userId;

  async function removeMember(r: Row) {
    if (!group || !confirm(`Remove ${r.display_name} from "${group.name}"?`)) return;
    const { error } = await supabase.rpc('remove_member', { gid: group.id, member: r.user_id });
    if (error) return setError(error.message);
    setRows((rs) => rs?.filter((x) => x.user_id !== r.user_id) ?? null);
  }

  async function newCode() {
    if (!group || !confirm('Make a new invite code? The old code will stop working (people already in the group stay).')) return;
    const { data, error } = await supabase.rpc('regenerate_invite_code', { gid: group.id });
    if (error) return setError(error.message);
    setGroups((gs) => gs?.map((g) => (g.id === group.id ? { ...g, invite_code: data as string } : g)) ?? null);
  }

  async function copyCode() {
    if (!group) return;
    try {
      await navigator.clipboard.writeText(group.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Couldn’t copy. Select the code and copy it by hand.');
    }
  }

  const leaderSecs = Math.max(1, ...(rows ?? []).map((r) => r.week_seconds));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Friends"
        subtitle="Study together! Weekly hours leaderboard, resets every Monday."
        art={<PixelArt rows={TROPHY} palette={TROPHY_PALETTE} className="w-full" />}
      />

      <ErrorBanner message={error} onClose={() => setError(null)} />

      {groups === null ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            {groups.length > 1 && (
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="Your groups">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    role="tab"
                    aria-selected={g.id === group?.id}
                    onClick={() => pick(g.id)}
                    className={`btn ${g.id === group?.id ? 'bg-primary-soft text-primary' : 'btn-ghost'}`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}

            {!group ? (
              <section className="card flex flex-col items-center gap-3 p-8 text-center">
                <PixelArt rows={TROPHY} palette={TROPHY_PALETTE} className="w-16 animate-bob" />
                <p className="font-pixel text-xl">No study group yet</p>
                <p className="max-w-sm text-sm text-muted">
                  Make a group and send the code to your friends, or join theirs with a code. →
                </p>
              </section>
            ) : (
              <section className="card p-4">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <h2 className="flex-1 text-2xl font-bold">{group.name}</h2>
                  <button className="font-pixel bg-surface-2 px-3 py-1.5 text-lg tracking-widest" onClick={copyCode} title="Copy invite code">
                    {group.invite_code} <span className="text-xs text-muted">{copied ? 'copied!' : 'copy'}</span>
                  </button>
                  {isOwner && (
                    <button className="btn btn-ghost px-2 text-xs" onClick={newCode} title="Old code stops working">
                      New code
                    </button>
                  )}
                </div>

                {rows === null ? (
                  <p className="text-sm text-muted">Loading leaderboard…</p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {rows.map((r, i) => (
                      <li key={r.user_id} className={`flex items-center gap-3 p-2 ${r.is_me ? 'bg-primary-soft' : 'bg-surface-2'}`}>
                        <span className="font-pixel w-8 text-center text-xl">{MEDALS[i] ?? `#${i + 1}`}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate font-semibold">
                              {r.display_name}
                              {r.user_id === group.created_by && <span title="Group owner"> 👑</span>}
                              {r.is_me && <span className="text-xs text-primary"> (you)</span>}
                            </span>
                            <span className="font-pixel text-lg">{fmtHours(r.week_seconds)}</span>
                          </div>
                          <div className="mt-1 h-2 bg-bg">
                            <div className="h-full bg-accent" style={{ width: `${(r.week_seconds / leaderSecs) * 100}%` }} />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs text-muted">
                            <span>{fmtHours(r.today_seconds)} today</span>
                            {isOwner && !r.is_me && (
                              <button className="hover:text-danger" onClick={() => removeMember(r)} aria-label={`Remove ${r.display_name}`}>
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                        <span className="flex w-12 items-center justify-end gap-1" title={`${r.streak} day streak`} aria-label={`${r.streak} day streak`}>
                          <PixelArt rows={FLAME} palette={r.streak > 0 ? FLAME_PALETTE : FLAME_OFF_PALETTE} className="w-4" />
                          <span className="font-pixel text-lg">{r.streak}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    Only share the code with friends you know 💜 · updates every minute
                    {isOwner && ' · You’re the owner: you can remove people or make a new code'}
                  </span>
                  <button className="btn btn-ghost text-xs" onClick={leave}>
                    Leave group
                  </button>
                </div>
              </section>
            )}
          </div>

          <div className="space-y-6">
            <JoinCard onJoined={onCreated} onError={setError} />
            <CreateCard onCreated={onCreated} onError={setError} />
          </div>
        </div>
      )}
    </div>
  );
}

function JoinCard({ onJoined, onError }: { onJoined: (g: Group) => void; onError: (m: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc('join_group', { code });
    setBusy(false);
    if (error) return onError(error.message);
    setCode('');
    onJoined(data as Group);
  }
  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="text-xl font-bold">Join a group</h2>
      <input
        className="input font-pixel w-full text-lg uppercase tracking-widest"
        placeholder="CODE"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        maxLength={10}
        aria-label="Invite code"
      />
      <button className="btn btn-primary w-full" disabled={busy || code.trim().length < 6}>
        Join
      </button>
    </form>
  );
}

function CreateCard({ onCreated, onError }: { onCreated: (g: Group) => void; onError: (m: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc('create_group', { group_name: name });
    setBusy(false);
    if (error) return onError(error.message);
    setName('');
    onCreated(data as Group);
  }
  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="text-xl font-bold">Make a group</h2>
      <input
        className="input w-full"
        placeholder="e.g. Bow Squad 🎀"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        aria-label="Group name"
      />
      <button className="btn btn-primary w-full" disabled={busy || !name.trim()}>
        Create
      </button>
    </form>
  );
}
