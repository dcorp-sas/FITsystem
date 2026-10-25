import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...[
      '/',
      '/privacidad',
      '/terminos',
      '/arrepentimiento',
      '/software-para-gimnasios',
      '/control-de-socios-y-cuotas',
      '/control-de-acceso-qr',
      '/cobros-mercadopago-gimnasios',
      '/app-para-socios',
      '/gimnasio-sin-internet',
    ].map((route) => ({
      url: `https://fitsystem.com.ar${route}`,
      lastModified: new Date(),
      changeFrequency: route === '/' ? 'weekly' as const : 'monthly' as const,
      priority: route === '/' ? 1 : 0.7,
    })),
  ];
}
