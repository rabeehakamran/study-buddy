import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFocus } from '../focus/FocusProvider';
import { statusInfo } from './statusInfo';

/** Small floating camera preview + presence status, shown on every page while the camera is on. */
export default function CameraDock() {
  const { camera } = useFocus();
  const [small, setSmall] = useState(false);
  if (!camera.on) return null;

  const info = statusInfo(camera.status, camera.graceLeft);
  const showVideo = camera.status !== 'needs-setup' && camera.status !== 'error';

  return (
    <aside className="card fixed bottom-3 right-3 z-40 w-40 overflow-hidden sm:w-52 text-xs" aria-label="Camera buddy">
      {/* The video stays in the page while the camera is on (detection reads from it). */}
      <video
        ref={camera.videoRef}
        muted
        playsInline
        className={
          showVideo && !small
            ? 'block aspect-[4/3] w-full bg-black object-cover [transform:scaleX(-1)]'
            : // keep full size but invisible: browsers may freeze tiny/1px videos
              'pointer-events-none absolute left-0 top-0 -z-10 aspect-[4/3] w-full opacity-0'
        }
      />
      <div className="flex items-start gap-2 p-2">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 ${info.dot}`} />
        <span className="flex-1" role="status">
          {camera.status === 'error' ? camera.error : info.text}
          {camera.status === 'needs-setup' && (
            <>
              {' '}
              <Link to="/face-setup" className="font-semibold text-primary">
                Set up →
              </Link>
            </>
          )}
        </span>
        {showVideo && (
          <button className="text-muted hover:text-ink" onClick={() => setSmall(!small)} aria-label={small ? 'Show camera preview' : 'Hide camera preview'}>
            {small ? '▢' : '–'}
          </button>
        )}
      </div>
    </aside>
  );
}
