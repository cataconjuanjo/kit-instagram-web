import { metadataModoCamarero } from '../../lib/publicRestaurantMetadata'

export const revalidate = 60

export async function generateMetadata({ params }) {
  const { slug } = await params
  return metadataModoCamarero(slug)
}

export default function CamareroLayout({ children }) {
  return children
}
