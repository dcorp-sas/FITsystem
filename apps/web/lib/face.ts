import type * as FD from '@vladmandic/face-api';

export type FaceApi = typeof FD;

const MODEL_URL = '/face-api/model';

let faceApiPromise: Promise<FaceApi> | null = null;

// Envuelve una promesa con un límite de tiempo para que la cámara/modelo nunca
// queden cargando para siempre si la red o el permiso no responden.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Carga el bundle de face-api (incluye tfjs) + modelos de deteccion, landmarks y reconocimiento.
export function loadFaceApi(): Promise<FaceApi> {
  faceApiPromise ??= (async () => {
    const src = '/face-api/face-api.esm.js';
    const mod = (await import(/* webpackIgnore: true */ src)) as FaceApi;
    await withTimeout(
      Promise.all([
        mod.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        mod.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        mod.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]),
      45000,
      'No se pudo cargar el reconocimiento facial. Revisá tu conexión e intentá de nuevo.',
    );
    return mod;
  })().catch((error) => {
    // Si falla, permitimos reintentar en la próxima apertura.
    faceApiPromise = null;
    throw error;
  });
  return faceApiPromise;
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador no permite acceder a la cámara. Usá otro navegador o revisá los permisos.');
  }
  const stream = await withTimeout(
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    }),
    20000,
    'No se pudo iniciar la cámara. Revisá que esté conectada y que el navegador tenga permiso.',
  );
  video.srcObject = stream;
  await withTimeout(video.play(), 10000, 'No se pudo mostrar la cámara. Probá cerrar y volver a abrir.');
  return stream;
}

export function stopCamera(video: HTMLVideoElement) {
  const stream = video.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

export const DETECTOR_OPTIONS = { inputSize: 224, scoreThreshold: 0.4, maxNumScales: 10 };
export const DESCRIPTOR_SIZE = 128;

// Calcula el descriptor facial (128-d) de un rostro en el cuadro actual.
// Devuelve null si no hay un rostro con confianza suficiente.
export async function computeDescriptor(faceapi: FaceApi, input: HTMLVideoElement | HTMLImageElement): Promise<number[] | null> {
  const options = new faceapi.TinyFaceDetectorOptions(DETECTOR_OPTIONS);
  const result = await faceapi.detectSingleFace(input, options).withFaceLandmarks().withFaceDescriptor();
  if (!result) return null;
  const descriptor = Array.from(result.descriptor);
  if (descriptor.length < DESCRIPTOR_SIZE) return null;
  return descriptor;
}