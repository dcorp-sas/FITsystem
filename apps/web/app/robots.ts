import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/profes', '/dashboard', '/members', '/memberships', '/cash', '/reports', '/settings', '/users', '/profile', '/activity', '/attendance', '/classes', '/payments', '/products', '/shop', '/routines', '/notifications'] }],
    sitemap: 'https://fitsystem.com.ar/sitemap.xml',
    host: 'https://fitsystem.com.ar',
  };
}
