import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

/** Muestra las notificaciones entrantes mientras la app esta en primer plano. */
export function configureNotifications() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Pide permiso y registra el token de push del dispositivo contra la API.
 * Devuelve el token o null si no esta disponible (web, sin permiso o sin
 * projectId de EAS configurado). Requiere un development build con EAS.
 */
export async function registerPushAsync(
  register: (token: string, platform: 'ANDROID' | 'IOS') => Promise<unknown>,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Avisos',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? (Constants as { easConfig?: { projectId?: string } })?.easConfig?.projectId;
    if (!projectId) return null;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await register(token, Platform.OS === 'ios' ? 'IOS' : 'ANDROID');
    return token;
  } catch {
    return null;
  }
}

// Convierte la clave VAPID (base64url) al formato que espera PushManager.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Web Push para la PWA: pide permiso, suscribe el navegador con la clave VAPID
 * y registra la suscripcion contra la API. No hace nada fuera de la web.
 */
export async function registerWebPushAsync(
  getKey: () => Promise<{ publicKey: string }>,
  subscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }) => Promise<unknown>,
): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    if (typeof window === 'undefined' || !('PushManager' in window)) return false;

    const registration = await navigator.serviceWorker.ready;
    if (!registration || !registration.pushManager) return false;

    let permission = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const { publicKey } = await getKey();
    if (!publicKey) return false;

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }));

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
    await subscribe({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
    return true;
  } catch {
    return false;
  }
}
