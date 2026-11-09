import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useFocus } from '../focus/FocusProvider';
import { loadVision, type Vision } from '../presence/vision';
import {
  checkFace,
  clearProfile,
  DEFAULT_THRESHOLD,
  loadProfile,
  saveProfile,
  STRICTNESS,
  type FaceProfile,
  type MatchResult,
} from '../presence/faceStore';
import ErrorBanner from '../components/ErrorBanner';
import Mascot from '../pixel/Mascot';

const ME_STEPS = [
  'Look straight at the camera',
  'Turn your head a little to the left',
  'Now a little to the right',
  'Tilt your chin down a bit, like you’re reading',
  'Look down at your desk, like you’re writing',
  'Big smile! 😄',
];
const NOT_ME_STEPS = ['Look straight at the camera', 'Turn your head a little', 'Smile! 😄'];

type Phase = 'intro' | 'capture' | 'manage';
type Who = 'me' | 'notMe';

export default function FaceSetup() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const { camera } = useFocus();
  const videoRef = useRef<HTMLVideoElement>(null);
  const visionRef = useRef<Vision | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<FaceProfile | null>(() => loadProfile(userId));
  const [phase, setPhase] = useState<Phase>(() => (loadProfile(userId) ? 'manage' : 'intro'));
  const [who, setWho] = useState<Who>('me');
  const [samples, setSamples] = useState<Float32Array[]>([]);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<MatchResult | null>(null);

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

  // Live "is this me?" check on the manage screen.
  useEffect(() => {
    if (phase !== 'manage' || !ready || !profile) return;
    let stop = false;
    let timer = 0;
    const loop = async () => {
      if (stop) return;
      const d = await visionRef.current!.detect(videoRef.current!);
      if (stop) return;
      setTest(d.descriptor ? checkFace(d.descriptor, profile) : null);
      timer = window.setTimeout(loop, 600);
    };
    loop();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [phase, ready, profile]);

  function persist(next: FaceProfile | null) {
    try {
      if (next) saveProfile(userId, next);
      else clearProfile(userId);
    } catch {
      setError('Couldn’t save on this browser (private mode?).');
      return;
    }
    setProfile(next);
    camera.faceChanged();
  }

  function startCapture(w: Who) {
    setWho(w);
    setSamples([]);
    setError(null);
    setPhase('capture');
  }

  async function snap() {
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
      setError('I couldn’t see a face clearly. Face the camera, and make sure there’s light on the face.');
      return;
    }
    const next = [...samples, descriptor];
    setSamples(next);
    const steps = who === 'me' ? ME_STEPS : NOT_ME_STEPS;
    if (next.length < steps.length) return;

    if (who === 'me') {
      persist({ me: next, notMe: profile?.notMe ?? [], threshold: profile?.threshold ?? DEFAULT_THRESHOLD });
    } else if (profile) {
      persist({ ...profile, notMe: [...profile.notMe, ...next] });
    }
    setPhase('manage');
  }

  function remove() {
    if (!confirm('Delete all saved face data from this device? Camera buddy will stop working until you set it up again.')) return;
    persist(null);
    setPhase('intro');
  }

  const steps = who === 'me' ? ME_STEPS : NOT_ME_STEPS;
  const step = samples.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Face setup</h1>
        <p className="text-sm text-muted">So Camera buddy knows it’s really you (and not your sister 👀).</p>
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
          {phase === 'capture' && who === 'notMe' && (
            <div className="font-pixel absolute left-3 top-3 bg-danger px-3 py-1 text-black">Recording: NOT you</div>
          )}
          {phase === 'manage' && ready && <TestBadge test={test} />}
        </div>

        <div className="space-y-4 p-5">
          {phase === 'intro' && (
            <>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted">
                <li>I’ll take {ME_STEPS.length} quick snapshots from different angles.</li>
                <li>
                  Only numbers describing your face are saved, <b className="text-ink">on this laptop only</b>. No photos, nothing
                  uploaded.
                </li>
                <li>On a new laptop or browser, you’ll do this again.</li>
              </ul>
              <button className="btn btn-primary" disabled={!ready} onClick={() => startCapture('me')}>
                Start
              </button>
            </>
          )}

          {phase === 'capture' && (
            <>
              <p className="font-pixel text-2xl">
                {step + 1}/{steps.length}: {steps[step]}
              </p>
              {who === 'notMe' && (
                <p className="text-sm text-muted">Only the other person should be in front of the camera now.</p>
              )}
              <div className="flex gap-1">
                {steps.map((_, i) => (
                  <div key={i} className={`h-2 flex-1 ${i < step ? 'bg-accent' : 'bg-surface-2'}`} />
                ))}
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={snap} disabled={busy || !ready}>
                  {busy ? 'Looking…' : 'Snap 📸'}
                </button>
                <button className="btn btn-ghost" onClick={() => setPhase(profile ? 'manage' : 'intro')}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {phase === 'manage' && profile && (
            <>
              <div>
                <h2 className="text-xl font-bold">Test it</h2>
                <p className="text-sm text-muted">
                  Let each person sit in front of the camera. The score is how different the face is from yours.
                  <b className="text-ink"> Lower = more like you.</b> It says “That’s you” when the score is below the strictness line.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-bold">Strictness</h3>
                <div className="flex flex-wrap gap-2">
                  {STRICTNESS.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => persist({ ...profile, threshold: s.value })}
                      className={`btn text-sm ${profile.threshold === s.value ? 'bg-primary-soft text-primary' : 'btn-ghost'}`}
                    >
                      {s.label} (&lt; {s.value.toFixed(2)})
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">
                  Tip: check your score and your sister’s score, then pick a line in between. Too strict and it may not recognise you in
                  dim light.
                </p>
              </div>

              <div className="bg-surface-2 p-4">
                <h3 className="font-bold">Teach Buddy who’s NOT you</h3>
                <p className="mb-3 text-sm text-muted">
                  Best fix for lookalike siblings: let your sister take {NOT_ME_STEPS.length} snapshots. Buddy will then only accept a face
                  that is clearly closer to you than to her.
                  {profile.notMe.length > 0 && <b className="text-ink"> {profile.notMe.length} “not me” snapshots saved.</b>}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary" disabled={!ready} onClick={() => startCapture('notMe')}>
                    Add someone who isn’t me
                  </button>
                  {profile.notMe.length > 0 && (
                    <button className="btn btn-ghost" onClick={() => persist({ ...profile, notMe: [] })}>
                      Clear “not me” list
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link to="/focus" className="btn btn-primary">
                  Go to Focus
                </Link>
                <button className="btn btn-ghost" disabled={!ready} onClick={() => startCapture('me')}>
                  Redo my face
                </button>
                <button className="btn btn-danger" onClick={remove}>
                  Delete all face data
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function TestBadge({ test }: { test: MatchResult | null }) {
  if (!test) {
    return <div className="font-pixel absolute bottom-3 left-3 bg-surface-2 px-3 py-1.5 text-lg text-muted">No face in view</div>;
  }
  const label = test.isMe ? '✓ That’s you!' : test.lookalike ? '✗ That’s the lookalike' : '✗ Not you';
  return (
    <div
      className={`font-pixel absolute bottom-3 left-3 px-3 py-1.5 text-lg text-black ${test.isMe ? 'bg-emerald-400' : 'bg-danger'}`}
      role="status"
    >
      {label}
      <span className="ml-2 text-sm">
        score {test.score.toFixed(2)}
        {test.otherScore !== null && ` · lookalike ${test.otherScore.toFixed(2)}`}
      </span>
    </div>
  );
}
