'use client';

import { useEffect, useRef, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { enrollFingerprint, assertFingerprint, platformAuthenticatorAvailable, webauthnSupported } from '@/lib/webauthn';
import { Button, Modal, Spinner } from '@/components/ui';

export type FingerprintMode = 'enroll' | 'verify';

interface Props {
  open: boolean;
  onClose: () => void;
  mode: FingerprintMode;
  memberId?: string;
  memberName?: string;
  memberCode?: string;
  branchId?: string;
  onDone?: () => void;
}

type Screen = 'check' | 'ready' | 'working' | 'done' | 'error';

export function FingerprintCaptureModal({
  open,
  onClose,
  mode,
  memberId,
  memberName,
  memberCode,
  branchId,
  onDone,
}: Props) {
  const toast = useToast();
  const aliveRef = useRef(false);
  const [screen, setScreen] = useState<Screen>('check');
  const [message, setMessage] = useState('');
  const [deviceLabel] = useState(() =>
    typeof navigator !== 'undefined' ? `${navigator.platform || 'equipo'}`.slice(0, 120) : null,
  );

  useEffect(() => {
    if (!open) return;
    aliveRef.current = true;
    setScreen('check');
    setMessage('');

    (async () => {
      if (!webauthnSupported()) {
        setScreen('error');
        setMessage('Este equipo no soporta huella (WebAuthn / Windows Hello).');
        return;
      }
      const available = await platformAuthenticatorAvailable();
      if (!aliveRef.current) return;
      if (!available) {
        setScreen('error');
        setMessage('Este equipo no tiene un lector de huella disponible.');
        return;
      }
      setScreen('ready');
    })();

    return () => {
      aliveRef.current = false;
    };
  }, [open]);

  async function run() {
    setScreen('working');
    setMessage('');
    try {
      if (mode === 'enroll') {
        if (!memberId) throw new Error('Falta el socio a enrolar.');
        const result = await enrollFingerprint(memberName || 'Socio', memberCode || memberId);
        await http.post(`/members/${memberId}/fingerprint`, {
          credentialId: result.credentialId,
          publicKey: result.publicKey,
          deviceLabel,
        });
        if (!aliveRef.current) return;
        toast.success('Huella registrada');
        setScreen('done');
        setMessage('Huella registrada en este equipo');
        onDone?.();
        closeSoon();
      } else {
        const { challenge } = await http.get<{ challenge: string }>('/attendance/fingerprint/challenge');
        const assertion = await assertFingerprint(challenge);
        const res = await http.post<{
          allowed: boolean;
          message?: string;
          member?: { name: string; memberCode: string } | null;
          plan?: string;
        }>('/attendance/fingerprint', { branchId, ...assertion });
        if (!aliveRef.current) return;
        if (res.allowed) {
          toast.success(`Ingreso registrado · ${res.member?.name ?? ''} · ${res.plan ?? ''}`);
          setScreen('done');
          setMessage(`Acceso permitido · ${res.member?.name ?? ''}`);
          onDone?.();
          closeSoon();
        } else {
          setScreen('error');
          setMessage(res.message ?? 'Huella no reconocida');
        }
      }
    } catch (error) {
      if (!aliveRef.current) return;
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Verificación cancelada o denegada.'
            : error instanceof Error
              ? error.message
              : 'No se pudo completar la operación.';
      setScreen('error');
      setMessage(message);
    }
  }

  function closeSoon() {
    window.setTimeout(() => onClose(), 1800);
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === 'enroll' ? 'Registrar huella' : 'Check-in por huella'} size="md">
      <div className="py-6 text-center">
        <div
          className={
            'mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl ' +
            (screen === 'done' ? 'bg-success/15 text-success' : screen === 'error' ? 'bg-danger/15 text-danger' : 'bg-surface-alt text-text')
          }
        >
          {screen === 'done' ? '✓' : screen === 'error' ? '!' : '☝'}
        </div>

        {screen === 'check' || screen === 'working' ? (
          <div className="mt-4 flex flex-col items-center gap-3">
            <Spinner className="h-5 w-5" />
            <div className="text-sm text-text-muted">
              {screen === 'working'
                ? mode === 'enroll'
                  ? 'Esperando la huella en el lector…'
                  : 'Verificando huella…'
                : 'Comprobando el lector de huella…'}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <div className={'text-lg font-semibold ' + (screen === 'done' ? 'text-text' : screen === 'error' ? 'text-danger' : 'text-text')}>
              {message || (mode === 'enroll' ? 'Listo para registrar la huella' : 'Listo para verificar la huella')}
            </div>
            <div className="mt-1 text-sm text-text-muted">
              {mode === 'enroll'
                ? 'Apoyá el dedo en el lector cuando el sistema lo pida.'
                : 'Apoyá el dedo para registrar tu ingreso.'}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} type="button">
          {screen === 'done' ? 'Listo' : 'Cancelar'}
        </Button>
        {(screen === 'ready' || screen === 'error') && (
          <Button onClick={run} type="button">
            {screen === 'error' ? 'Reintentar' : mode === 'enroll' ? 'Registrar huella' : 'Verificar huella'}
          </Button>
        )}
      </div>
    </Modal>
  );
}
