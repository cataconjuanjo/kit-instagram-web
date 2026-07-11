export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/dashboard',
        '/login',
        '/bienvenida',
        '/api',
        '/carta/propuesta-',
        '/camarero/propuesta-',
      ],
    },
    sitemap: 'https://cataconjuanjo.com/sitemap.xml',
  }
}
