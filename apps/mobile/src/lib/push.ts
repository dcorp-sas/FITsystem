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
