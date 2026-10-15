import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { colors, spacing } from '../theme';
import { Badge, Card, Muted, PrimaryButton, Subtitle } from '../components/ui';
import { portal, ApiError, type CheckinResult } from '../lib/api';

export function ScanScreen({ onDone }: { onDone?: (res: CheckinResult) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);

  async function handleScan({ data }: BarcodeScanningResult) {
    if (scanned || busy) return;
    setScanned(true);
    setBusy(true);
    try {
      const res = await portal.checkin(data);
      setResult(res);
      Alert.alert(
        res.allowed ? 'Ingreso registrado' : 'No se pudo registrar',
        res.allowed
          ? `¡Bienvenido/a!${res.plan ? ` Plan: ${res.plan}` : ''}`
          : res.message ?? 'Tu membresía no permite el ingreso.',
      );
      onDone?.(res);
    } catch (error) {
      Alert.alert('Error', error instanceof ApiError ? error.message : 'Intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <Muted>Cargando cámara…</Muted>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Card>
          <Subtitle>Escaneá el QR de la entrada</Subtitle>
          <Muted style={{ marginTop: spacing.sm }}>
            Para registrar tu ingreso, la app necesita usar la cámara. Apuntá al cartel con el QR que está en la puerta
            del gimnasio.
          </Muted>
          <View style={{ marginTop: spacing.md }}>
            <PrimaryButton label="Habilitar cámara" onPress={requestPermission} />
          </View>
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
