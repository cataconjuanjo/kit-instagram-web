'use client'

export default function Dossier() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;700&family=Inter:wght@400;500;600&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: 'Inter', sans-serif;
          background: #f0ebe0;
          color: #1a1a1a;
        }

        .print-btn {
          position: fixed;
          top: 24px;
          right: 24px;
          z-index: 999;
          background: #531827;
          color: #fff;
          border: none;
          padding: 12px 24px;
          font-size: 13px;
          font-family: 'Inter', sans-serif;
          letter-spacing: 0.06em;
          cursor: pointer;
          border-radius: 4px;
          box-shadow: 0 4px 20px rgba(83,24,39,0.3);
        }
        .print-btn:hover { background: #3d1020; }

        .page {
          width: 210mm;
          min-height: 297mm;
          margin: 24px auto;
          background: #fff;
          box-shadow: 0 8px 48px rgba(0,0,0,0.12);
          overflow: hidden;
        }

        /* ── Portada ── */
        .cover {
          height: 297mm;
          display: grid;
          grid-template-rows: 1fr auto;
          background: #1a0d0e;
          position: relative;
          overflow: hidden;
        }
        .cover-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 70% 40%, rgba(191,169,132,0.12), transparent),
            radial-gradient(ellipse 50% 70% at 20% 80%, rgba(83,24,39,0.4), transparent);
        }
        .cover-inner {
          position: relative;
          z-index: 1;
          padding: 52px 56px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .cover-brand {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .cover-brand-name {
          font-family: 'Playfair Display', serif;
          font-size: 18px;
          font-weight: 400;
          color: #bfa984;
          letter-spacing: 0.08em;
        }
        .cover-brand-sub {
          font-size: 11px;
          color: rgba(255,255,255,0.35);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .cover-hero {
          max-width: 520px;
        }
        .cover-eyebrow {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #bfa984;
          margin-bottom: 20px;
        }
        .cover-h1 {
          font-family: 'Playfair Display', serif;
          font-size: 54px;
          font-weight: 400;
          line-height: 1.08;
          color: #fff;
          margin-bottom: 28px;
        }
        .cover-h1 em {
          font-style: italic;
          color: #bfa984;
        }
        .cover-desc {
          font-size: 15px;
          line-height: 1.75;
          color: rgba(255,255,255,0.6);
          max-width: 440px;
        }
        .cover-footer {
          position: relative;
          z-index: 1;
          padding: 32px 56px;
          border-top: 1px solid rgba(255,255,255,0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .cover-footer-url {
          font-size: 12px;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.06em;
        }
        .cover-footer-tag {
          font-size: 11px;
          color: rgba(255,255,255,0.2);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        /* ── Página interior ── */
        .inner-page {
          min-height: 297mm;
          padding: 52px 56px;
          display: flex;
          flex-direction: column;
          gap: 48px;
        }

        .section-eyebrow {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #531827;
          margin-bottom: 16px;
        }
        .section-title {
          font-family: 'Playfair Display', serif;
          font-size: 32px;
          font-weight: 400;
          line-height: 1.2;
          color: #1a1a1a;
          margin-bottom: 8px;
        }
        .section-subtitle {
          font-size: 14px;
          line-height: 1.7;
          color: #666;
          max-width: 560px;
        }

        /* ── Problemas ── */
        .problems-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 8px;
        }
        .problem-card {
          background: #faf7f2;
          border: 1px solid #ede7da;
          border-radius: 8px;
          padding: 20px 22px;
        }
        .problem-icon {
          font-size: 20px;
          margin-bottom: 10px;
          display: block;
        }
        .problem-title {
          font-size: 13px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 6px;
          line-height: 1.4;
        }
        .problem-desc {
          font-size: 12px;
          color: #888;
          line-height: 1.6;
        }

        /* ── Features ── */
        .features-list {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .feature-row {
          display: grid;
          grid-template-columns: 40px 1fr;
          gap: 16px;
          align-items: flex-start;
          padding-bottom: 20px;
          border-bottom: 1px solid #f0ebe0;
        }
        .feature-row:last-child { border-bottom: none; padding-bottom: 0; }
        .feature-num {
          width: 36px;
          height: 36px;
          background: #531827;
          color: #fff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          flex-shrink: 0;
        }
        .feature-content {}
        .feature-title {
          font-size: 14px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 4px;
        }
        .feature-desc {
          font-size: 12px;
          color: #777;
          line-height: 1.65;
        }

        /* ── Planes ── */
        .plans-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 14px;
        }
        .plan-card {
          border: 1.5px solid #ede7da;
          border-radius: 10px;
          overflow: hidden;
        }
        .plan-card.featured {
          border-color: #531827;
          box-shadow: 0 4px 24px rgba(83,24,39,0.12);
        }
        .plan-header {
          padding: 20px 20px 16px;
          background: #faf7f2;
          border-bottom: 1px solid #ede7da;
        }
        .plan-card.featured .plan-header {
          background: #531827;
          border-bottom-color: transparent;
        }
        .plan-badge {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #531827;
          margin-bottom: 8px;
        }
        .plan-card.featured .plan-badge { color: #bfa984; }
        .plan-name {
          font-family: 'Playfair Display', serif;
          font-size: 22px;
          font-weight: 400;
          color: #1a1a1a;
          margin-bottom: 4px;
        }
        .plan-card.featured .plan-name { color: #fff; }
        .plan-price {
          font-size: 28px;
          font-weight: 700;
          color: #531827;
          line-height: 1;
        }
        .plan-card.featured .plan-price { color: #bfa984; }
        .plan-price span {
          font-size: 13px;
          font-weight: 400;
          color: #aaa;
        }
        .plan-card.featured .plan-price span { color: rgba(255,255,255,0.5); }
        .plan-body {
          padding: 16px 20px 20px;
        }
        .plan-limit {
          font-size: 11px;
          color: #999;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid #f0ebe0;
        }
        .plan-features {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .plan-features li {
          font-size: 11.5px;
          color: #555;
          display: flex;
          gap: 7px;
          align-items: flex-start;
          line-height: 1.4;
        }
        .plan-features li::before {
          content: '✓';
          color: #531827;
          font-weight: 700;
          flex-shrink: 0;
          margin-top: 1px;
        }

        /* ── CTA final ── */
        .cta-block {
          background: #1a0d0e;
          border-radius: 12px;
          padding: 40px 44px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 32px;
          align-items: center;
        }
        .cta-title {
          font-family: 'Playfair Display', serif;
          font-size: 26px;
          font-weight: 400;
          color: #fff;
          line-height: 1.25;
          margin-bottom: 8px;
        }
        .cta-desc {
          font-size: 13px;
          color: rgba(255,255,255,0.5);
          line-height: 1.65;
        }
        .cta-contact {
          text-align: right;
          flex-shrink: 0;
        }
        .cta-contact-label {
          font-size: 10px;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .cta-contact-email {
          font-size: 14px;
          color: #bfa984;
          font-weight: 500;
        }
        .cta-contact-web {
          font-size: 12px;
          color: rgba(255,255,255,0.3);
          margin-top: 4px;
        }

        /* ── Page header ── */
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 24px;
          border-bottom: 1px solid #ede7da;
        }
        .page-header-brand {
          font-family: 'Playfair Display', serif;
          font-size: 15px;
          color: #531827;
          letter-spacing: 0.06em;
        }
        .page-header-num {
          font-size: 11px;
          color: #ccc;
          letter-spacing: 0.1em;
        }

        @media print {
          .print-btn { display: none !important; }
          body { background: #fff; }
          .page {
            width: 100%;
            margin: 0;
            box-shadow: none;
            page-break-after: always;
          }
          .page:last-child { page-break-after: auto; }
          .cover { height: 100vh; }
          .inner-page { min-height: 100vh; }
        }

        @page {
          size: A4;
          margin: 0;
        }
      `}</style>

      <button className="print-btn" onClick={() => window.print()}>
        Guardar como PDF ↓
      </button>

      {/* ══════════════════════════════════════════════════════ */}
      {/* PORTADA                                               */}
      {/* ══════════════════════════════════════════════════════ */}
      <div className="page">
        <div className="cover">
          <div className="cover-bg" />
          <div className="cover-inner">
            <div className="cover-brand">
              <span className="cover-brand-name">Carta Viva</span>
              <span className="cover-brand-sub">por Cata con Juanjo</span>
            </div>
            <div className="cover-hero">
              <p className="cover-eyebrow">Herramienta digital para restaurantes</p>
              <h1 className="cover-h1">
                Tu carta de vinos,<br />
                <em>siempre viva.</em>
              </h1>
              <p className="cover-desc">
                Actualiza tu carta en segundos, da a tu sala el apoyo de un sumiller
                y deja que el cliente encuentre el vino perfecto para su plato —
                desde su propio móvil.
              </p>
            </div>
          </div>
          <div className="cover-footer">
            <span className="cover-footer-url">cataconjuanjo.com</span>
            <span className="cover-footer-tag">Dossier comercial · 2025</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* PÁGINA 2 — Problemas + Features                       */}
      {/* ══════════════════════════════════════════════════════ */}
      <div className="page">
        <div className="inner-page">

          <div className="page-header">
            <span className="page-header-brand">Carta Viva</span>
            <span className="page-header-num">02</span>
          </div>

          {/* Problemas */}
          <div>
            <p className="section-eyebrow">El problema</p>
            <h2 className="section-title">Lo que pasa en casi todos los restaurantes</h2>
            <p className="section-subtitle">
              La hostelería trabaja con márgenes ajustados. Cada menú impreso que caduca,
              cada vino agotado que sigue en carta o cada recomendación sin convicción
              es dinero y reputación que se pierden.
            </p>
            <div className="problems-grid" style={{ marginTop: 24 }}>
              <div className="problem-card">
                <span className="problem-icon">📋</span>
                <p className="problem-title">La carta impresa caduca en días</p>
                <p className="problem-desc">Cambia una añada, se acaba un vino — y la carta ya miente. Reimprimir cuesta tiempo y dinero.</p>
              </div>
              <div className="problem-card">
                <span className="problem-icon">🍷</span>
                <p className="problem-title">Sin sumiller, el camarero no sabe qué recomendar</p>
                <p className="problem-desc">La mayoría de salas no tienen sumiller. El equipo recomienda sin convicción y el cliente lo nota.</p>
              </div>
              <div className="problem-card">
                <span className="problem-icon">📱</span>
                <p className="problem-title">El cliente busca en Google antes que en la carta</p>
                <p className="problem-desc">Si la carta no inspira confianza, el cliente consulta su móvil. O no pide nada.</p>
              </div>
              <div className="problem-card">
                <span className="problem-icon">📦</span>
                <p className="problem-title">La bodega va por libre</p>
                <p className="problem-desc">No hay control real de stock. Se venden vinos agotados o se piden referencias que sobran.</p>
              </div>
            </div>
          </div>

          {/* Features */}
          <div>
            <p className="section-eyebrow">La solución</p>
            <h2 className="section-title">Lo que Carta Viva hace por ti</h2>
            <div className="features-list" style={{ marginTop: 20 }}>
              <div className="feature-row">
                <div className="feature-num">1</div>
                <div className="feature-content">
                  <p className="feature-title">Carta de vinos siempre actualizada, en segundos</p>
                  <p className="feature-desc">¿Cambia una añada? Un clic. ¿Se acaba un vino? Un clic. El cliente escanea el QR y siempre ve la carta real — sin tachones, sin errores, sin reimprimir nada.</p>
                </div>
              </div>
              <div className="feature-row">
                <div className="feature-num">2</div>
                <div className="feature-content">
                  <p className="feature-title">El sumiller que tu sala no tiene, en el bolsillo del camarero</p>
                  <p className="feature-desc">El modo camarero lleva el asistente de maridaje integrado en la PDA de sala. El camarero selecciona el plato del cliente y recibe la recomendación de vino al instante — con argumentos. Vende con convicción, sin necesitar un sumiller.</p>
                </div>
              </div>
              <div className="feature-row">
                <div className="feature-num">3</div>
                <div className="feature-content">
                  <p className="feature-title">Carta de comidas viva y conectada al maridaje</p>
                  <p className="feature-desc">Define tus platos con ingredientes y elaboración. Cuanto más detallado, mejor trabaja el asistente. El cliente puede buscar el maridaje ideal desde su móvil, sin pedirle nada al camarero.</p>
                </div>
              </div>
              <div className="feature-row">
                <div className="feature-num">4</div>
                <div className="feature-content">
                  <p className="feature-title">Importa tu carta actual desde PDF</p>
                  <p className="feature-desc">No empiezas de cero. Sube la carta que tienes en PDF y la convertimos en digital en minutos. Sin teclear referencias una por una.</p>
                </div>
              </div>
              <div className="feature-row">
                <div className="feature-num">5</div>
                <div className="feature-content">
                  <p className="feature-title">Control de bodega e inventario en tiempo real</p>
                  <p className="feature-desc">Sabe qué tienes, cuánto te queda y qué se vende. Sin hojas de cálculo, sin sorpresas al abrir la bodega.</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* PÁGINA 3 — Planes + CTA                              */}
      {/* ══════════════════════════════════════════════════════ */}
      <div className="page">
        <div className="inner-page">

          <div className="page-header">
            <span className="page-header-brand">Carta Viva</span>
            <span className="page-header-num">03</span>
          </div>

          {/* Planes */}
          <div>
            <p className="section-eyebrow">Suscripción</p>
            <h2 className="section-title">Elige el plan de tu restaurante</h2>
            <p className="section-subtitle">
              Sin permanencia. Sin instalación. Funciona desde el primer día.
              Los 14 primeros días son gratis para que lo pruebes con tu equipo.
            </p>

            <div className="plans-grid" style={{ marginTop: 28 }}>

              {/* Básico */}
              <div className="plan-card">
                <div className="plan-header">
                  <p className="plan-badge">Plan Básico</p>
                  <p className="plan-name">Básico</p>
                  <p className="plan-price">39€ <span>/ mes</span></p>
                </div>
                <div className="plan-body">
                  <p className="plan-limit">Hasta 60 referencias de vino</p>
                  <ul className="plan-features">
                    <li>Carta digital con QR</li>
                    <li>Actualización instantánea</li>
                    <li>Maridaje para el cliente desde su móvil</li>
                    <li>Hub de enlaces (link en bio)</li>
                    <li>Personalización de marca</li>
                  </ul>
                </div>
              </div>

              {/* Sala (featured) */}
              <div className="plan-card featured">
                <div className="plan-header">
                  <p className="plan-badge">Más popular</p>
                  <p className="plan-name">Sala</p>
                  <p className="plan-price">79€ <span>/ mes</span></p>
                </div>
                <div className="plan-body">
                  <p className="plan-limit">Hasta 120 referencias de vino</p>
                  <ul className="plan-features">
                    <li>Todo lo del plan Básico</li>
                    <li>Modo camarero con asistente IA</li>
                    <li>Importación de carta desde PDF</li>
                    <li>Control de bodega e inventario</li>
                    <li>Estadísticas de sala</li>
                    <li>Cierre de servicio</li>
                    <li>Personalización avanzada</li>
                  </ul>
                </div>
              </div>

              {/* Acompañado */}
              <div className="plan-card">
                <div className="plan-header">
                  <p className="plan-badge">Plan Premium</p>
                  <p className="plan-name">Acompañado</p>
                  <p className="plan-price">149€ <span>/ mes</span></p>
                </div>
                <div className="plan-body">
                  <p className="plan-limit">Hasta 200 referencias de vino</p>
                  <ul className="plan-features">
                    <li>Todo lo del plan Sala</li>
                    <li>Informes de bodega y venta</li>
                    <li>Gestión de proveedores</li>
                    <li>Consultoría con Juanjo</li>
                    <li>Soporte prioritario</li>
                  </ul>
                </div>
              </div>

            </div>
          </div>

          {/* CTA */}
          <div className="cta-block">
            <div>
              <h3 className="cta-title">¿Lo probamos con tu restaurante?</h3>
              <p className="cta-desc">
                14 días gratis, sin tarjeta. Te lo configuramos nosotros
                y en menos de una hora tu carta ya está viva.
              </p>
            </div>
            <div className="cta-contact">
              <p className="cta-contact-label">Contacto directo</p>
              <p className="cta-contact-email">jjgarciapozo@gmail.com</p>
              <p className="cta-contact-web">cataconjuanjo.com</p>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
