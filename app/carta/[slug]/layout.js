import { metadataCartaPublica } from '../../lib/publicRestaurantMetadata'

export async function generateMetadata({ params }) {
  const { slug } = await params
  return metadataCartaPublica(slug)
}

export default function CartaPublicaLayout({ children }) {
  return children
}
