import type { PresenceStatus } from './usePresence';

export type StatusInfo = { text: string; dot: string };

export function statusInfo(status: PresenceStatus, graceLeft: number): StatusInfo {
  switch (status) {
    case 'off':
      return { text: 'Camera buddy is off', dot: 'bg-line' };
    case 'needs-setup':
      return { text: 'Set up your face first', dot: 'bg-line' };
    case 'starting':
      return { text: "Waking up Buddy's eyes…", dot: 'bg-accent animate-twinkle' };
    case 'verifying':
      return { text: 'Look at the camera so I know it’s you 👀', dot: 'bg-accent animate-twinkle' };
    case 'present':
      return { text: 'You’re here ✓', dot: 'bg-emerald-400' };
    case 'writing':
      return { text: 'Writing mode ✍️ (still logged in)', dot: 'bg-emerald-400' };
    case 'searching':
      return { text: `Where’d you go? Pausing in ${graceLeft}s`, dot: 'bg-amber-400 animate-twinkle' };
    case 'stranger':
      return { text: `Hmm, that’s not you… ${graceLeft}s`, dot: 'bg-amber-400 animate-twinkle' };
    case 'away':
      return { text: 'Away. Look at the camera to log back in', dot: 'bg-danger' };
    case 'error':
      return { text: 'Camera problem', dot: 'bg-danger' };
  }
}
