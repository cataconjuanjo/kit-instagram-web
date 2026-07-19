import { recursos } from './recursos/content'

export default function sitemap() {
  const base = 'https://cataconjuanjo.com'
  const staticRoutes = [
    {
      url: `${base}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${base}/cartavinos`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    {
      url: `${base}/catas`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.75,
    },
    {
      url: `${base}/formacion-sala`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${base}/recursos`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${base}/aviso-legal`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${base}/privacidad`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ]

  const resourceRoutes = recursos.map((recurso) => ({
    url: `${base}/recursos/${recurso.slug}`,
    lastModified: new Date(recurso.updated),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...staticRoutes, ...resourceRoutes]
}
