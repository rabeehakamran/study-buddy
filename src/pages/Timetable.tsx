import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useRows } from '../lib/useRows';
import { DAYS, type Slot, type Subject } from '../lib/types';
import { fmtTime, todayIndex } from '../lib/format';
import ErrorBanner from '../components/ErrorBanner';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import PixelArt from '../pixel/PixelArt';
import { CALENDAR, CALENDAR_PALETTE } from '../pixel/sprites';

type Editing = { subject: Subject; day: number; slot: Slot | null };
type SlotValues = { start_time: string; end_time: string; note: string | null };

const byStart = (a: Slot, b: Slot) => (a.start_time < b.start_time ? -1 : 1);

export default function Timetable() {
  const subjects = useRows<Subject>('subjects', 'position');
  const slots = useRows<Slot>('timetable_slots', 'start_time');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayIndex();

  async function save(values: SlotValues) {
    if (!editing) return;
    if (editing.slot) {
      const id = editing.slot.id;
      const { error } = await supabase.from('timetable_slots').update(values).eq('id', id);
      if (error) return setError(error.message);
      slots.setRows((r) => r.map((s) => (s.id === id ? { ...s, ...values } : s)).sort(byStart));
    } else {
      const { data, error } = await supabase
        .from('timetable_slots')
        .insert({ ...values, subject_id: editing.subject.id, day_of_week: editing.day })
        .select()
        .single();
      if (error) return setError(error.message);
      slots.setRows((r) => [...r, data as Slot].sort(byStart));
    }
    setEditing(null);
  }

  async function remove(slot: Slot) {
    const { error } = await supabase.from('timetable_slots').delete().eq('id', slot.id);
    if (error) return setError(error.message);
    slots.setRows((r) => r.filter((s) => s.id !== slot.id));
    setEditing(null);
  }

  if (subjects.loading || slots.loading) return <p className="text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly timetable"
        subtitle="Tap + to plan when you'll study each subject. It repeats every week."
        art={<PixelArt rows={CALENDAR} palette={CALENDAR_PALETTE} className="w-full" />}
      />

      <ErrorBanner message={error ?? subjects.error ?? slots.error} onClose={() => setError(null)} />

      {subjects.rows.length === 0 ? (
        <p className="card p-8 text-center text-muted">
          Add some subjects first on the{' '}
          <Link to="/subjects" className="font-semibold text-primary">
            Subjects page
          </Link>
          .
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface p-3 text-left text-muted">Day</th>
                {subjects.rows.map((s) => (
                  <th key={s.id} className="min-w-36 p-3 text-left">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3" style={{ background: s.color }} />
                      {s.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, d) => (
                <tr key={day} className={`border-t border-line ${d === today ? 'bg-primary-soft/50' : ''}`}>
                  <th className={`sticky left-0 z-10 p-3 text-left font-semibold ${d === today ? 'bg-primary-soft text-primary' : 'bg-surface'}`}>
                    {day}
                  </th>
                  {subjects.rows.map((s) => {
                    const cell = slots.rows.filter((x) => x.subject_id === s.id && x.day_of_week === d);
                    return (
                      <td key={s.id} className="p-2 align-top">
                        <div className="flex flex-col gap-1">
                          {cell.map((slot) => (
                            <button
                              key={slot.id}
                              onClick={() => setEditing({ subject: s, day: d, slot })}
                              className="px-2 py-1 text-left text-xs font-semibold text-on-pastel hover:brightness-110"
                              style={{ background: s.color }}
                            >
                              {fmtTime(slot.start_time)}–{fmtTime(slot.end_time)}
                              {slot.note && <span className="block font-normal">{slot.note}</span>}
                            </button>
                          ))}
                          <button
                            onClick={() => setEditing({ subject: s, day: d, slot: null })}
                            className="border-2 border-dashed border-line px-2 py-1 text-xs text-muted hover:border-accent hover:text-ink"
                            aria-label={`Add ${s.name} on ${day}`}
                          >
                            +
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <SlotModal
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={editing.slot ? () => remove(editing.slot!) : undefined}
        />
      )}
    </div>
  );
}

function SlotModal({
  editing,
  onClose,
  onSave,
  onDelete,
}: {
  editing: Editing;
  onClose: () => void;
  onSave: (v: SlotValues) => Promise<void>;
  onDelete?: () => void;
}) {
  const [start, setStart] = useState(editing.slot?.start_time.slice(0, 5) ?? '16:00');
  const [end, setEnd] = useState(editing.slot?.end_time.slice(0, 5) ?? '17:00');
  const [note, setNote] = useState(editing.slot?.note ?? '');
  const [busy, setBusy] = useState(false);
  const invalid = !start || !end || end <= start;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    await onSave({ start_time: start, end_time: end, note: note.trim() || null });
    setBusy(false);
  }

  return (
    <Modal title={`${editing.subject.name} · ${DAYS[editing.day]}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
            From
            <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
            To
            <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        </div>
        {invalid && <p className="text-xs text-danger">End time must be after start time.</p>}
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Note (optional)
          <input className="input" placeholder="e.g. Ch 3 revision" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
        </label>
        <div className="mt-2 flex gap-2">
          <button className="btn btn-primary" disabled={busy || invalid}>
            Save
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          {onDelete && (
            <button type="button" className="btn btn-danger ml-auto" onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
