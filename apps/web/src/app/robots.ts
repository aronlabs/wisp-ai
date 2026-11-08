import type { MetadataRoute } from 'next';
import { site } from '../site';
import { isPreview } from '../seo';

export default function robots(): MetadataRoute.Robots {
  if (isPreview) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return { rules: { userAgent: '*', allow: '/' }, sitemap: `${site.url}/sitemap.xml` };
}
