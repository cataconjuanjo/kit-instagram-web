import Link from 'next/link'

export const metadata = {
  title: 'Aviso legal',
  description: 'Aviso legal de Cata con Juanjo.',
}

export default function AvisoLegal() {
  return (
    <main className="legal-page">
      <Link href="/" className="brand">
        <span>Cata con Juanjo</span>
        <small>Volver a la web</small>
      </Link>
      <h1>Aviso legal</h1>
      <p><strong>Titular:</strong> Juanjo Garcia</p>
      <p><strong>Domicilio:</strong> Malaga, España</p>
      <p><strong>Email:</strong> <a href="mailto:cataconjuanjo@gmail.com">cataconjuanjo@gmail.com</a></p>
      <p><strong>Web:</strong> https://cataconjuanjo.com</p>

      <h2>Objeto</h2>
      <p>
        Este sitio web presenta los servicios profesionales de Cata con Juanjo: consultoría de vino, formación,
        experiencias enologicas y herramientas digitales para restaurantes y negocios hospitality.
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

      <h2>Legislacion aplicable</h2>
      <p>
        Este aviso legal se rige por la legislacion española. Para cualquier controversia, las partes se someten a los
        juzgados y tribunales competentes de Malaga, salvo normativa aplicable en contrario.
      </p>
    </main>
  )
}
