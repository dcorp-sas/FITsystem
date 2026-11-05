const DOWNLOAD_BASE = 'https://github.com/dcorp-sas/FITsystem/releases/latest/download';

// Count the download request through the API when configured, then redirect to
// the release asset. Keep a direct fallback for local/unconfigured builds.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
const API_ROOT = API_BASE ? (/\/api$/.test(API_BASE) ? API_BASE : `${API_BASE}/api`) : '';

export function getDownloadUrl(asset: 'setup' | 'portable'): string {
  const file = asset === 'setup' ? 'FIT-System-Setup.exe' : 'FIT-System-Portable.exe';
  const direct = `${DOWNLOAD_BASE}/${file}`;
  return API_ROOT ? `${API_ROOT}/metrics/download/go?asset=${asset}` : direct;
}
