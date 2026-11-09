export default function ErrorBanner({ message, onClose }: { message: string | null; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
      <span>{message}</span>
      {onClose && (
        <button onClick={onClose} className="font-bold" aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
