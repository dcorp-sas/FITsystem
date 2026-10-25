import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';
import { colors, spacing } from '../theme';
import { Badge, Card, Muted, PrimaryButton, Subtitle } from '../components/ui';
import { portal, ApiError, type CheckinResult } from '../lib/api';
import { showToast } from '../lib/toast';

// Bandera para no volver a pedir la cámara si el navegador no sabe recordarlo.
const CAMERA_KEY = 'fitsystem.socios.camera-granted';

async function readCameraFlag(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' && localStorage.getItem(CAMERA_KEY) === '1';
    }
    return (await SecureStore.getItemAsync(CAMERA_KEY)) === '1';
  } catch {
    return false;
  }
}

async function writeCameraFlag(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(CAMERA_KEY, '1');
    } else {
      await SecureStore.setItemAsync(CAMERA_KEY, '1');
    }
  } catch {
    /* ignore */
  }
}

export function ScanScreen({ onDone }: { onDone?: (res: CheckinResult) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [knownGranted, setKnownGranted] = useState(false);
  const [asked, setAsked] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);

  // Recuerda que el socio ya habilitó la cámara, para no volver a preguntar.
  useEffect(() => {
    void readCameraFlag().then(setKnownGranted);
  }, []);

  useEffect(() => {
    if (!permission) return;
    if (permission.granted) {
      if (!knownGranted) {
        setKnownGranted(true);
        void writeCameraFlag();
      }
      if (Platform.OS !== 'web') setCameraStarted(true);
      return;
    }
    if (Platform.OS === 'web') return;
    // Se pide una sola vez, de forma automática, si nunca se preguntó.
    if (!asked && permission.status === 'undetermined' && permission.canAskAgain) {
      setAsked(true);
      void requestPermission();
    }
  }, [permission, knownGranted, asked, requestPermission]);

  async function handleScan({ data }: BarcodeScanningResult) {
    if (scanned || busy) return;
    setScanned(true);
    setBusy(true);
    try {
      const res = await portal.checkin(data);
      setResult(res);
      if (res.allowed) {
        showToast('Ingreso registrado', `¡Bienvenido/a!${res.plan ? ` Plan: ${res.plan}` : ''}`, 'success');
      } else {
        showToast('No se pudo registrar', res.message ?? 'Tu membresía no permite el ingreso.', 'error');
      }
      onDone?.(res);
    } catch (error) {
      showToast('Error', error instanceof ApiError ? error.message : 'Intentá de nuevo.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const denied = permission?.status === 'denied';
  // En la web el navegador puede no exponer el estado real: si ya se habilitó
  // antes, se muestra la cámara directamente sin volver a pedir.
  const cameraUsable = Boolean(
    permission?.granted && (Platform.OS !== 'web' ? true : cameraStarted),
  );

  if (!cameraUsable && !permission && !knownGranted) {
    return (
      <View style={styles.center}>
        <Muted>Cargando cámara…</Muted>
      </View>
    );
  }

  if (!cameraUsable) {
    return (
      <View style={styles.container}>
        <Card>
          <Subtitle>Escaneá el QR de la entrada</Subtitle>
          <Muted style={{ marginTop: spacing.sm }}>
            {cameraError
              ? cameraError
              : denied
              ? 'El acceso a la cámara está bloqueado. Habilitalo desde los ajustes del navegador y volvé a intentar.'
              : 'Para registrar tu ingreso, la app necesita usar la cámara. Apuntá al cartel con el QR que está en la puerta del gimnasio.'}
          </Muted>
          {(Platform.OS === 'web' || permission?.canAskAgain !== false) && (
            <View style={{ marginTop: spacing.md }}>
              <PrimaryButton
                label={permission?.granted ? 'Activar cámara' : 'Habilitar cámara'}
                onPress={async () => {
                  setCameraError(null);
                  const res = permission?.granted ? permission : await requestPermission();
                  if (res.granted) {
                    setKnownGranted(true);
                    void writeCameraFlag();
                    setCameraStarted(true);
                  }
                }}
              />
            </View>
          )}
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned || busy ? undefined : handleScan}
          onMountError={(e) => {
            // La cámara no pudo iniciar (permiso revocado o sin dispositivo).
            setCameraStarted(false);
            setCameraError(e.message || 'No se pudo iniciar la cámara. Revisá los permisos del navegador.');
            showToast('Cámara no disponible', e.message || 'Revisá los permisos de la cámara.', 'error');
          }}
        />
        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.frame} />
          <Text style={styles.hint}>Apuntá al QR que está en la entrada</Text>
        </View>
      </View>

      <View style={styles.bottom}>
        <Card>
          {result ? (
            <>
              <View style={styles.rowBetween}>
                <Subtitle>{result.allowed ? 'Ingreso registrado' : 'No permitido'}</Subtitle>
                <Badge text={result.allowed ? 'OK' : 'Rechazado'} color={result.allowed ? colors.success : colors.danger} />
              </View>
              <Muted style={{ marginTop: spacing.sm }}>
                {result.allowed
                  ? `¡Bienvenido/a!${result.plan ? ` Plan: ${result.plan}` : ''}`
                  : result.message ?? 'Tu membresía no permite el ingreso.'}
              </Muted>
            </>
          ) : (
            <>
              <Subtitle>{busy ? 'Registrando…' : 'Listo para escanear'}</Subtitle>
              <Muted style={{ marginTop: spacing.sm }}>
                Escaneá el QR fijo del gimnasio para marcar tu ingreso.
              </Muted>
            </>
          )}
          <View style={{ marginTop: spacing.md }}>
            <PrimaryButton
              label="Escanear de nuevo"
              variant="ghost"
              loading={busy}
              onPress={() => {
                setResult(null);
                setScanned(false);
              }}
            />
          </View>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(96,165,250,0.9)',
  },
  hint: { color: '#e6ecf7', fontSize: 14, fontWeight: '600' },
  bottom: { padding: spacing.lg },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
