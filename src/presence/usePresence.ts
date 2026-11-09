import { useEffect, useRef, useState } from 'react';
import { loadVision } from './vision';
import { checkFace, loadProfile } from './faceStore';

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

/** What the last check saw — shown in the "what Buddy sees" readout. */
export type LastCheck = { face: boolean; score: number | null; lookalike: boolean; body: boolean; at: number };

export const GRACE_MS = 60_000;
const TICK_MS = 1000;
const SEEN_WINDOW_MS = 2500;
const STRANGER_TICKS = 3; // misreads in a row before we decide it's someone else
const FROZEN_TICKS = 6; // camera frames not changing for this many checks → restart camera
const ERROR_TICKS = 5; // detection errors in a row → restart camera

export function isLoggedInStatus(s: PresenceStatus) {
  return s === 'present' || s === 'writing';
}

/**
 * Webcam presence. Status rules:
 *  - her face matches            → present
 *  - no face, but a body in view → writing (only once she's been verified)
 *  - nobody for GRACE_MS         → away (must look at the camera again to come back)
 * Self-heals: if the camera freezes or detection keeps failing, the camera is restarted.
 */
export function usePresence(userId: string, enabled: boolean, faceVersion: number) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSeenRef = useRef(Date.now());
  const [status, setStatus] = useState<PresenceStatus>('off');
  const [graceLeft, setGraceLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<LastCheck | null>(null);
  const [restartKey, setRestartKey] = useState(0);

  useEffect(() => {
    setError(null);
    setLastCheck(null);
    if (!enabled) {
      setStatus('off');
      return;
    }
    const profile = loadProfile(userId);
    if (!profile) {
      setStatus('needs-setup');
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let identity: 'unknown' | 'me' | 'stranger' = 'unknown';
    let strangerStreak = 0;
    let verifiedOnce = false;
    let errorStreak = 0;
    let frozenStreak = 0;
    let lastFrameTime = -1;
    lastSeenRef.current = Date.now();
    setStatus('starting');

    const restart = (why: string) => {
      console.warn(`[camera buddy] restarting camera: ${why}`);
      if (!cancelled) setRestartKey((k) => k + 1); // re-runs this effect
    };

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
          try {
            const track = stream?.getVideoTracks()[0];
            if (!track || track.readyState === 'ended') return restart('camera track ended');

            // Watchdog: the picture should keep changing.
            if (video.currentTime === lastFrameTime) {
              if (++frozenStreak >= FROZEN_TICKS) return restart('camera picture froze');
            } else {
              frozenStreak = 0;
              lastFrameTime = video.currentTime;
            }
            if (video.paused) void video.play().catch(() => {});

            if (video.readyState >= 2) {
              const d = await vision.detect(video);
              if (cancelled) return;
              errorStreak = 0;
              const t = Date.now();

              let seen = false;
              let kind: 'me' | 'body' | 'stranger' | 'none' = 'none';
              let score: number | null = null;
              let lookalike = false;
              if (d.descriptor) {
                const m = checkFace(d.descriptor, profile!);
                score = m.score;
                lookalike = m.lookalike;
                if (m.isMe) {
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
              setLastCheck({ face: !!d.descriptor, score, lookalike, body: d.body, at: t });

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
          } catch (e) {
            console.error('[camera buddy] detection failed', e);
            if (++errorStreak >= ERROR_TICKS) return restart('detection kept failing');
          }
          // Always schedule the next check, even after an error.
          if (!cancelled) timer = window.setTimeout(tick, TICK_MS);
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
  }, [userId, enabled, faceVersion, restartKey]);

  return {
    videoRef,
    status,
    graceLeft,
    error,
    lastCheck,
    lastSeenAt: () => lastSeenRef.current,
    restart: () => setRestartKey((k) => k + 1),
  };
}
