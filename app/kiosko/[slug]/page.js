import { notFound } from 'next/navigation'
import KioskoApp from './KioskoApp'

const SLUGS_RESERVADOS = new Set(['contratar', 'bienvenida'])

export default async function Page({ params }) {
  const { slug } = await params
  if (SLUGS_RESERVADOS.has(slug)) notFound()
  return <KioskoApp />
}
