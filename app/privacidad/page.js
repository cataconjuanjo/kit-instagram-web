import Link from 'next/link'

export const metadata = {
  title: 'Privacidad y cookies',
  description: 'Politica de privacidad y cookies de Cata con Juanjo.',
}

export default function Privacidad() {
  return (
    <main className="legal-page">
      <Link href="/" className="brand">
        <span>Cata con Juanjo</span>
        <small>Volver a la web</small>
      </Link>
      <h1>Privacidad y cookies</h1>

      <h2>Responsable</h2>
      <p>
        El responsable del tratamiento es Juanjo Garcia. Puedes contactar en
        {' '}<a href="mailto:cataconjuanjo@gmail.com">cataconjuanjo@gmail.com</a>.
      </p>

      <h2>Datos que se recogen</h2>
      <p>
        A traves de los formularios se pueden recoger nombre, email, restaurante o negocio y mensaje enviado. Si usas
        Carta Viva como cliente, tambien se tratan datos necesarios para operar la carta digital, panel privado,
        estadisticas y herramientas asociadas.
      </p>

      <h2>Finalidad</h2>
      <ul>
        <li>Responder consultas y solicitudes de diagnostico.</li>
        <li>Prestar servicios de consultoria, formacion y Carta Viva.</li>
        <li>Mantener comunicaciones comerciales solicitadas por el usuario.</li>
        <li>Mejorar la experiencia y funcionamiento del sitio.</li>
      </ul>

      <h2>Base legal</h2>
      <p>
        La base legal es el consentimiento del usuario al enviar formularios, la ejecucion de servicios contratados y
        el interes legitimo en mantener una relacion profesional solicitada.
      </p>

      <h2>Conservacion</h2>
      <p>
        Los datos se conservan durante el tiempo necesario para atender la consulta, prestar el servicio o cumplir
        obligaciones legales.
      </p>

      <h2>Servicios de terceros</h2>
      <p>
        El sitio puede usar proveedores tecnicos como Vercel, Supabase, Resend y servicios de inteligencia artificial
        para operar formularios, autenticacion, base de datos y funcionalidades de Carta Viva.
      </p>

      <h2>Derechos</h2>
      <p>
        Puedes solicitar acceso, rectificacion, supresion, oposicion, limitacion y portabilidad escribiendo a
        {' '}<a href="mailto:cataconjuanjo@gmail.com">cataconjuanjo@gmail.com</a>. Tambien puedes reclamar ante la
        Agencia Española de Proteccion de Datos.
      </p>

      <h2>Cookies</h2>
      <p>
        Este sitio puede usar cookies tecnicas necesarias para la sesion y funcionamiento de Carta Viva. Si se añaden
        cookies analiticas o publicitarias no necesarias, se solicitara consentimiento previo.
      </p>
    </main>
  )
}
