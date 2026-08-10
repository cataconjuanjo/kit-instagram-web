import { metadataHubPublico } from '../../lib/publicRestaurantMetadata'

export const revalidate = 60

export async function generateMetadata({ params }) {
  const { slug } = await params
  return metadataHubPublico(slug)
}

export default function HubPublicoLayout({ children }) {
  return children
}
