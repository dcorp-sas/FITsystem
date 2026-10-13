'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Badge, Button, Card, Field, Input } from '@/components/ui';

interface TwoFactorStatus {
  enabled: boolean;
  emailEnabled: boolean;
  backupCodesRemaining: number;
}

export function TwoFactorCard() {
  const toast = useToast();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await http.get<TwoFactorStatus>('/auth/2fa');
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startSetup() {
    setBusy(true);
    try {
      const data = await http.post<{ secret: string; otpauthUrl: string; qr: string }>('/auth/2fa/setup');
      setSetup({ secret: data.secret, qr: data.qr });
      setBackupCodes(null);
      setCode('');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo iniciar el 2FA');
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    setBusy(true);
    try {
      const data = await http.post<{ enabled: boolean; backupCodes: string[] }>('/auth/2fa/enable', { code: code.trim() });
      setBackupCodes(data.backupCodes);
      setSetup(null);
      setCode('');
      toast.success('2FA activado');
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Código incorrecto');
    } finally {
      setBusy(false);
    }
  }

  async function toggleEmail() {
    setBusy(true);
    try {
      const data = await http.post<{ emailEnabled: boolean }>('/auth/2fa/email/toggle');
      setStatus((s) => (s ? { ...s, emailEnabled: data.emailEnabled } : s));
      toast.success(data.emailEnabled ? 'Respaldo por email activado' : 'Respaldo por email desactivado');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo cambiar el respaldo por email');
    } finally {
      setBusy(false);
    }
  }

  async function regenerateBackup() {
    setBusy(true);
    try {
      const data = await http.post<{ backupCodes: string[] }>('/auth/2fa/backup-codes', { code: code.trim() });
      setBackupCodes(data.backupCodes);
      setCode('');
      toast.success('Nuevos códigos de recuperación generados');
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Código incorrecto');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await http.post('/auth/2fa/disable', { password, code: code.trim() || undefined });
      setPassword('');
      setCode('');
      setBackupCodes(null);
      toast.success('2FA desactivado');
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo desactivar el 2FA');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Card title="Verificación en dos pasos">Cargando…</Card>;

  if (backupCodes) {
    return (
      <Card title="Códigos de recuperación" className="max-w-md">
        <p className="mb-3 text-sm text-text-muted">
          Guardá estos códigos en un lugar seguro. Cada uno sirve una sola vez para ingresar si perdés el acceso a tu app.
        </p>
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-line bg-surface-alt p-3 font-mono text-sm">
          {backupCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <Button variant="secondary" onClick={() => setBackupCodes(null)}>
          Ya los guardé
        </Button>
      </Card>
    );
  }

  return (
    <Card
      title="Verificación en dos pasos"
      action={status?.enabled ? <Badge color="green">Activado</Badge> : <Badge color="gray">Desactivado</Badge>}
      className="max-w-md"
    >
      {!status?.enabled && !setup && (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            Agregá una capa extra de seguridad. Vas a necesitar un código de tu app autenticadora (Google Authenticator, Authy, etc.) cada vez que ingreses.
          </p>
          <Button onClick={startSetup} loading={busy}>
            Activar 2FA
          </Button>
        </div>
      )}

      {setup && (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">1. Escaneá el código QR con tu app autenticadora.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR 2FA" className="mx-auto h-48 w-48 rounded-lg border border-line bg-white p-2" />
          <p className="text-center text-xs text-text-muted">
            O ingresá la clave manualmente: <span className="font-mono">{setup.secret}</span>
          </p>
          <Field label="2. Ingresá el código de 6 dígitos">
            <Input inputMode="numeric" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button onClick={enable} loading={busy}>
              Confirmar y activar
            </Button>
            <Button variant="ghost" onClick={() => setSetup(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {status?.enabled && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Respaldo por email</span>
            <Button size="sm" variant={status.emailEnabled ? 'secondary' : 'ghost'} onClick={toggleEmail} loading={busy}>
              {status.emailEnabled ? 'Activado' : 'Activar'}
            </Button>
          </div>
          <div className="text-sm text-text-muted">
            Códigos de recuperación restantes: <span className="font-medium text-text">{status.backupCodesRemaining}</span>
          </div>
          <Field label="Código actual (para regenerar o desactivar)">
            <Input inputMode="numeric" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={regenerateBackup} loading={busy} disabled={!code}>
              Regenerar códigos
            </Button>
            <Button size="sm" variant="danger" onClick={disable} loading={busy} disabled={!password || !code}>
              Desactivar
            </Button>
          </div>
          <Field label="Contraseña actual (para desactivar)">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
      )}
    </Card>
  );
}

export default TwoFactorCard;
