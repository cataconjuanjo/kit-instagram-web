import Link from 'next/link'
import BrandLogo from '../components/BrandLogo'

export const metadata = {
  title: 'Aviso legal',
  description: 'Aviso legal de Cata con Juanjo.',
}

export default function AvisoLegal() {
  return (
    <main className="legal-page">
      <Link href="/cartavinos" className="brand brand-logo">
        <BrandLogo variant="horizontalSvg" priority />
        <small>Volver a la web</small>
      </Link>
      <h1>Aviso legal</h1>
      <p><strong>Titular:</strong> Juanjo García</p>
      <p><strong>Domicilio:</strong> Málaga, España</p>
      <p><strong>Email:</strong> <a href="mailto:cataconjuanjo@gmail.com">cataconjuanjo@gmail.com</a></p>
      <p><strong>Web:</strong> https://cataconjuanjo.com</p>

      <h2>Objeto</h2>
      <p>
        Este sitio web presenta los servicios profesionales de Cata con Juanjo: consultoría de vino, formación,
        experiencias enológicas y herramientas digitales para restaurantes y negocios hospitality.
      </p>

      <h2>Propiedad intelectual</h2>
      <p>
        Los textos, diseño, imágenes, código y contenidos pertenecen a Juanjo García o a terceros que han autorizado
        su uso. No se permite su reproducción, distribución o comunicación pública sin autorización expresa.
      </p>

      <h2>Responsabilidad</h2>
      <p>
        Se trabaja para mantener la información actualizada y correcta, pero el titular no se responsabiliza de usos
        indebidos del contenido ni de interrupciones técnicas ajenas a su control.
      </p>

      <h2>Legislación aplicable</h2>
      <p>
        Este aviso legal se rige por la legislación española. Para cualquier controversia, las partes se someten a los
        juzgados y tribunales competentes de Málaga, salvo normativa aplicable en contrario.
      </p>
    </main>
  )
}
