/**
 * On-device vision: face detection + recognition (face-api) and body/pose
 * detection (MediaPipe). Everything runs in the browser — no frames leave the device.
 * Loaded lazily the first time the camera is turned on.
 */
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';

export type Detection = {
  descriptor: Float32Array | null; // face "fingerprint" if a face is visible
  body: boolean; // a person (head / shoulders) is in frame, even if the face isn't
};

export type Vision = { detect(video: HTMLVideoElement): Promise<Detection> };

let loading: Promise<Vision> | null = null;

export function loadVision(): Promise<Vision> {
  loading ??= create().catch((e) => {
    loading = null; // allow retry
    throw e;
  });
  return loading;
}

async function create(): Promise<Vision> {
  const [faceapi, mp] = await Promise.all([import('@vladmandic/face-api'), import('@mediapipe/tasks-vision')]);

  // Use the GPU (WebGL) when available, otherwise plain CPU. (Skips tfjs' wasm backend,
  // whose files aren't bundled.) setBackend exists at runtime but isn't in face-api's types.
  const tf = faceapi.tf as unknown as { setBackend(name: string): Promise<boolean>; ready(): Promise<void> };
  let gpu = false;
  try {
    gpu = await tf.setBackend('webgl');
  } catch {
    gpu = false;
  }
  if (!gpu) await tf.setBackend('cpu');
  await tf.ready();

  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
  ]);

  const pose = await mp.PoseLandmarker.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    {
      baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'CPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    },
  );

  const faceOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  let lastTs = 0;

  return {
    async detect(video) {
      const face = await faceapi.detectSingleFace(video, faceOptions).withFaceLandmarks(true).withFaceDescriptor();
      const ts = Math.max(performance.now(), lastTs + 1); // MediaPipe needs increasing timestamps
      lastTs = ts;
      const res = pose.detectForVideo(video, ts);
      return { descriptor: face?.descriptor ?? null, body: res.landmarks.length > 0 };
    },
  };
}
