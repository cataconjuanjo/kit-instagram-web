'use client'

import { useEffect, useState } from 'react'

async function descargarPDF() {
  const html2canvas = (await import('html2canvas')).default
  const jsPDF = (await import('jspdf')).default
  const paginas = document.querySelectorAll('.guide-page')
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

  for (let i = 0; i < paginas.length; i += 1) {
    const canvas = await html2canvas(paginas[i], {
      scale: 3,
      useCORS: true,
      backgroundColor: '#f7f2e9',
      logging: false,
    })
    if (i > 0) pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.99), 'JPEG', 0, 0, 210, 297)
  }

  pdf.save('carta-viva-guia-de-producto-2026.pdf')
}

const momentos = [
  ['Antes', 'Briefing, objetivo de servicio y referencias a impulsar.'],
  ['Durante', 'Recomendación, alternativas y señales rápidas de sala.'],
  ['Después', 'Cierre, stock, dudas y decisiones pendientes.'],
  ['Con el tiempo', 'Margen, rotación, oportunidades y evolución de carta.'],
]

const planData = [
  {
    name: 'Básico',
    label: 'Carta y cliente',
    text: 'Para presentar la propuesta de vino con el mismo cuidado que la cocina.',
    items: ['Carta digital y QR', 'Hub e identidad visual', 'Vinos, platos y destacados', 'Recomendación al cliente'],
  },
  {
    name: 'Sala',
    label: 'Operativa completa',
    text: 'Para conectar cliente, equipo y bodega durante el trabajo diario.',
    items: ['Todo lo incluido en Básico', 'Modo camarero y briefing', 'Cierre y actividad', 'Bodega, precios e inventario'],
    featured: true,
  },
  {
    name: 'Acompañado',
    label: 'Dirección y evolución',
    text: 'Para desarrollar la propuesta de vino con seguimiento profesional.',
    items: ['Todo lo incluido en Sala', 'Diagnóstico e informes', 'Estrategia de carta y copas', 'Proveedores y seguimiento'],
  },
]

function Folio({ page, dark = false }) {
  return (
    <div className={`folio ${dark ? 'folio-dark' : ''}`}>
      <span>Carta Viva</span>
      <span>{String(page).padStart(2, '0')} / 10</span>
    </div>
  )
}

function Tag({ children }) {
  return <p className="tag">{children}</p>
}

export default function GuiaCartaViva() {
  const [generando, setGenerando] = useState(false)
  const [paginaVisible, setPaginaVisible] = useState(null)

  useEffect(() => {
    const valor = Number(new URLSearchParams(window.location.search).get('page'))
    if (valor >= 1 && valor <= 10) setPaginaVisible(valor)
  }, [])

  async function handleDownload() {
    setGenerando(true)
    try {
      await descargarPDF()
    } finally {
      setGenerando(false)
    }
  }

  const visible = page => paginaVisible === null || paginaVisible === page

  return (
    <main className="guide">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,500;0,600;1,500&display=swap');

        :root {
          --paper: #f7f2e9;
          --ink: #241811;
          --muted: #786a60;
          --wine: #5b1d2a;
          --green: #243a31;
          --gold: #bd9560;
          --cream: #eadfce;
          --line: rgba(36,24,17,.16);
        }
        * { box-sizing: border-box; }
        html, body { margin: 0; background: #d8d0c3; }
        .cookie-consent { display: none !important; }
        .guide {
          min-height: 100vh;
          padding: 24px 0 50px;
          color: var(--ink);
          font-family: 'DM Sans', Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .download {
          position: fixed;
          z-index: 50;
          top: 20px;
          right: 20px;
          border: 0;
          border-radius: 999px;
          padding: 12px 20px;
          background: var(--ink);
          color: #fff;
          font: 600 11px/1 'DM Sans', sans-serif;
          letter-spacing: .09em;
          text-transform: uppercase;
          box-shadow: 0 8px 24px rgba(36,24,17,.2);
          cursor: pointer;
        }
        .guide-page {
          position: relative;
          width: 210mm;
          height: 297mm;
          margin: 0 auto 22px;
          overflow: hidden;
          background: var(--paper);
          box-shadow: 0 18px 48px rgba(36,24,17,.18);
          break-after: page;
          page-break-after: always;
        }
        .inner {
          height: 100%;
          padding: 16mm 17mm 15mm;
          display: flex;
          flex-direction: column;
        }
        .folio {
          display: flex;
          justify-content: space-between;
          color: var(--muted);
          font-size: 8.5px;
          font-weight: 600;
          letter-spacing: .17em;
          text-transform: uppercase;
        }
        .folio span:first-child { color: var(--wine); }
        .folio-dark { color: rgba(255,255,255,.48); }
        .folio-dark span:first-child { color: #e3c394; }
        .tag {
          margin: 0 0 14px;
          color: var(--wine);
          font-size: 9px;
          font-weight: 600;
          letter-spacing: .18em;
          text-transform: uppercase;
        }
        h1, h2, h3, p { margin-top: 0; }
        h1, h2, h3 { font-family: 'Playfair Display', Georgia, serif; }
        .title {
          margin-bottom: 14px;
          max-width: 630px;
          font-size: 38px;
          line-height: 1.06;
          font-weight: 500;
          letter-spacing: -.025em;
        }
        .lead {
          max-width: 630px;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.62;
        }
        .section-head { margin: 31px 0 25px; }
        .cover {
          color: #f7f1e7;
          background:
            radial-gradient(circle at 78% 18%, rgba(189,149,96,.21), transparent 27%),
            linear-gradient(145deg, #243a31, #17261f);
        }
        .cover-main {
          width: 88%;
          margin: auto 0;
        }
        .cover-kicker {
          margin-bottom: 22px;
          color: #e3c394;
          font-size: 10px;
          letter-spacing: .17em;
          text-transform: uppercase;
        }
        .cover h1 {
          margin-bottom: 26px;
          font-size: 57px;
          line-height: .98;
          font-weight: 500;
          letter-spacing: -.04em;
        }
        .cover h1 em { color: #e3c394; font-weight: 500; }
        .cover-lead {
          max-width: 590px;
          padding-top: 23px;
          border-top: 1px solid rgba(255,255,255,.22);
          color: rgba(255,255,255,.74);
          font-size: 17px;
          line-height: 1.55;
          font-weight: 300;
        }
        .cover-foot {
          position: absolute;
          left: 18mm;
          right: 18mm;
          bottom: 16mm;
          display: flex;
          justify-content: space-between;
          align-items: end;
          color: rgba(255,255,255,.48);
          font-size: 9px;
          letter-spacing: .1em;
          text-transform: uppercase;
        }
        .cover-mark {
          width: 52px;
          height: 52px;
          object-fit: contain;
          opacity: .92;
        }
        .circuit {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin: 18px 0 30px;
        }
        .circuit-card {
          min-height: 150px;
          padding: 18px 14px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,.32);
        }
        .circuit-n {
          color: var(--gold);
          font-size: 9px;
          letter-spacing: .15em;
        }
        .circuit-card h3 {
          margin: 36px 0 9px;
          font-size: 19px;
          line-height: 1.1;
        }
        .circuit-card p {
          margin: 0;
          color: var(--muted);
          font-size: 10px;
          line-height: 1.48;
        }
        .statement {
          margin-top: auto;
          padding: 25px 28px;
          background: var(--wine);
          color: white;
        }
        .statement p {
          margin: 0;
          font: 500 24px/1.32 'Playfair Display', Georgia, serif;
        }
        .statement small {
          display: block;
          margin-top: 12px;
          color: rgba(255,255,255,.58);
          font-size: 10px;
          line-height: 1.5;
        }
        .timeline {
          position: relative;
          display: grid;
          gap: 0;
          margin-top: 8px;
        }
        .moment {
          display: grid;
          grid-template-columns: 95px 1fr;
          gap: 22px;
          min-height: 117px;
          padding: 17px 0;
          border-top: 1px solid var(--line);
        }
        .moment:first-child { border-top: 0; }
        .moment h3 {
          margin: 0;
          color: var(--wine);
          font-size: 20px;
        }
        .moment p {
          margin: 0 0 8px;
          color: var(--muted);
          font-size: 11px;
          line-height: 1.5;
        }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip {
          padding: 5px 8px;
          border-radius: 999px;
          background: #eadfce;
          color: #625249;
          font-size: 8.5px;
        }
        .split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          margin-top: 10px;
        }
        .panel {
          padding: 22px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,.34);
        }
        .panel.dark {
          background: var(--green);
          color: white;
          border-color: var(--green);
        }
        .panel h3 {
          margin-bottom: 11px;
          font-size: 23px;
          line-height: 1.1;
        }
        .panel > p {
          color: var(--muted);
          font-size: 11px;
          line-height: 1.52;
        }
        .panel.dark > p { color: rgba(255,255,255,.62); }
        .clean-list {
          margin: 17px 0 0;
          padding: 0;
          list-style: none;
        }
        .clean-list li {
          position: relative;
          margin-bottom: 10px;
          padding-left: 16px;
          color: #594c43;
          font-size: 10px;
          line-height: 1.42;
        }
        .clean-list li::before {
          content: '·';
          position: absolute;
          left: 1px;
          top: -4px;
          color: var(--gold);
          font-size: 20px;
        }
        .panel.dark .clean-list li { color: rgba(255,255,255,.76); }
        .flow-note {
          margin-top: auto;
          padding: 18px 21px;
          border-left: 3px solid var(--gold);
          background: #ede3d5;
          color: #574940;
          font-size: 11px;
          line-height: 1.55;
        }
        .objective-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin: 19px 0 25px;
        }
        .objective {
          padding: 17px 14px;
          background: #fffaf3;
          border: 1px solid var(--line);
        }
        .objective strong {
          display: block;
          margin-bottom: 6px;
          color: var(--wine);
          font: 600 15px/1.15 'Playfair Display', Georgia, serif;
        }
        .objective span {
          color: var(--muted);
          font-size: 9px;
          line-height: 1.4;
        }
        .signal-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 7px;
          margin-top: auto;
        }
        .signal {
          padding: 14px 7px;
          text-align: center;
          border-radius: 5px;
          background: var(--wine);
          color: white;
          font-size: 9px;
        }
        .weekly {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin: 18px 0;
        }
        .weekly-card {
          min-height: 180px;
          padding: 20px;
          background: #fffaf3;
          border: 1px solid var(--line);
        }
        .weekly-card h3 {
          font-size: 22px;
          margin-bottom: 9px;
        }
        .weekly-card p {
          color: var(--muted);
          font-size: 10px;
          line-height: 1.48;
        }
        .number-line {
          display: flex;
          gap: 8px;
          margin-top: 15px;
        }
        .number-line span {
          flex: 1;
          padding: 10px 7px;
          background: #eadfce;
          text-align: center;
          color: #69574b;
          font-size: 8px;
        }
        .matrix {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin: 15px 0 24px;
        }
        .matrix-card {
          min-height: 119px;
          padding: 17px;
          color: white;
        }
        .matrix-card:nth-child(1) { background: #315747; }
        .matrix-card:nth-child(2) { background: #9a713f; }
        .matrix-card:nth-child(3) { background: #7b4d40; }
        .matrix-card:nth-child(4) { background: #5a5150; }
        .matrix-card h3 { margin-bottom: 7px; font-size: 20px; }
        .matrix-card p { margin: 0; color: rgba(255,255,255,.68); font-size: 9.5px; line-height: 1.42; }
        .data-strip {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
          margin-top: auto;
        }
        .data-box {
          padding: 16px 13px;
          border-top: 2px solid var(--gold);
          background: #ede3d5;
        }
        .data-box strong {
          display: block;
          margin-bottom: 5px;
          color: var(--wine);
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: .1em;
        }
        .data-box span { color: var(--muted); font-size: 8.5px; line-height: 1.38; }
        .consultor-flow {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin: 18px 0 25px;
        }
        .consultor-step {
          position: relative;
          min-height: 125px;
          padding: 17px 13px;
          background: var(--green);
          color: white;
        }
        .consultor-step span {
          color: #d8b37d;
          font-size: 9px;
          letter-spacing: .12em;
        }
        .consultor-step h3 {
          margin: 25px 0 7px;
          font-size: 18px;
        }
        .consultor-step p {
          margin: 0;
          color: rgba(255,255,255,.61);
          font-size: 8.5px;
          line-height: 1.4;
        }
        .economic {
          display: grid;
          grid-template-columns: .75fr 1.25fr;
          gap: 18px;
          margin-top: auto;
          padding: 22px;
          background: var(--wine);
          color: white;
        }
        .economic h3 { margin-bottom: 8px; font-size: 22px; }
        .economic p { color: rgba(255,255,255,.61); font-size: 9px; line-height: 1.5; }
        .economic-items { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
        .economic-item {
          padding-left: 11px;
          border-left: 2px solid #d8b37d;
        }
        .economic-item strong { display: block; color: #ecd7b9; font-size: 9px; text-transform: uppercase; }
        .economic-item span { color: rgba(255,255,255,.65); font-size: 8px; line-height: 1.35; }
        .plans {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 14px;
        }
        .plan {
          display: flex;
          min-height: 430px;
          flex-direction: column;
          padding: 20px 16px;
          background: #fffaf3;
          border: 1px solid var(--line);
        }
        .plan.featured { background: var(--green); color: white; border-color: var(--green); }
        .plan-label { color: var(--wine); font-size: 8px; letter-spacing: .12em; text-transform: uppercase; }
        .featured .plan-label { color: #dfbf91; }
        .plan h3 { margin: 26px 0 10px; font-size: 26px; }
        .plan > p:not(.plan-label) { min-height: 68px; color: var(--muted); font-size: 10px; line-height: 1.5; }
        .featured > p:not(.plan-label) { color: rgba(255,255,255,.62); }
        .plan .clean-list { padding-top: 17px; border-top: 1px solid var(--line); }
        .featured .clean-list { border-color: rgba(255,255,255,.17); }
        .plan.featured .clean-list li { color: rgba(255,255,255,.78); }
        .plan.featured .clean-list li::before { color: #dfbf91; }
        .plan-foot {
          margin-top: auto;
          padding-top: 14px;
          border-top: 1px solid var(--line);
          color: var(--muted);
          font-size: 8px;
          line-height: 1.42;
        }
        .featured .plan-foot { border-color: rgba(255,255,255,.17); color: rgba(255,255,255,.48); }
        .script {
          padding: 24px 26px;
          background: var(--green);
          color: white;
        }
        .script blockquote {
          margin: 0;
          font: 500 22px/1.42 'Playfair Display', Georgia, serif;
        }
        .script-label {
          margin-bottom: 13px;
          color: #dfbf91;
          font-size: 8.5px;
          letter-spacing: .14em;
          text-transform: uppercase;
        }
        .demo-steps {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0 24px;
          margin-top: 23px;
        }
        .demo-step {
          display: grid;
          grid-template-columns: 24px 1fr;
          gap: 10px;
          padding: 10px 0;
          border-top: 1px solid var(--line);
        }
        .demo-step b { color: var(--gold); font-size: 10px; }
        .demo-step span { color: var(--muted); font-size: 10px; line-height: 1.4; }
        .closing {
          margin-top: auto;
          padding: 22px 25px;
          background: #eadfce;
        }
        .closing h3 { margin-bottom: 7px; font-size: 23px; }
        .closing p { margin: 0; color: var(--muted); font-size: 10px; line-height: 1.5; }
        @media print {
          @page { size: A4; margin: 0; }
          html, body, .guide { background: white; }
          .guide { padding: 0; }
          .download { display: none !important; }
          .guide-page {
            height: 296mm;
            margin: 0;
            box-shadow: none;
            break-after: auto;
            page-break-after: auto;
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
        @media (max-width: 850px) {
          .guide { padding-top: 70px; overflow-x: auto; }
          .guide-page { margin-left: 14px; margin-right: 14px; }
        }
      `}</style>

      {paginaVisible === null && (
        <button className="download" onClick={handleDownload} disabled={generando}>
          {generando ? 'Generando…' : 'Descargar PDF'}
        </button>
      )}

      {visible(1) && (
        <section className="guide-page cover">
          <div className="inner">
            <Folio page={1} dark />
            <div className="cover-main">
              <p className="cover-kicker">Guía de producto · 2026</p>
              <h1>
                Entender<br />Carta Viva.<br />
                <em>Y saber explicarla.</em>
              </h1>
              <p className="cover-lead">
                Una guía para conocer cómo Carta Viva conecta cocina, cliente,
                sala, bodega y acompañamiento profesional.
              </p>
            </div>
            <div className="cover-foot">
              <span>Carta · Sala · Bodega · Decisión</span>
              <img className="cover-mark" src="/brand/carta-viva/isotipo.png" alt="" />
            </div>
          </div>
        </section>
      )}

      {visible(2) && (
        <section className="guide-page">
          <div className="inner">
            <Folio page={2} />
            <header className="section-head">
              <Tag>La idea principal</Tag>
              <h2 className="title">No es una pantalla. Es un circuito de trabajo.</h2>
              <p className="lead">
                Carta Viva conserva la relación entre lo que el restaurante cocina,
                lo que recomienda, lo que sucede en mesa y las decisiones que toma después.
              </p>
            </header>
            <div className="circuit">
              {[
                ['01', 'Cocina', 'Los platos reales aportan el contexto gastronómico.'],
                ['02', 'Carta', 'Cada vino tiene información, precio y una razón para estar.'],
                ['03', 'Sala', 'El equipo recomienda, compara y registra señales.'],
                ['04', 'Bodega', 'Stock, margen y actividad se convierten en decisiones.'],
              ].map(([n, title, text]) => (
                <article className="circuit-card" key={n}>
                  <span className="circuit-n">{n}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
            <div className="statement">
              <p>La verdadera diferencia aparece cuando las cuatro partes trabajan juntas.</p>
              <small>
                El cliente elige mejor. Sala recomienda con más criterio. El responsable conserva
                información útil. La carta puede evolucionar con memoria.
              </small>
            </div>
          </div>
        </section>
      )}

      {visible(3) && (
        <section className="guide-page">
          <div className="inner">
            <Folio page={3} />
            <header className="section-head">
              <Tag>El ritmo de uso</Tag>
              <h2 className="title">Antes, durante y después del servicio.</h2>
              <p className="lead">
                La app se entiende mejor siguiendo la jornada del restaurante que recorriendo sus menús.
              </p>
            </header>
            <div className="timeline">
              {momentos.map(([title, text], index) => (
                <article className="moment" key={title}>
                  <h3>{title}</h3>
                  <div>
                    <p>{text}</p>
                    <div className="chips">
                      {(index === 0
                        ? ['Briefing', 'Objetivo', 'Stock a vigilar']
                        : index === 1
                          ? ['Cliente', 'Camarero', 'Alternativas', 'Feedback']
                          : index === 2
                            ? ['Cierre', 'Movimientos', 'Dudas', 'Agotados']
                            : ['Margen', 'Rentabilidad', 'Inventario', 'Propuestas']
                      ).map(item => <span className="chip" key={item}>{item}</span>)}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="flow-note">
              Carta Viva no pretende que el restaurante pase más tiempo delante de una pantalla.
              Busca que cada momento deje la información mínima necesaria para decidir mejor después.
            </div>
          </div>
        </section>
      )}

      {visible(4) && (
        <section className="guide-page">
          <div className="inner">
            <Folio page={4} />
            <header className="section-head">
              <Tag>Experiencia de cliente</Tag>
              <h2 className="title">Una carta que ayuda a elegir, no solo a leer.</h2>
              <p className="lead">
                El cliente entra por QR y explora una carta adaptada a la identidad,
                la cocina y las referencias disponibles del restaurante.
              </p>
            </header>
            <div className="split">
              <article className="panel">
                <h3>Explorar</h3>
                <p>La información está ordenada para una consulta rápida desde la mesa.</p>
                <ul className="clean-list">
                  <li>Búsqueda, filtros y fichas ampliadas</li>
                  <li>Precio de copa y botella</li>
                  <li>Vinos por copa y selección Coravin</li>
                  <li>Selección de la casa y del consultor</li>
                  <li>Comparador de referencias</li>
                  <li>Español e inglés</li>
                </ul>
              </article>
              <article className="panel dark">
                <h3>Decidir</h3>
                <p>La recomendación parte de lo que la mesa va a comer y de cómo quiere beber.</p>
                <ul className="clean-list">
                  <li>Un vino para uno o varios platos</li>
                  <li>Una botella para compartir</li>
                  <li>Una copa diferente para cada plato</li>
                  <li>Sucesión de copas</li>
                  <li>Preferencias de estilo y presupuesto</li>
                  <li>Platos adecuados para un vino concreto</li>
                </ul>
              </article>
            </div>
            <div className="flow-note">
              La carta recomienda únicamente referencias del restaurante y respeta disponibilidad,
              precio y venta por copa cuando esos datos están informados.
            </div>
          </div>
        </section>
      )}

      {visible(5) && (
        <section className="guide-page">
          <div className="inner">
            <Folio page={5} />
            <header className="section-head">
              <Tag>Herramienta de sala</Tag>
              <h2 className="title">El mismo plato puede admitir objetivos distintos.</h2>
              <p className="lead">
                El camarero recibe opciones compatibles, argumentos, precio, stock y alternativas.
                Después puede orientar la recomendación según el servicio.
              </p>
            </header>
            <div className="objective-grid">
              {[
                ['Mejor maridaje', 'Prioriza el encaje gastronómico.'],
                ['Por copas', 'Muestra solo referencias disponibles por copa.'],
                ['Sucesión', 'Construye un recorrido copa a copa.'],
                ['Subir ticket', 'Busca una opción superior que siga siendo coherente.'],
                ['Rotar stock', 'Da visibilidad a botellas con unidades suficientes.'],
                ['Vino local', 'Prioriza referencias vinculadas al territorio.'],
              ].map(([title, text]) => (
                <div className="objective" key={title}>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              ))}
            </div>
            <div className="split">
              <article className="panel">
                <h3>Antes de abrir</h3>
                <ul className="clean-list">
                  <li>Briefing de sala</li>
                  <li>Referencias que interesa impulsar</li>
                  <li>Vinos que requieren revisión</li>
                  <li>Argumentos vinculados a platos</li>
                  <li>Resumen copiable o compartible</li>
                </ul>
              </article>
              <article className="panel">
                <h3>Durante la mesa</h3>
                <ul className="clean-list">
                  <li>Recomendación para plato o mesa completa</li>
                  <li>Comparación de vinos</li>
                  <li>Últimas botellas y falta de stock</li>
                  <li>Alternativas compatibles</li>
                  <li>Ficha de venta en lenguaje natural</li>
                </ul>
              </article>
            </div>
            <div className="signal-row">
              {['Se vendió', 'Pidió otro', 'No convenció', 'No quedaba', 'Agotado'].map(item => (
                <div className="signal" key={item}>{item}</div>
              ))}
            </div>
          </div>
        </section>
      )}

      {visible(6) && (
        <section className="guide-page">
          <div className="inner">
            <Folio page={6} />
            <header className="section-head">
              <Tag>Después del servicio</Tag>
              <h2 className="title">Cerrar la noche y ordenar la bodega.</h2>
              <p className="lead">
                Las señales de sala se convierten en una lista breve de decisiones.
                El objetivo es no perder información sin crear otra tarea interminable.
              </p>
            </header>
            <div className="weekly">
              <article className="weekly-card">
                <h3>Cierre guiado</h3>
                <p>Resolver lo ocurrido durante el turno y dejar la carta lista para el siguiente servicio.</p>
                <ul className="clean-list">
                  <li>Aplicar falta de stock</li>
                  <li>Descontar ventas marcadas</li>
                  <li>Revisar dudas y rechazos</li>
                  <li>Encontrar sustitutos</li>
                  <li>Detectar vinos con tracción</li>
                </ul>
              </article>
              <article className="weekly-card">
                <h3>Bodega y pedido</h3>
                <p>Reunir en una sola vista stock, coste, precio, margen, proveedor y reposición.</p>
                <ul className="clean-list">
                  <li>Pedido sugerido por mínimos</li>
                  <li>Agrupación por proveedor</li>
                  <li>Copia y envío por WhatsApp</li>
                  <li>Stock alto sin salida</li>
                  <li>Libro de movimientos</li>
                </ul>
              </article>
              <article className="weekly-card">
                <h3>Inventario inteligente</h3>
                <p>Contar primero las referencias donde un descuadre puede tener mayor impacto.</p>
                <div className="number-line">
                  <span>Valor</span><span>Riesgo</span><span>Movimiento</span>
                </div>
              </article>
              <article className="weekly-card">
                <h3>Precios y márgenes</h3>
                <p>Simular PVP de botella y copa, revisar rentabilidad y aplicar cambios solo después de confirmarlos.</p>
                <div className="number-line">
                  <span>Coste</span><span>Margen</span><span>PVP</span>
                </div>
              </article>
            </div>
          </div>
        </section>
      )}

      {visible(7) && (
        <section className="guide-page">
          <div className="inner">
            <Folio page={7} />
            <header className="section-head">
              <Tag>Lectura del negocio</Tag>
              <h2 className="title">Qué vino proteger, impulsar, renegociar o revisar.</h2>
              <p className="lead">
                Cuando existen costes, precios y suficientes señales de actividad,
                Carta Viva ordena la conversación sobre rendimiento.
              </p>
            </header>
            <div className="matrix">
              <article className="matrix-card">
                <h3>Estrella</h3>
                <p>Se vende y deja margen. Conviene protegerla, mantener stock y darle visibilidad.</p>
              </article>
              <article className="matrix-card">
                <h3>Joya oculta</h3>
                <p>Es rentable, pero tiene poca salida. Necesita argumento, posición o formación.</p>
              </article>
              <article className="matrix-card">
                <h3>Caballo de batalla</h3>
                <p>Se vende, pero deja poco margen. Conviene revisar coste, PVP o proveedor.</p>
              </article>
              <article className="matrix-card">
                <h3>Revisar</h3>
                <p>Poca venta y poco margen. Puede requerir activación, sustitución o salida.</p>
              </article>
            </div>
            <div className="data-strip">
              <div className="data-box">
                <strong>Desde el inicio</strong>
                <span>Carta, QR, recomendación, gestión y simulación.</span>
              </div>
              <div className="data-box">
                <strong>Con datos económicos</strong>
                <span>Margen, valor de bodega, pedido y oportunidad económica.</span>
              </div>
              <div className="data-box">
                <strong>Con actividad real</strong>
                <span>Popularidad, tracción, dudas, rotación y evolución.</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {visible(8) && (
        <section className="guide-page">
          <div className="inner">
            <Folio page={8} />
            <header className="section-head">
              <Tag>Acompañamiento profesional</Tag>
              <h2 className="title">La plataforma detecta. El criterio decide.</h2>
              <p className="lead">
                Carta Viva amplía la capacidad de análisis, conserva histórico y ayuda a priorizar.
                Las decisiones relevantes siguen necesitando contexto profesional.
              </p>
            </header>
            <div className="consultor-flow">
              {[
                ['01', 'Radar', 'Localiza restaurantes y áreas que requieren atención.'],
                ['02', 'Diagnóstico', 'Ordena margen, inventario, carta, copas y calidad del dato.'],
                ['03', 'Propuesta', 'Convierte hallazgos en acciones, referencias y prioridades.'],
                ['04', 'Seguimiento', 'Compara periodos y comprueba qué ha cambiado.'],
              ].map(([n, title, text]) => (
                <article className="consultor-step" key={n}>
                  <span>{n}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
            <div className="split">
              <article className="panel">
                <h3>Herramientas</h3>
                <ul className="clean-list">
                  <li>Alertas y pipeline de acciones</li>
                  <li>Informes por restaurante</li>
                  <li>Propuestas de precio, carta o proveedor</li>
                  <li>Catálogo común de distribuidores</li>
                  <li>Simulador de altas y bajas</li>
                </ul>
              </article>
              <article className="panel">
                <h3>Decisiones</h3>
                <ul className="clean-list">
                  <li>Qué referencia debe protegerse</li>
                  <li>Qué vino conviene activar por copa</li>
                  <li>Qué stock necesita un plan de salida</li>
                  <li>Qué proveedor o PVP revisar</li>
                  <li>Qué cambio encaja con la identidad del local</li>
                </ul>
              </article>
            </div>
            <div className="economic">
              <div>
                <h3>Oportunidad económica</h3>
                <p>Una estimación prudente para priorizar, no una promesa automática.</p>
              </div>
              <div className="economic-items">
                {[
                  ['Margen', 'Diferencia potencial hasta una rentabilidad saludable.'],
                  ['Capital', 'Dinero inmovilizado que podría liberarse.'],
                  ['Copas', 'Beneficio potencial de candidatos activables.'],
                  ['Confianza', 'Solidez de los datos y de la hipótesis.'],
                ].map(([title, text]) => (
                  <div className="economic-item" key={title}>
                    <strong>{title}</strong><span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {visible(9) && (
        <section className="guide-page">
          <div className="inner">
            <Folio page={9} />
            <header className="section-head">
              <Tag>Tres formas de trabajar</Tag>
              <h2 className="title">La profundidad cambia. El criterio de producto es el mismo.</h2>
              <p className="lead">Los planes se diferencian por el nivel de operación y acompañamiento, no por una lista interminable de botones.</p>
            </header>
            <div className="plans">
              {planData.map(plan => (
                <article className={`plan ${plan.featured ? 'featured' : ''}`} key={plan.name}>
                  <p className="plan-label">{plan.label}</p>
                  <h3>{plan.name}</h3>
                  <p>{plan.text}</p>
                  <ul className="clean-list">
                    {plan.items.map(item => <li key={item}>{item}</li>)}
                  </ul>
                  <div className="plan-foot">
                    {plan.name === 'Acompañado'
                      ? 'El alcance se define después de conocer la carta, la cocina y los objetivos.'
                      : 'El nivel adecuado depende de cómo trabaja hoy el restaurante.'}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {visible(10) && (
        <section className="guide-page">
          <div className="inner">
            <Folio page={10} />
            <header className="section-head">
              <Tag>Cómo explicarla</Tag>
              <h2 className="title">Empieza por una mesa. Termina en una decisión.</h2>
              <p className="lead">
                No conviene presentar Carta Viva recorriendo menús. Una demostración funciona mejor cuando sigue una historia real.
              </p>
            </header>
            <div className="script">
              <p className="script-label">Carta Viva en 30 segundos</p>
              <blockquote>
                Carta Viva conecta la cocina, la carta, la sala y la bodega. El cliente encuentra mejor el vino;
                el equipo recibe argumentos y alternativas; y el responsable conserva información para decidir
                qué referencias impulsar, revisar o sustituir.
              </blockquote>
            </div>
            <div className="demo-steps">
              {[
                'Enseña la carta pública.',
                'Selecciona uno o varios platos.',
                'Muestra una recomendación.',
                'Abre el modo camarero.',
                'Cambia el objetivo comercial.',
                'Registra una señal de sala.',
                'Enseña el cierre de servicio.',
                'Muestra bodega y pedido.',
                'Abre la rentabilidad de carta.',
                'Explica el acompañamiento.',
              ].map((text, index) => (
                <div className="demo-step" key={text}>
                  <b>{String(index + 1).padStart(2, '0')}</b>
                  <span>{text}</span>
                </div>
              ))}
            </div>
            <div className="closing">
              <h3>No se trata de tener más vinos.</h3>
              <p>
                Se trata de saber por qué está cada uno, cómo se recomienda,
                qué papel cumple en la cocina y qué información deja para la siguiente decisión.
              </p>
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
