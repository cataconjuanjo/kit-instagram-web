'use client'

import { useState } from 'react'

async function descargarPDF() {
  const html2canvas = (await import('html2canvas')).default
  const jsPDF = (await import('jspdf')).default
  const paginas = document.querySelectorAll('.dossier-page')
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

  for (let i = 0; i < paginas.length; i += 1) {
    const canvas = await html2canvas(paginas[i], {
      scale: 3,
      useCORS: true,
      backgroundColor: '#f7f2e9',
      logging: false,
    })
    if (i > 0) pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, 210, 297)
  }

  pdf.save('carta-viva-dossier.pdf')
}

const resultados = [
  {
    numero: '01',
    titulo: 'Más vino bien recomendado',
    texto: 'La carta y el equipo conectan cada mesa con referencias que encajan con la cocina, el momento y el presupuesto.',
  },
  {
    numero: '02',
    titulo: 'Más criterio en sala',
    texto: 'El equipo dispone de argumentos claros, alternativas y objetivos de servicio sin recitar fichas técnicas.',
  },
  {
    numero: '03',
    titulo: 'Más control de la bodega',
    texto: 'Stock, compras, precios y márgenes dejan de vivir en lugares distintos y empiezan a contar la misma historia.',
  },
]

const palancas = [
  ['Venta', 'Referencias que encajan con la cocina pero hoy tienen poca visibilidad.'],
  ['Margen', 'Vinos con un coste o un PVP que conviene revisar antes de seguir vendiéndolos igual.'],
  ['Rotación', 'Botellas con demasiado stock que pueden activarse en sala, por copa o mediante un maridaje concreto.'],
  ['Compra', 'Reposiciones, proveedores y nuevas referencias decididas con más información y menos intuición.'],
]

const planes = [
  {
    nombre: 'Básico',
    etiqueta: 'Carta y cliente',
    resumen: 'Para presentar el vino con el mismo cuidado que la cocina.',
    incluye: [
      'Carta digital personalizada',
      'Fichas claras y vinos por copa',
      'Recomendaciones con los platos reales',
      'Selección de la casa y comparador',
      'QR y actualización de referencias',
    ],
  },
  {
    nombre: 'Sala',
    etiqueta: 'Operativa completa',
    resumen: 'Para conectar cliente, equipo y bodega durante el servicio.',
    destacado: true,
    incluye: [
      'Todo lo incluido en Básico',
      'Modo camarero y briefing de sala',
      'Objetivos: copa, ticket, local o rotación',
      'Stock, márgenes, inventario y pedidos',
      'Cierre de servicio y estadísticas',
    ],
  },
  {
    nombre: 'Acompañado',
    etiqueta: 'Dirección y evolución',
    resumen: 'Para revisar y desarrollar la propuesta de vino con criterio profesional.',
    incluye: [
      'Todo lo incluido en Sala',
      'Lectura periódica de carta y bodega',
      'Oportunidades de margen y rotación',
      'Estrategia de copas y proveedores',
      'Recomendaciones y seguimiento',
    ],
  },
]

export default function Dossier() {
  const [generando, setGenerando] = useState(false)

  async function handleDescargar() {
    setGenerando(true)
    try {
      await descargarPDF()
    } finally {
      setGenerando(false)
    }
  }

  return (
    <main className="dossier">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,500;0,600;1,500&display=swap');

        :root {
          --ink: #241811;
          --wine: #5b1d2a;
          --green: #243a31;
          --paper: #f7f2e9;
          --gold: #bd9560;
          --muted: #796c62;
          --line: rgba(36, 24, 17, .16);
        }

        * { box-sizing: border-box; }
        body { margin: 0; background: #d8d0c3; }
        .dossier {
          min-height: 100vh;
          padding: 28px 0 60px;
          color: var(--ink);
          font-family: 'DM Sans', sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .download {
          position: fixed;
          z-index: 20;
          top: 22px;
          right: 22px;
          border: 0;
          border-radius: 999px;
          background: var(--ink);
          color: white;
          padding: 12px 20px;
          font: 600 12px/1 'DM Sans', sans-serif;
          letter-spacing: .08em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(36, 24, 17, .2);
        }
        .dossier-page {
          position: relative;
          width: 210mm;
          height: 297mm;
          margin: 0 auto 24px;
          overflow: hidden;
          background: var(--paper);
          box-shadow: 0 18px 50px rgba(36, 24, 17, .18);
        }
        .page-inner {
          height: 100%;
          padding: 18mm 17mm 15mm;
          display: flex;
          flex-direction: column;
        }
        .folio {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: .18em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .brand { color: var(--wine); }
        .serif { font-family: 'Playfair Display', Georgia, serif; }
        .eyebrow {
          margin: 0 0 14px;
          color: var(--wine);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: .18em;
          text-transform: uppercase;
        }
        h1, h2, h3, p { margin-top: 0; }
        .cover {
          background:
            radial-gradient(circle at 76% 18%, rgba(189,149,96,.18), transparent 28%),
            linear-gradient(145deg, #243a31 0%, #1c2d26 58%, #16241f 100%);
          color: #f8f1e5;
        }
        .cover .page-inner { padding: 18mm 18mm 16mm; }
        .cover .folio { color: rgba(255,255,255,.5); }
        .cover .brand { color: #e4c99f; }
        .cover-copy {
          width: 83%;
          margin: auto 0;
        }
        .cover-kicker {
          margin-bottom: 24px;
          color: #e4c99f;
          font-size: 11px;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        .cover h1 {
          margin-bottom: 26px;
          font-size: 59px;
          line-height: .98;
          font-weight: 500;
          letter-spacing: -.035em;
        }
        .cover h1 em { color: #e4c99f; font-weight: 500; }
        .cover-lead {
          max-width: 570px;
          margin: 0;
          padding-top: 24px;
          border-top: 1px solid rgba(255,255,255,.25);
          color: rgba(255,255,255,.78);
          font-size: 18px;
          line-height: 1.55;
          font-weight: 300;
        }
        .cover-bottom {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
        }
        .cover-result {
          padding-top: 13px;
          border-top: 1px solid rgba(255,255,255,.2);
        }
        .cover-result strong {
          display: block;
          margin-bottom: 5px;
          color: #e4c99f;
          font: 500 17px/1.15 'Playfair Display', Georgia, serif;
        }
        .cover-result span {
          color: rgba(255,255,255,.56);
          font-size: 10px;
          line-height: 1.4;
        }
        .section-head { margin: 34px 0 28px; }
        .section-head h2 {
          max-width: 620px;
          margin-bottom: 15px;
          font: 500 37px/1.08 'Playfair Display', Georgia, serif;
          letter-spacing: -.025em;
        }
        .section-head > p:last-child {
          max-width: 610px;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.6;
        }
        .results {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 32px;
        }
        .result {
          min-height: 192px;
          padding: 20px 18px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,.34);
        }
        .result-number {
          color: var(--gold);
          font-size: 10px;
          letter-spacing: .14em;
        }
        .result h3 {
          margin: 38px 0 10px;
          font: 600 21px/1.1 'Playfair Display', Georgia, serif;
        }
        .result p {
          color: var(--muted);
          font-size: 11px;
          line-height: 1.55;
        }
        .money-block {
          display: grid;
          grid-template-columns: .8fr 1.2fr;
          gap: 24px;
          margin-top: auto;
          padding: 25px;
          background: var(--wine);
          color: white;
        }
        .money-block h3 {
          margin-bottom: 10px;
          font: 500 25px/1.12 'Playfair Display', Georgia, serif;
        }
        .money-block > div > p {
          color: rgba(255,255,255,.66);
          font-size: 11px;
          line-height: 1.55;
        }
        .levers { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; }
        .lever {
          padding-left: 12px;
          border-left: 2px solid #d4ae79;
        }
        .lever strong {
          display: block;
          margin-bottom: 4px;
          color: #ecd5b2;
          font-size: 11px;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .lever span {
          color: rgba(255,255,255,.7);
          font-size: 10px;
          line-height: 1.45;
        }
        .plans-head {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 30px;
          margin: 34px 0 25px;
        }
        .plans-head h2 {
          max-width: 500px;
          margin: 0;
          font: 500 37px/1.07 'Playfair Display', Georgia, serif;
          letter-spacing: -.025em;
        }
        .plans-head p {
          max-width: 240px;
          margin: 0;
          color: var(--muted);
          font-size: 11px;
          line-height: 1.5;
        }
        .plans {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 11px;
        }
        .plan {
          display: flex;
          min-height: 448px;
          flex-direction: column;
          padding: 20px 17px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,.35);
        }
        .plan.featured {
          background: var(--green);
          border-color: var(--green);
          color: white;
        }
        .plan-label {
          margin-bottom: 24px;
          color: var(--wine);
          font-size: 9px;
          font-weight: 600;
          letter-spacing: .13em;
          text-transform: uppercase;
        }
        .featured .plan-label { color: #dfbf91; }
        .plan h3 {
          margin-bottom: 8px;
          font: 600 27px/1 'Playfair Display', Georgia, serif;
        }
        .plan-summary {
          min-height: 92px;
          margin-top: 14px;
          margin-bottom: 18px;
          padding-bottom: 18px;
          border-bottom: 1px solid var(--line);
          color: var(--muted);
          font-size: 11px;
          line-height: 1.5;
        }
        .featured .plan-summary {
          color: rgba(255,255,255,.66);
          border-color: rgba(255,255,255,.18);
        }
        .plan ul { margin: 0; padding: 0; list-style: none; }
        .plan li {
          position: relative;
          margin-bottom: 14px;
          padding-left: 17px;
          color: #554940;
          font-size: 10.5px;
          line-height: 1.42;
        }
        .plan li::before {
          content: '·';
          position: absolute;
          left: 2px;
          color: var(--gold);
          font-size: 18px;
          line-height: 10px;
        }
        .featured li { color: rgba(255,255,255,.76); }
        .plan-note {
          margin-top: auto;
          padding-top: 17px;
          border-top: 1px solid var(--line);
          color: var(--muted);
          font-size: 9px;
          line-height: 1.45;
        }
        .featured .plan-note {
          color: rgba(255,255,255,.5);
          border-color: rgba(255,255,255,.18);
        }
        .closing {
          display: grid;
          grid-template-columns: 1.35fr .65fr;
          gap: 25px;
          margin-top: auto;
          padding: 24px 26px;
          background: #eadfcf;
        }
        .closing h3 {
          margin-bottom: 7px;
          font: 600 23px/1.15 'Playfair Display', Georgia, serif;
        }
        .closing p {
          margin: 0;
          color: var(--muted);
          font-size: 10px;
          line-height: 1.5;
        }
        .contact {
          align-self: center;
          padding-left: 20px;
          border-left: 1px solid var(--line);
        }
        .contact strong {
          display: block;
          margin-bottom: 8px;
          color: var(--wine);
          font-size: 10px;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        .contact span { display: block; margin-bottom: 3px; font-size: 10px; }

        @media print {
          body, .dossier { background: white; }
          .dossier { padding: 0; }
          .download { display: none; }
          .dossier-page { margin: 0; box-shadow: none; page-break-after: always; }
        }
        @media (max-width: 850px) {
          .dossier { padding-top: 75px; overflow-x: auto; }
          .dossier-page { margin-left: 15px; margin-right: 15px; }
        }
      `}</style>

      <button className="download" onClick={handleDescargar} disabled={generando}>
        {generando ? 'Generando…' : 'Descargar PDF'}
      </button>

      <section className="dossier-page cover">
        <div className="page-inner">
          <div className="folio">
            <span className="brand">Carta Viva</span>
            <span>Cata con Juanjo · 2026</span>
          </div>

          <div className="cover-copy">
            <p className="cover-kicker">Carta · Sala · Bodega</p>
            <h1 className="serif">
              Tu cocina tiene<br />un criterio.<br />
              <em>Tu propuesta de vino también.</em>
            </h1>
            <p className="cover-lead">
              Carta Viva conecta la propuesta gastronómica con la carta, el trabajo de sala
              y la gestión de bodega para que el vino se recomiende mejor y evolucione junto al restaurante.
            </p>
          </div>

          <div className="cover-bottom">
            <div className="cover-result">
              <strong>Elegir mejor</strong>
              <span>Una carta que acompaña la cocina y orienta al cliente.</span>
            </div>
            <div className="cover-result">
              <strong>Recomendar mejor</strong>
              <span>Argumentos concretos para cada plato, mesa y servicio.</span>
            </div>
            <div className="cover-result">
              <strong>Decidir mejor</strong>
              <span>Información útil sobre margen, stock y rotación.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="dossier-page">
        <div className="page-inner">
          <div className="folio">
            <span className="brand">Carta Viva</span>
            <span>02 / 03</span>
          </div>

          <header className="section-head">
            <p className="eyebrow">El valor para el restaurante</p>
            <h2>El vino deja de ser una lista y empieza a trabajar para el negocio.</h2>
            <p>
              No se trata de añadir referencias. Se trata de que cada vino tenga una razón para estar,
              un lugar dentro de la cocina y una oportunidad real de venderse.
            </p>
          </header>

          <div className="results">
            {resultados.map((resultado) => (
              <article className="result" key={resultado.numero}>
                <span className="result-number">{resultado.numero}</span>
                <h3>{resultado.titulo}</h3>
                <p>{resultado.texto}</p>
              </article>
            ))}
          </div>

          <aside className="money-block">
            <div>
              <p className="eyebrow" style={{ color: '#d9b27e' }}>Dónde aparece el retorno</p>
              <h3>Primero localizamos la oportunidad. Después ponemos números.</h3>
              <p>
                El impacto se calcula con los datos reales del restaurante: costes, precios,
                stock, ventas y funcionamiento de sala. Sin promesas genéricas.
              </p>
            </div>
            <div className="levers">
              {palancas.map(([titulo, texto]) => (
                <div className="lever" key={titulo}>
                  <strong>{titulo}</strong>
                  <span>{texto}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="dossier-page">
        <div className="page-inner">
          <div className="folio">
            <span className="brand">Carta Viva</span>
            <span>03 / 03</span>
          </div>

          <div className="plans-head">
            <div>
              <p className="eyebrow">Tres formas de trabajar</p>
              <h2>Desde una carta mejor presentada hasta una propuesta de vino dirigida.</h2>
            </div>
            <p>
              La configuración inicial se valora según el volumen y el estado de las cartas del restaurante.
            </p>
          </div>

          <div className="plans">
            {planes.map((plan) => (
              <article className={`plan ${plan.destacado ? 'featured' : ''}`} key={plan.nombre}>
                <p className="plan-label">{plan.etiqueta}</p>
                <h3>{plan.nombre}</h3>
                <p className="plan-summary">{plan.resumen}</p>
                <ul>
                  {plan.incluye.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <p className="plan-note">
                  {plan.nombre === 'Acompañado'
                    ? 'El alcance se define después de conocer la carta, la cocina y los objetivos del restaurante.'
                    : 'Suscripción mensual. El restaurante mantiene siempre el control de sus datos y contenidos.'}
                </p>
              </article>
            ))}
          </div>

          <footer className="closing">
            <div>
              <h3>Empezamos por entender el restaurante.</h3>
              <p>
                Revisamos la carta actual, la cocina y la forma de trabajar en sala.
                A partir de ahí vemos qué nivel de herramienta y acompañamiento tiene sentido.
              </p>
            </div>
            <div className="contact">
              <strong>Contacto directo</strong>
              <span>cataconjuanjo.com</span>
              <span>@cataconjuanjo</span>
              <span>cataconjuanjo@gmail.com</span>
            </div>
          </footer>
        </div>
      </section>
    </main>
  )
}
