import { useEffect, useRef, useState } from 'react';
import { loadVision } from './vision';
import { bestDistance, loadFace, MATCH_THRESHOLD } from './faceStore';

export type PresenceStatus =
  | 'off' // camera off
  | 'needs-setup' // no face enrolled on this device
  | 'starting' // opening camera / loading models
  | 'verifying' // camera on, waiting to see her face the first time
  | 'present' // her face is visible
  | 'writing' // face not visible, but she's still there (head down)
  | 'searching' // nobody seen for a bit — grace period running
  | 'stranger' // a face that isn't hers
  | 'away' // gone longer than the grace period
  | 'error';

export const GRACE_MS = 60_000;
const TICK_MS = 1000;
const SEEN_WINDOW_MS = 2500;
const STRANGER_TICKS = 3; // misreads in a row before we decide it's someone else

export function isLoggedInStatus(s: PresenceStatus) {
  return s === 'present' || s === 'writing';
}

/**
 * Webcam presence. Status rules:
 *  - her face matches            → present
 *  - no face, but a body in view → writing (only once she's been verified)
 *  - nobody for GRACE_MS         → away (must look at the camera again to come back)
 */
export function usePresence(userId: string, enabled: boolean, faceVersion: number) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSeenRef = useRef(Date.now());
  const [status, setStatus] = useState<PresenceStatus>('off');
  const [graceLeft, setGraceLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!enabled) {
      setStatus('off');
      return;
    }
    const samples = loadFace(userId);
    if (!samples) {
      setStatus('needs-setup');
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let identity: 'unknown' | 'me' | 'stranger' = 'unknown';
    let strangerStreak = 0;
    let verifiedOnce = false;
    lastSeenRef.current = Date.now();
    setStatus('starting');

    async function run() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop()); // turned off while the permission prompt was open
          return;
        }
        const video = videoRef.current;
        if (!video) throw new Error('Camera preview is missing.');
        video.srcObject = stream;
        await video.play();
        const vision = await loadVision();
        if (cancelled) return;
        lastSeenRef.current = Date.now();
        setStatus('verifying');

        const tick = async () => {
          if (cancelled) return;
          if (video.readyState >= 2) {
            const d = await vision.detect(video);
            if (cancelled) return;
            const t = Date.now();

            let seen = false;
            let kind: 'me' | 'body' | 'stranger' | 'none' = 'none';
            if (d.descriptor) {
              if (bestDistance(d.descriptor, samples!) < MATCH_THRESHOLD) {
                identity = 'me';
                strangerStreak = 0;
                verifiedOnce = true;
                seen = true;
                kind = 'me';
              } else {
                strangerStreak++;
                kind = 'stranger';
                if (identity === 'me' && strangerStreak < STRANGER_TICKS) seen = true; // one odd frame
                else if (strangerStreak >= STRANGER_TICKS) identity = 'stranger';
              }
            } else if (d.body && identity === 'me') {
              seen = true;
              kind = 'body';
            }

            if (seen) lastSeenRef.current = t;
            const since = t - lastSeenRef.current;

            if (since < SEEN_WINDOW_MS && identity === 'me') {
              setStatus(kind === 'body' ? 'writing' : 'present');
            } else if (since >= GRACE_MS) {
              identity = 'unknown'; // must look at the camera to log back in
              setStatus('away');
            } else if (!verifiedOnce) {
              setStatus(kind === 'stranger' ? 'stranger' : 'verifying');
            } else {
              setStatus(kind === 'stranger' ? 'stranger' : 'searching');
            }
            setGraceLeft(Math.max(0, Math.ceil((GRACE_MS - since) / 1000)));
          }
          timer = window.setTimeout(tick, TICK_MS);
        };
        tick();
      } catch (e) {
        if (cancelled) return;
        const err = e as DOMException;
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera permission is blocked. Click the camera icon in the address bar and allow it.'
            : err?.name === 'NotFoundError'
              ? 'No camera found on this device.'
              : err?.name === 'NotReadableError'
                ? 'The camera is being used by another app. Close it and try again.'
                : `Camera buddy couldn't start: ${err?.message ?? String(e)}`,
        );
        setStatus('error');
      }
    }
    run();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [userId, enabled, faceVersion]);

  return { videoRef, status, graceLeft, error, lastSeenAt: () => lastSeenRef.current };
}
