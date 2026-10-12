'use client';

import { useEffect, useRef, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { loadFaceApi, startCamera, stopCamera, computeDescriptor, type FaceApi } from '@/lib/face';
import { Badge, Button, Modal, Spinner } from '@/components/ui';

export type FaceCaptureMode = 'enroll' | 'verify';

const ENROLL_SAMPLES = 5;

interface CaptureResult {
  ok: boolean;
  message: string;
  memberName?: string;
  memberCode?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  mode: FaceCaptureMode;
  memberId?: string;
  branchId?: string;
  onDone?: () => void;
}

export function FaceCaptureModal({ open, onClose, mode, memberId, branchId, onDone }: Props) {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceapiRef = useRef<FaceApi | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const descriptorsRef = useRef<number[][]>([]);
  const loopRef = useRef<number | null>(null);
  const aliveRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [samples, setSamples] = useState(0);
  const [result, setResult] = useState<CaptureResult | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    aliveRef.current = true;
    setLoading(true);
    setResult(null);
    setSamples(0);
    descriptorsRef.current = [];

    async function init() {
      try {
        faceapiRef.current = await loadFaceApi();
        const video = videoRef.current;
        if (!video) return;
        const stream = await startCamera(video);
        streamRef.current = stream;
        if (cancelled) return;
        setLoading(false);
        loopRef.current = window.setInterval(() => void tick(), 260);
      } catch (error) {
        if (cancelled) return;
        setLoading(false);
        const message =
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Habilitalo en el navegador.'
            : error instanceof Error
              ? error.message
              : 'No se pudo iniciar la cámara';
        setResult({ ok: false, message });
      }
    }

    void init();

    return () => {
      cancelled = true;
      aliveRef.current = false;
      if (loopRef.current !== null) {
        clearInterval(loopRef.current);
        loopRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      faceapiRef.current = null;
      descriptorsRef.current = [];
    };
  }, [open]);

  async function tick() {
    if (!aliveRef.current || busyRef.current || loading) return;
    const video = videoRef.current;
    const faceapi = faceapiRef.current;
    if (!video || !faceapi || video.readyState < 2) return;
    busyRef.current = true;
    try {
      const descriptor = await computeDescriptor(faceapi, video);
      if (!descriptor || !aliveRef.current) return;
      if (mode === 'enroll') {
        descriptorsRef.current.push(descriptor);
        setSamples(descriptorsRef.current.length);
        if (descriptorsRef.current.length >= ENROLL_SAMPLES) {
          await submitEnroll();
        }
      } else {
        await submitVerify(descriptor);
      }
    } catch {
      // error transitorio de deteccion; reintentamos en el siguiente ciclo
    } finally {
      busyRef.current = false;
    }
  }

  async function submitEnroll() {
    if (!memberId) return;
    try {
      await http.post(`/members/${memberId}/face`, { descriptors: descriptorsRef.current });
      if (!aliveRef.current) return;
      setResult({ ok: true, message: `Rostro registrado (${descriptorsRef.current.length} muestras)` });
      toast.success('Reconocimiento facial activado');
      onDone?.();
      stop();
      closeSoon();
    } catch (error) {
      if (!aliveRef.current) return;
      setResult({ ok: false, message: error instanceof ApiError ? error.message : 'No se pudo registrar el rostro' });
    }
  }

  async function submitVerify(descriptor: number[]) {
    if (!branchId) return;
    try {
      const res = await http.post<{
        allowed: boolean;
        message?: string;
        member?: { name: string; memberCode: string } | null;
        plan?: string;
      }>('/attendance/face', { branchId, descriptor });
      if (!aliveRef.current) return;
      if (res.allowed) {
        setResult({
          ok: true,
          message: 'Acceso permitido',
          memberName: res.member?.name,
          memberCode: res.member?.memberCode,
        });
        toast.success(`Ingreso registrado · ${res.member?.name ?? ''} · ${res.plan ?? ''}`);
        onDone?.();
        stop();
        closeSoon();
      } else {
        setResult({ ok: false, message: res.message ?? 'Rostro no reconocido' });
      }
    } catch (error) {
      if (!aliveRef.current) return;
      setResult({ ok: false, message: error instanceof ApiError ? error.message : 'Error al verificar el rostro' });
    }
  }

  function stop() {
    if (loopRef.current !== null) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) stopCamera(videoRef.current);
  }

  function closeSoon() {
    window.setTimeout(() => onClose(), 1800);
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === 'enroll' ? 'Registrar rostro' : 'Check-in por rostro'} size="md">
      <div>
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Spinner className="h-6 w-6" />
            <div className="text-sm text-text-muted">Preparando cámara y cargando modelo…</div>
          </div>
        ) : result?.ok ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-2xl text-success">✓</div>
            <div className="mt-3 text-lg font-semibold text-text">{result.message}</div>
            {result.memberName && (
              <div className="mt-1 text-sm text-text-muted">
                {result.memberName} · <span className="font-mono">{result.memberCode}</span>
              </div>
            )}
            <div className="mt-4 text-xs text-text-muted">Cerrando…</div>
          </div>
        ) : (
          <div>
            <div className="relative mx-auto w-full max-w-xs overflow-hidden rounded-xl border border-line bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={
                    'h-28 w-28 rounded-full border-2 ' +
                    (result?.ok === false ? 'border-danger/70' : 'border-white/50')
                  }
                />
              </div>
            </div>
            <div className="mt-3 text-center text-sm text-text">
              {result?.ok === false
                ? result.message
                : mode === 'enroll'
                  ? `Mirá a la cámara y mantenete quieto · ${samples}/${ENROLL_SAMPLES}`
                  : 'Mirá a la cámara para registrar tu ingreso'}
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              {mode === 'enroll' && (
                <Badge color={samples >= ENROLL_SAMPLES ? 'green' : 'gray'}>
                  Muestras: {Math.min(samples, ENROLL_SAMPLES)}/{ENROLL_SAMPLES}
                </Badge>
              )}
              <Badge color={result?.ok === false ? 'red' : 'yellow'}>
                {result?.ok === false ? 'Reintentando…' : 'Detectando rostro…'}
              </Badge>
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Modal>
  );
}