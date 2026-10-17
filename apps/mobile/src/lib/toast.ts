// Avisos livianos para la app de socios.
//
// En la PWA (react-native-web) `Alert.alert` es un no-op, así que los mensajes
// de confirmación y de error nunca se veían. Este store + <ToastHost /> muestran
// los avisos tanto en web como en nativo.

export type ToastType = 'info' | 'success' | 'error';

export interface ToastMessage {
  id: number;
  title: string;
  message?: string;
  type: ToastType;
}

type Listener = (toast: ToastMessage) => void;

let listener: Listener | null = null;
let counter = 0;

export function showToast(title: string, message?: string, type: ToastType = 'info'): void {
  counter += 1;
  listener?.({ id: counter, title, message, type });
}

export function subscribeToast(fn: Listener | null): void {
  listener = fn;
}
