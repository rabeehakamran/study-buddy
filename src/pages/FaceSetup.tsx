import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useFocus } from '../focus/FocusProvider';
import { loadVision, type Vision } from '../presence/vision';
import { bestDistance, clearFace, loadFace, MATCH_THRESHOLD, saveFace } from '../presence/faceStore';
import ErrorBanner from '../components/ErrorBanner';
import Mascot from '../pixel/Mascot';

const STEPS = [
  'Look straight at the camera',
  'Turn your head a little to the left',
  'Now a little to the right',
  'Tilt your chin down a bit, like you’re reading',
  'Big smile! 😄',
];

type TestResult = 'none' | 'match' | 'nomatch';

export default function FaceSetup() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const { camera } = useFocus();
  const videoRef = useRef<HTMLVideoElement>(null);
  const visionRef = useRef<Vision | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(() => loadFace(userId) !== null);
  const [phase, setPhase] = useState<'intro' | 'capture' | 'done'>('intro');
  const [samples, setSamples] = useState<Float32Array[]>([]);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<TestResult>('none');

  // Camera + models for this page.
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        videoRef.current!.srcObject = stream;
        await videoRef.current!.play();
        visionRef.current = await loadVision();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (cancelled) return;
        const err = e as DOMException;
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera permission is blocked. Click the camera icon in the address bar and allow it, then reload.'
            : `Couldn't start the camera: ${err?.message ?? String(e)}`,
        );
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Live "is this me?" check after saving.
  useEffect(() => {
    if (phase !== 'done' || !ready) return;
    const saved = loadFace(userId);
    if (!saved) return;
    let stop = false;
    let timer = 0;
    const loop = async () => {
      if (stop) return;
      const d = await visionRef.current!.detect(videoRef.current!);
      if (stop) return;
      setTest(!d.descriptor ? 'none' : bestDistance(d.descriptor, saved) < MATCH_THRESHOLD ? 'match' : 'nomatch');
      timer = window.setTimeout(loop, 700);
    };
    loop();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [phase, ready, userId]);

  async function capture() {
    if (!visionRef.current || !videoRef.current) return;
    setBusy(true);
    setError(null);
    let descriptor: Float32Array | null = null;
    for (let i = 0; i < 4 && !descriptor; i++) {
      descriptor = (await visionRef.current.detect(videoRef.current)).descriptor;
      if (!descriptor) await new Promise((r) => setTimeout(r, 250));
    }
    setBusy(false);
    if (!descriptor) {
      setError('I couldn’t see your face clearly. Face the camera, and make sure your face has light on it.');
      return;
    }
    const next = [...samples, descriptor];
    setSamples(next);
    if (next.length === STEPS.length) {
      try {
        saveFace(userId, next);
      } catch {
        setError('Couldn’t save on this browser (private mode?).');
        return;
      }
      setEnrolled(true);
      camera.faceChanged();
      setPhase('done');
    }
  }

  function remove() {
    if (!confirm('Delete your saved face from this device? Camera buddy will stop working until you set it up again.')) return;
    clearFace(userId);
    setEnrolled(false);
    camera.faceChanged();
    setPhase('intro');
    setSamples([]);
  }

  const step = samples.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Face setup</h1>
        <p className="text-sm text-muted">So Camera buddy knows it’s really you (and not your sibling 👀).</p>
      </div>

      <ErrorBanner message={error} onClose={() => setError(null)} />

      <section className="card overflow-hidden">
        <div className="relative bg-black">
          <video ref={videoRef} muted playsInline className="block aspect-[4/3] w-full object-cover [transform:scaleX(-1)]" />
          {!ready && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-sm text-muted">
              <Mascot mood="sleep" className="w-16" />
              Waking up Buddy’s eyes… (first time can take a few seconds)
            </div>
          )}
          {phase === 'done' && (
            <div
              className={`font-pixel absolute bottom-3 left-3 px-3 py-1.5 text-lg ${
                test === 'match' ? 'bg-emerald-400 text-black' : test === 'nomatch' ? 'bg-danger text-black' : 'bg-surface-2 text-muted'
              }`}
              role="status"
            >
              {test === 'match' ? '✓ That’s you!' : test === 'nomatch' ? '✗ Not matching' : 'No face in view'}
            </div>
          )}
        </div>

        <div className="space-y-4 p-5">
          {phase === 'intro' && (
            <>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted">
                <li>I’ll take 5 quick snapshots from different angles.</li>
                <li>Only a set of numbers describing your face is saved, <b className="text-ink">on this laptop only</b>. No photos, nothing uploaded.</li>
                <li>On a new laptop or browser, you’ll do this again.</li>
              </ul>
              {enrolled && <p className="text-sm">You’ve already set up your face. Doing it again replaces it.</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-primary"
                  disabled={!ready}
                  onClick={() => {
                    setSamples([]);
                    setPhase('capture');
                  }}
                >
                  {enrolled ? 'Redo setup' : 'Start'}
                </button>
                {enrolled && (
                  <button className="btn btn-danger" onClick={remove}>
                    Delete my face data
                  </button>
                )}
              </div>
            </>
          )}

          {phase === 'capture' && (
            <>
              <p className="font-pixel text-2xl">
                {step + 1}/{STEPS.length}: {STEPS[step]}
              </p>
              <div className="flex gap-1">
                {STEPS.map((_, i) => (
                  <div key={i} className={`h-2 flex-1 ${i < step ? 'bg-accent' : 'bg-surface-2'}`} />
                ))}
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={capture} disabled={busy || !ready}>
                  {busy ? 'Looking…' : 'Snap 📸'}
                </button>
                <button className="btn btn-ghost" onClick={() => setPhase('intro')}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {phase === 'done' && (
            <>
              <p className="font-pixel text-2xl">All set! 🎉</p>
              <p className="text-sm text-muted">
                Move around to test it. If it says “Not matching” for you, redo the setup in better light.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link to="/focus" className="btn btn-primary">
                  Go to Focus
                </Link>
                <button className="btn btn-ghost" onClick={() => setPhase('intro')}>
                  Redo
                </button>
                <button className="btn btn-danger" onClick={remove}>
                  Delete my face data
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
