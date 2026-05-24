'use client'

import { useState } from 'react'

async function descargarPDF() {
  const html2canvas = (await import('html2canvas')).default
  const jsPDF = (await import('jspdf')).default

  const paginas = document.querySelectorAll('.page')
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

  for (let i = 0; i < paginas.length; i++) {
    const canvas = await html2canvas(paginas[i], {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (doc) => {
        // Ocultar el botón de descarga en la captura
        const btn = doc.querySelector('.download-bar')
        if (btn) btn.style.display = 'none'
      }
    })

    const imgData = canvas.toDataURL('image/jpeg', 0.97)
    if (i > 0) pdf.addPage()
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297)
  }

  pdf.save('carta-viva-dossier-2026.pdf')
}

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
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: 'DM Sans', system-ui, sans-serif;
          background: #e8e0d0;
          color: #1c1410;
          -webkit-font-smoothing: antialiased;
        }

        .print-btn {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 999;
          background: #2c1810;
          color: #e8d9c0;
          border: none;
          padding: 10px 22px;
          font-size: 12px;
          font-family: 'DM Sans', sans-serif;
          font-weight: 500;
          letter-spacing: 0.08em;
          cursor: pointer;
          text-transform: uppercase;
        }

        .page {
          width: 210mm;
          margin: 20px auto;
          background: #fff;
          box-shadow: 0 4px 32px rgba(0,0,0,0.15);
          overflow: hidden;
          position: relative;
        }

        /* ══ PORTADA ══════════════════════════════════════════ */

        .cover {
          height: 297mm;
          background: #1c1008;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        .cover-texture {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 90% 50% at 60% 30%, rgba(139,80,40,0.22), transparent 60%),
            radial-gradient(ellipse 40% 60% at 5% 90%, rgba(191,160,110,0.1), transparent);
        }

        .cover-stripe {
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 5px;
          background: #8b3a2a;
        }

        .cover-top {
          position: relative;
          z-index: 1;
          padding: 48px 52px 0 56px;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .cover-logo-row {
          display: flex;
          align-items: baseline;
          gap: 16px;
        }

        .cover-logo-name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 20px;
          font-weight: 300;
          color: #c8a87a;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .cover-logo-by {
          font-size: 11px;
          color: rgba(255,255,255,0.22);
          letter-spacing: 0.08em;
        }

        .cover-body {
          padding-bottom: 56px;
        }

        .cover-label {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #8b3a2a;
          margin-bottom: 22px;
        }

        .cover-h1 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 68px;
          font-weight: 300;
          line-height: 0.95;
          color: #f0e8d8;
          margin-bottom: 32px;
          letter-spacing: -0.01em;
        }

        .cover-h1 em {
          font-style: italic;
          color: #c8a87a;
        }

        .cover-divider {
          width: 48px;
          height: 1px;
          background: #8b3a2a;
          margin-bottom: 22px;
        }

        .cover-tagline {
          font-size: 14px;
          font-weight: 300;
          line-height: 1.75;
          color: rgba(240,232,216,0.55);
          max-width: 400px;
        }

        .cover-bottom {
          position: relative;
          z-index: 1;
          padding: 22px 52px 22px 56px;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .cover-url {
          font-size: 11px;
          color: rgba(255,255,255,0.18);
          letter-spacing: 0.1em;
        }

        .cover-year {
          font-size: 10px;
          color: rgba(255,255,255,0.12);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        /* ══ PÁGINA INTERIOR ══════════════════════════════════ */

        .inner {
          min-height: 297mm;
          padding: 48px 52px 48px 56px;
          display: flex;
          flex-direction: column;
          gap: 44px;
          position: relative;
        }

        .inner-stripe {
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 5px;
          background: #8b3a2a;
        }

        .page-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 20px;
          border-bottom: 1px solid #ede5d8;
        }

        .page-nav-brand {
          font-family: 'Cormorant Garamond', serif;
          font-size: 14px;
          font-weight: 300;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #8b3a2a;
        }

        .page-nav-num {
          font-size: 10px;
          color: #c8b89a;
          letter-spacing: 0.14em;
        }

        /* ── Bloque de sección ── */
        .s-label {
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #8b3a2a;
          margin-bottom: 10px;
        }

        .s-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 34px;
          font-weight: 300;
          line-height: 1.15;
          color: #1c1410;
          margin-bottom: 10px;
        }

        .s-sub {
          font-size: 13px;
          font-weight: 300;
          line-height: 1.75;
          color: #7a6a58;
          max-width: 500px;
        }

        /* ── Problemas ── */
        .problems {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: #ede5d8;
          border: 1px solid #ede5d8;
          margin-top: 6px;
        }

        .prob {
          background: #faf7f2;
          padding: 20px 22px;
        }

        .prob-num {
          font-family: 'Cormorant Garamond', serif;
          font-size: 28px;
          font-weight: 300;
          color: #d4c0a0;
          line-height: 1;
          margin-bottom: 10px;
        }

        .prob-title {
          font-size: 12px;
          font-weight: 500;
          color: #2c1810;
          margin-bottom: 5px;
          line-height: 1.4;
        }

        .prob-desc {
          font-size: 11px;
          font-weight: 300;
          color: #9a8878;
          line-height: 1.65;
        }

        /* ── Features ── */
        .features {
          display: flex;
          flex-direction: column;
          gap: 0;
          margin-top: 6px;
        }

        .feat {
          display: grid;
          grid-template-columns: 28px 1fr;
          gap: 14px;
          padding: 14px 0;
          border-bottom: 1px solid #f0ebe0;
          align-items: flex-start;
        }

        .feat:last-child { border-bottom: none; }

        .feat-n {
          font-family: 'Cormorant Garamond', serif;
          font-size: 18px;
          font-weight: 300;
          color: #c8a87a;
          padding-top: 1px;
        }

        .feat-title {
          font-size: 12.5px;
          font-weight: 500;
          color: #1c1410;
          margin-bottom: 3px;
          line-height: 1.3;
        }

        .feat-desc {
          font-size: 11.5px;
          font-weight: 300;
          color: #7a6a58;
          line-height: 1.65;
        }

        /* ── Planes ── */
        .plans {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 0;
          border: 1px solid #ede5d8;
          background: #ede5d8;
          margin-top: 6px;
        }

        .plan {
          background: #faf7f2;
          display: flex;
          flex-direction: column;
        }

        .plan.featured {
          background: #1c1008;
        }

        .plan-top {
          padding: 22px 20px 16px;
          border-bottom: 1px solid #ede5d8;
        }

        .plan.featured .plan-top {
          border-bottom-color: rgba(255,255,255,0.08);
        }

        .plan-tag {
          font-size: 8.5px;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #8b3a2a;
          margin-bottom: 10px;
        }

        .plan.featured .plan-tag { color: #c8a87a; }

        .plan-name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 24px;
          font-weight: 300;
          color: #1c1410;
          margin-bottom: 10px;
          line-height: 1;
        }

        .plan.featured .plan-name { color: #f0e8d8; }

        .plan-price-real {
          font-size: 26px;
          font-weight: 500;
          color: #1c1410;
          line-height: 1;
        }

        .plan.featured .plan-price-real { color: #c8a87a; }

        .plan-price-real span {
          font-size: 12px;
          font-weight: 300;
          color: #aaa;
        }

        .plan.featured .plan-price-real span { color: rgba(255,255,255,0.35); }

        .plan-founder {
          margin-top: 6px;
          font-size: 10px;
          font-weight: 300;
          color: #9a8878;
          line-height: 1.5;
        }

        .plan.featured .plan-founder { color: rgba(255,255,255,0.35); }

        .plan-founder s {
          color: #c8a87a;
          font-weight: 500;
        }

        .plan.featured .plan-founder s { color: #c8a87a; }

        .plan-body {
          padding: 14px 20px 20px;
          flex: 1;
        }

        .plan-limit {
          font-size: 10px;
          font-weight: 300;
          color: #b0a090;
          margin-bottom: 10px;
          padding-bottom: 10px;
          border-bottom: 1px solid #ede5d8;
        }

        .plan.featured .plan-limit {
          color: rgba(255,255,255,0.25);
          border-bottom-color: rgba(255,255,255,0.08);
        }

        .plan-feats {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .plan-feats li {
          font-size: 11px;
          font-weight: 300;
          color: #5a4a3a;
          display: flex;
          gap: 6px;
          line-height: 1.45;
        }

        .plan.featured .plan-feats li { color: rgba(240,232,216,0.65); }

        .plan-feats li::before {
          content: '—';
          color: #c8a87a;
          flex-shrink: 0;
          font-weight: 300;
        }

        /* ── Nota fundador ── */
        .founder-note {
          background: #f5f0e6;
          border-left: 3px solid #c8a87a;
          padding: 14px 18px;
          margin-top: 14px;
        }

        .founder-note p {
          font-size: 11px;
          font-weight: 300;
          color: #5a4a3a;
          line-height: 1.65;
        }

        .founder-note strong {
          font-weight: 500;
          color: #2c1810;
        }

        /* ── CTA ── */
        .cta {
          background: #1c1008;
          padding: 32px 36px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 28px;
          align-items: center;
        }

        .cta-left {}

        .cta-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 24px;
          font-weight: 300;
          color: #f0e8d8;
          line-height: 1.2;
          margin-bottom: 6px;
        }

        .cta-desc {
          font-size: 12px;
          font-weight: 300;
          color: rgba(240,232,216,0.45);
          line-height: 1.65;
          max-width: 320px;
        }

        .cta-right {
          text-align: right;
          flex-shrink: 0;
        }

        .cta-contact-label {
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.2);
          margin-bottom: 7px;
        }

        .cta-email {
          font-size: 12px;
          color: #c8a87a;
          font-weight: 400;
          margin-bottom: 4px;
        }

        .cta-ig {
          font-size: 11px;
          color: rgba(255,255,255,0.25);
        }

        .cta-web {
          font-size: 10px;
          color: rgba(255,255,255,0.15);
          margin-top: 4px;
        }

        @media print {
          .print-btn { display: none !important; }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          body { background: #fff; }

          .page {
            width: 100%;
            margin: 0;
            box-shadow: none;
            page-break-after: always;
            break-after: page;
          }
          .page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .cover { height: 100vh; }
          .inner { min-height: 100vh; }
        }

        @page { size: A4; margin: 0; }
      `}</style>

      <div className="download-bar" style={{ position: 'fixed', top: 20, right: 20, zIndex: 999 }}>
        <button
          style={{
            background: generando ? '#5a3020' : '#2c1810',
            color: '#e8d9c0',
            border: 'none',
            padding: '11px 24px',
            fontSize: 12,
            fontFamily: 'DM Sans, sans-serif',
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: generando ? 'wait' : 'pointer',
            boxShadow: '0 2px 16px rgba(0,0,0,0.25)',
            minWidth: 160,
          }}
          onClick={handleDescargar}
          disabled={generando}
        >
          {generando ? 'Generando PDF…' : '↓ Descargar PDF'}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PORTADA                                                    */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="page">
        <div className="cover">
          <div className="cover-texture" />
          <div className="cover-stripe" />

          <div className="cover-top">
            <div className="cover-logo-row">
              <span className="cover-logo-name">Carta Viva</span>
              <span className="cover-logo-by">por Cata con Juanjo</span>
            </div>

            <div className="cover-body">
              <p className="cover-label">Herramienta digital para hostelería</p>
              <h1 className="cover-h1">
                Tu carta<br />
                de vinos,<br />
                <em>siempre viva.</em>
              </h1>
              <div className="cover-divider" />
              <p className="cover-tagline">
                Para el bar y restaurante que no tiene sumiller
                —ni lo necesita— pero sí quiere que su vino
                se venda bien, su bodega esté controlada
                y su equipo recomiende con convicción.
              </p>
            </div>
          </div>

          <div className="cover-bottom">
            <span className="cover-url">cataconjuanjo.com</span>
            <span className="cover-year">Dossier comercial · 2026</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PÁGINA 2 — Problemas + Features                           */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="page">
        <div className="inner">
          <div className="inner-stripe" />

          <div className="page-nav">
            <span className="page-nav-brand">Carta Viva</span>
            <span className="page-nav-num">02 / 03</span>
          </div>

          {/* Problemas */}
          <div>
            <p className="s-label">El problema</p>
            <h2 className="s-title">Lo que pasa cada día<br />en la mayoría de bares</h2>
            <p className="s-sub">
              Mucho vino en la carta, poco tiempo para mantenerla.
              Camareros sin argumentos y una bodega que nadie controla del todo.
            </p>

            <div className="problems">
              <div className="prob">
                <p className="prob-num">01</p>
                <p className="prob-title">La carta impresa miente</p>
                <p className="prob-desc">Cambia una añada, se acaba un vino, sube un precio — y nadie actualiza nada. El cliente pregunta por un vino que ya no hay.</p>
              </div>
              <div className="prob">
                <p className="prob-num">02</p>
                <p className="prob-title">El camarero recomienda sin convicción</p>
                <p className="prob-desc">Sin sumiller y sin herramientas, el equipo dice "este está bien" sin saber por qué. El cliente lo nota y pide agua.</p>
              </div>
              <div className="prob">
                <p className="prob-num">03</p>
                <p className="prob-title">La bodega va por libre</p>
                <p className="prob-desc">No sabes qué margen tiene cada vino, qué se vende de verdad ni qué hace falta pedir. Te enteras cuando ya se ha acabado.</p>
              </div>
              <div className="prob">
                <p className="prob-num">04</p>
                <p className="prob-title">Cambiar la carta cuesta dinero y tiempo</p>
                <p className="prob-desc">Cada actualización implica rediseñar, imprimir y distribuir. Con lo que cambia el vino, es un ciclo que no termina nunca.</p>
              </div>
            </div>
          </div>

          {/* Features */}
          <div>
            <p className="s-label">La solución</p>
            <h2 className="s-title">Lo que Carta Viva<br />hace por tu negocio</h2>

            <div className="features">
              <div className="feat">
                <span className="feat-n">1</span>
                <div>
                  <p className="feat-title">Carta siempre actualizada — sin reimprimir nada</p>
                  <p className="feat-desc">Cambia una añada, marca un vino como agotado o ajusta un precio en segundos. El cliente escanea el QR y ve la carta real de hoy, no la de hace seis meses.</p>
                </div>
              </div>
              <div className="feat">
                <span className="feat-n">2</span>
                <div>
                  <p className="feat-title">Tu equipo recomienda con argumentos — desde la PDA</p>
                  <p className="feat-desc">El modo camarero lleva el asistente de maridaje en el bolsillo. El camarero elige el plato del cliente y recibe al momento qué vino recomendar y por qué. Sin improvisación, sin quedar mal.</p>
                </div>
              </div>
              <div className="feat">
                <span className="feat-n">3</span>
                <div>
                  <p className="feat-title">El cliente encuentra su vino solo</p>
                  <p className="feat-desc">Desde su móvil, el cliente puede pedir maridaje para lo que va a comer. El asistente le recomienda con precio incluido. Menos preguntas al camarero, más ventas de vino.</p>
                </div>
              </div>
              <div className="feat">
                <span className="feat-n">4</span>
                <div>
                  <p className="feat-title">Importa tu carta desde PDF en dos minutos</p>
                  <p className="feat-desc">Sube la carta que tienes ahora — en PDF, Excel o foto — y la convierte en digital automáticamente. No empiezas de cero, no tecleas referencia por referencia.</p>
                </div>
              </div>
              <div className="feat">
                <span className="feat-n">5</span>
                <div>
                  <p className="feat-title">Bodega, margen y pedidos bajo control</p>
                  <p className="feat-desc">De un vistazo: qué tienes, cuánto vale, qué margen deja cada vino y qué hace falta pedir. La lista de pedido se genera sola — la copias y la mandas al proveedor por WhatsApp.</p>
                </div>
              </div>
              <div className="feat">
                <span className="feat-n">6</span>
                <div>
                  <p className="feat-title">Cierre de servicio en tres minutos</p>
                  <p className="feat-desc">Al terminar el turno, el sistema recoge las señales de sala: qué se vendió, qué se agotó, qué no convenció. El stock se actualiza solo. La bodega siempre refleja la realidad.</p>
                </div>
              </div>
              <div className="feat">
                <span className="feat-n">7</span>
                <div>
                  <p className="feat-title">Tu marca, tu diseño — no una plantilla genérica</p>
                  <p className="feat-desc">Elige tus colores, tu tipografía y sube tu logo. La carta digital parece tuya, no de un software. El QR puede llevar también a tu carta de comida, reservas o cualquier enlace.</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PÁGINA 3 — Planes + CTA                                   */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="page">
        <div className="inner">
          <div className="inner-stripe" />

          <div className="page-nav">
            <span className="page-nav-brand">Carta Viva</span>
            <span className="page-nav-num">03 / 03</span>
          </div>

          <div>
            <p className="s-label">Suscripción mensual · Sin permanencia</p>
            <h2 className="s-title">Elige el plan<br />de tu restaurante</h2>
            <p className="s-sub">
              Sin instalación. Sin contrato. Funciona desde el primer día.
              Los 14 primeros días son gratis para que lo pruebes con tu equipo.
            </p>

            <div className="plans">

              {/* Básico */}
              <div className="plan">
                <div className="plan-top">
                  <p className="plan-tag">Plan Básico</p>
                  <p className="plan-name">Básico</p>
                  <p className="plan-price-real">59€ <span>/ mes</span></p>
                  <p className="plan-founder">Precio fundador: 39€/mes</p>
                </div>
                <div className="plan-body">
                  <p className="plan-limit">Hasta 100 referencias de vino</p>
                  <ul className="plan-feats">
                    <li>Carta digital con QR siempre actualizada</li>
                    <li>Maridaje para el cliente desde su móvil</li>
                    <li>Hub de enlaces (carta, reservas, redes)</li>
                    <li>Personalización de marca</li>
                    <li>Notas de cata generadas automáticamente</li>
                  </ul>
                </div>
              </div>

              {/* Sala */}
              <div className="plan featured">
                <div className="plan-top">
                  <p className="plan-tag">Más popular</p>
                  <p className="plan-name">Sala</p>
                  <p className="plan-price-real">99€ <span>/ mes</span></p>
                  <p className="plan-founder">Precio fundador: 79€/mes</p>
                </div>
                <div className="plan-body">
                  <p className="plan-limit">Hasta 200 referencias de vino</p>
                  <ul className="plan-feats">
                    <li>Todo lo del plan Básico</li>
                    <li>Modo camarero con asistente IA</li>
                    <li>Importación de carta desde PDF</li>
                    <li>Control de bodega e inventario</li>
                    <li>Cierre de servicio automatizado</li>
                    <li>Estadísticas de sala y escaneos</li>
                    <li>Gestión de carta de comidas</li>
                  </ul>
                </div>
              </div>

              {/* Acompañado */}
              <div className="plan">
                <div className="plan-top">
                  <p className="plan-tag">Plan Premium</p>
                  <p className="plan-name">Acompañado</p>
                  <p className="plan-price-real">199€ <span>/ mes</span></p>
                  <p className="plan-founder">Precio fundador: 149€/mes</p>
                </div>
                <div className="plan-body">
                  <p className="plan-limit">Más de 200 referencias de vino</p>
                  <ul className="plan-feats">
                    <li>Todo lo del plan Sala</li>
                    <li>Informes de bodega y rotación</li>
                    <li>Gestión de proveedores</li>
                    <li>Propuestas de nuevas referencias</li>
                    <li>Consultoría directa con Juanjo</li>
                    <li>Soporte prioritario</li>
                  </ul>
                </div>
              </div>

            </div>

            {/* Nota precios fundador */}
            <div className="founder-note">
              <p>
                <strong>Precios fundador para los primeros 5 restaurantes.</strong>{' '}
                Los primeros cinco restaurantes que se sumen mantendrán el precio fundador
                de por vida, sin que ninguna subida futura les afecte. Es una forma de
                reconocer a quienes confían primero.
              </p>
              <p style={{ marginTop: 10 }}>
                <strong>Carta Viva es una app viva.</strong>{' '}
                Está en desarrollo activo y evoluciona con cada restaurante que se suma.
                Las necesidades reales de cada negocio moldean lo que viene después.
                Si tienes una idea o una necesidad concreta, la escuchamos — y probablemente
                acabe siendo una funcionalidad para todos.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="cta">
            <div className="cta-left">
              <h3 className="cta-title">¿Lo probamos con<br />tu restaurante?</h3>
              <p className="cta-desc">
                14 días gratis, sin tarjeta ni contrato. Te lo configuramos nosotros
                y en menos de una hora tu carta ya está viva.
              </p>
            </div>
            <div className="cta-right">
              <p className="cta-contact-label">Contacto directo</p>
              <p className="cta-email">cataconjuanjo@gmail.com</p>
              <p className="cta-ig">@cataconjuanjo</p>
              <p className="cta-web">cataconjuanjo.com</p>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
