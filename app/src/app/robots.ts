import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://glimmer.pages.dev';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/edit/', '/generate/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
