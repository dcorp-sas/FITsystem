import type * as FD from '@vladmandic/face-api';

export type FaceApi = typeof FD;

const MODEL_URL = '/face-api/model';

let faceApiPromise: Promise<FaceApi> | null = null;

// Carga el bundle de face-api (incluye tfjs) + modelos de deteccion, landmarks y reconocimiento.
export function loadFaceApi(): Promise<FaceApi> {
  faceApiPromise ??= (async () => {
    const src = '/face-api/face-api.esm.js';
    const mod = (await import(/* webpackIgnore: true */ src)) as FaceApi;
    await Promise.all([
      mod.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      mod.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      mod.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    return mod;
  })();
  return faceApiPromise;
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
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