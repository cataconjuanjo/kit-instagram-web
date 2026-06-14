export default function manifest() {
  return {
    name: 'Carta Viva',
    short_name: 'Carta Viva',
    description: 'Carta digital, sala y bodega bajo control.',
    start_url: '/cartavinos',
    scope: '/',
    display: 'standalone',
    background_color: '#11100E',
    theme_color: '#74223D',
    icons: [
      {
        src: '/brand/carta-viva/icons/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/carta-viva/icons/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/carta-viva/icons/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
