import Link from 'next/link'

export const metadata = {
  title: 'Privacidad y cookies',
  description: 'Politica de privacidad y cookies de Cata con Juanjo.',
}

export default function Privacidad() {
  return (
    <main className="legal-page">
      <Link href="/cartavinos" className="brand brand-logo">
        <img src="/brand/carta-viva/logo-horizontal.svg" alt="Carta Viva" />
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
        Carta Viva como cliente, también se tratan datos necesarios para operar la carta digital, panel privado,
        estadísticas y herramientas asociadas.
      </p>

      <h2>Finalidad</h2>
      <ul>
        <li>Responder consultas y solicitudes de diagnóstico.</li>
        <li>Prestar servicios de consultoría, formación y Carta Viva.</li>
        <li>Mantener comunicaciones comerciales solicitadas por el usuario.</li>
        <li>Mejorar la experiencia y funcionamiento del sitio.</li>
      </ul>

      <h2>Base legal</h2>
      <p>
        La base legal es el consentimiento del usuario al enviar formularios, la ejecución de servicios contratados y
        el interés legítimo en mantener una relación profesional solicitada.
      </p>

      <h2>Conservación</h2>
      <p>
        Los datos se conservan durante el tiempo necesario para atender la consulta, prestar el servicio o cumplir
        obligaciones legales.
      </p>

      <h2>Servicios de terceros</h2>
      <p>
        El sitio puede usar proveedores técnicos como Vercel, Supabase, Resend y servicios de inteligencia artificial
        para operar formularios, autenticación, base de datos y funcionalidades de Carta Viva.
      </p>

      <h2>Derechos</h2>
      <p>
        Puedes solicitar acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a
        {' '}<a href="mailto:cataconjuanjo@gmail.com">cataconjuanjo@gmail.com</a>. También puedes reclamar ante la
        Agencia Española de Protección de Datos.
      </p>

      <h2>Cookies</h2>
      <p>
        Este sitio usa cookies técnicas necesarias para la sesión y el funcionamiento de Carta Viva. Estas cookies no
        requieren consentimiento porque permiten prestar el servicio solicitado.
      </p>
      <p>
        En las páginas públicas de Cata con Juanjo se puede usar Google Analytics 4, con identificador G-393413201,
        para medir visitas y mejorar la web. Estas cookies analíticas solo se activan si aceptas el aviso de cookies.
        Puedes rechazarlas sin que ello afecte al acceso a la web.
      </p>
      <p>
        Las zonas privadas de Carta Viva, como el panel de administración, el dashboard del restaurante, la carta
        pública del restaurante, el hub y el modo camarero, quedan excluidas de Google Analytics. Las métricas internas
        de Carta Viva, si se usan, se tratan de forma operativa y agregada para mejorar la carta y detectar
        oportunidades de servicio.
      </p>
    </main>
  )
}
