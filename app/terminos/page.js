import Link from 'next/link'
import BrandLogo from '../components/BrandLogo'

export const metadata = {
  title: 'Terminos de servicio',
  description: 'Condiciones de uso de Cata con Juanjo y Carta Viva.',
}

export default function Terminos() {
  return (
    <main className="legal-page">
      <Link href="/cartavinos" className="brand brand-logo">
        <BrandLogo variant="horizontalSvg" priority />
        <small>Volver a la web</small>
      </Link>
      <h1>Terminos de servicio</h1>
      <p><strong>Ultima actualizacion:</strong> 10 de agosto de 2026</p>

      <h2>Titular y contacto</h2>
      <p>
        Este sitio y los servicios asociados son gestionados por Juanjo Garcia, con contacto en
        {' '}<a href="mailto:cataconjuanjo@gmail.com">cataconjuanjo@gmail.com</a>.
      </p>

      <h2>Objeto del servicio</h2>
      <p>
        Cata con Juanjo ofrece consultoria de vino, formacion, experiencias enologicas y herramientas digitales como
        Carta Viva para ayudar a restaurantes y negocios hospitality a organizar, presentar y analizar su carta de vinos.
      </p>

      <h2>Uso de la web y de Carta Viva</h2>
      <p>
        La persona usuaria se compromete a utilizar la web y la aplicacion de forma licita, diligente y respetuosa con
        terceros. No esta permitido acceder sin autorizacion a zonas privadas, intentar vulnerar sistemas, automatizar
        abusivamente peticiones, introducir datos falsos o usar el servicio para fines fraudulentos.
      </p>

      <h2>Cuentas y seguridad</h2>
      <p>
        Cuando el servicio requiera una cuenta, cada usuario debe custodiar sus credenciales y comunicar cualquier uso
        no autorizado. El acceso puede limitarse, suspenderse o revocarse si se detecta abuso, riesgo de seguridad o
        incumplimiento de estas condiciones.
      </p>

      <h2>Datos y contenidos del cliente</h2>
      <p>
        El cliente es responsable de que la informacion que incorpora a Carta Viva, como vinos, precios, cartas,
        imagenes, textos o datos del negocio, sea correcta y tenga autorizacion suficiente para su uso. Cata con Juanjo
        tratara esos datos para prestar el servicio contratado y mantener su funcionamiento.
      </p>

      <h2>Herramientas de inteligencia artificial</h2>
      <p>
        Algunas funciones pueden apoyarse en sistemas de inteligencia artificial para generar sugerencias, analisis o
        textos de apoyo. Estos resultados son orientativos y deben revisarse antes de tomar decisiones comerciales,
        legales, sanitarias o economicas.
      </p>

      <h2>Disponibilidad y cambios</h2>
      <p>
        Se trabaja para mantener la web y Carta Viva disponibles y actualizadas, pero pueden producirse interrupciones
        por mantenimiento, mejoras, incidencias tecnicas o causas ajenas al control del titular. Las funcionalidades
        pueden evolucionar para mejorar el servicio o cumplir obligaciones legales.
      </p>

      <h2>Pagos, pruebas y cancelaciones</h2>
      <p>
        Las condiciones economicas concretas, duracion de pruebas, renovaciones, cancelaciones o trabajos a medida se
        indicaran en la propuesta, contrato, presupuesto o comunicacion comercial aceptada por el cliente.
      </p>

      <h2>Propiedad intelectual</h2>
      <p>
        La marca, textos, diseno, codigo, estructura, contenidos y materiales propios pertenecen a Juanjo Garcia o a
        terceros licenciantes. No se permite copiarlos, distribuirlos o explotarlos sin autorizacion expresa, salvo los
        usos necesarios para disfrutar del servicio contratado.
      </p>

      <h2>Proteccion de datos y cookies</h2>
      <p>
        El tratamiento de datos personales y el uso de cookies se explican en la
        {' '}<Link href="/privacidad">politica de privacidad y cookies</Link>. El aviso legal esta disponible en
        {' '}<Link href="/aviso-legal">aviso legal</Link>.
      </p>

      <h2>Responsabilidad</h2>
      <p>
        Dentro de los limites permitidos por la normativa aplicable, el titular no responde de danos derivados de un uso
        indebido del servicio, de datos incorrectos introducidos por el cliente, de decisiones tomadas sin revision
        profesional o de incidencias causadas por terceros proveedores.
      </p>

      <h2>Legislacion aplicable</h2>
      <p>
        Estas condiciones se rigen por la legislacion espanola. Para cualquier controversia, las partes se someten a los
        juzgados y tribunales competentes de Malaga, salvo normativa imperativa aplicable en contrario.
      </p>
    </main>
  )
}
