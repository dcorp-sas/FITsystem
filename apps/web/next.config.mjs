/** @type {import('next').NextConfig} */
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
let apiOrigin = '';
try {
  apiOrigin = new URL(apiUrl).origin;
} catch {
  apiOrigin = '';
}

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://*.mercadopago.com https://*.mercadolibre.com https://*.mlstatic.com",
  "style-src 'self' 'unsafe-inline' https://*.mercadopago.com https://*.mercadolibre.com https://*.mlstatic.com",
  'img-src \'self\' data: blob: https:',
  "media-src 'self' blob:",
  `connect-src 'self'${apiOrigin ? ' ' + apiOrigin : ''} https:`,
  "font-src 'self' data: https://*.mlstatic.com https://*.mercadopago.com",
  "frame-src 'self' https://*.mercadopago.com https://*.mercadopago.com.ar https://*.mercadopago.com.br https://*.mercadopago.com.mx https://*.mercadopago.com.co https://*.mercadolibre.com https://*.mlstatic.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' },
];

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@fitsystem/ui',
    '@fitsystem/config',
    '@fitsystem/types',
    '@fitsystem/utils',
  ],
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
