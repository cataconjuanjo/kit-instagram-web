/** @type {import('next').NextConfig} */
const nextConfig = {
  // Incluir el grafo de Chartier en el file tracing de Vercel
  // Sin esto el archivo no se sube con el serverless bundle
  outputFileTracingIncludes: {
    '/api/maridaje': ['./data/chartier_graph.json'],
  },
}

export default nextConfig
