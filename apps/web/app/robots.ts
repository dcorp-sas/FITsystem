import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard', '/members', '/memberships', '/cash', '/reports', '/settings', '/users', '/profile', '/activity', '/attendance', '/classes', '/payments', '/products', '/shop', '/routines', '/notifications', '/branches'] }],
    sitemap: 'https://fitsystem.com.ar/sitemap.xml',
    host: 'https://fitsystem.com.ar',
  };
}
