import Image from 'next/image'

const LOGOS = {
  horizontal: {
    src: '/brand/carta-viva/logo-horizontal.png',
    width: 1500,
    height: 437,
    sizes: '(max-width: 768px) 76vw, 340px',
  },
  horizontalSvg: {
    src: '/brand/carta-viva/logo-horizontal.svg',
    width: 749,
    height: 200,
    sizes: '(max-width: 768px) 76vw, 340px',
    unoptimized: true,
  },
  horizontalDark: {
    src: '/brand/carta-viva/logo-horizontal-dark.svg',
    width: 522,
    height: 152,
    sizes: '(max-width: 768px) 76vw, 300px',
    unoptimized: true,
  },
  horizontalNegative: {
    src: '/brand/carta-viva/logo-horizontal-negative.png',
    width: 1800,
    height: 614,
    sizes: '(max-width: 768px) 76vw, 420px',
  },
  markDark: {
    src: '/brand/carta-viva/isotipo-dark.svg',
    width: 170,
    height: 168,
    sizes: '44px',
    unoptimized: true,
  },
}

export default function BrandLogo({
  variant = 'horizontal',
  alt = 'Carta Viva',
  className,
  priority = false,
  sizes,
}) {
  const logo = LOGOS[variant] || LOGOS.horizontal

  return (
    <Image
      className={className}
      src={logo.src}
      alt={alt}
      width={logo.width}
      height={logo.height}
      sizes={sizes || logo.sizes}
      priority={priority}
      unoptimized={logo.unoptimized}
    />
  )
}
