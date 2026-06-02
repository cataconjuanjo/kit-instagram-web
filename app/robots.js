export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/carta/propuesta-',
        '/camarero/propuesta-',
      ],
    },
    sitemap: 'https://cataconjuanjo.com/sitemap.xml',
  }
}
