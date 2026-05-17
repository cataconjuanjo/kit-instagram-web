export default function sitemap() {
  const base = 'https://cataconjuanjo.com'
  return [
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
}
