import { SUBJECT_COLORS } from '../lib/types';

export default function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Subject color">
      {SUBJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={`h-7 w-7 rounded-full border-2 transition ${value === c ? 'scale-110 border-ink' : 'border-transparent'}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}
