const slides = [
  {
    eyebrow: 'Carta real',
    title: 'Lo de Carmen',
    text: 'La carta digital no solo ensena vinos: conecta platos reales con decisiones de venta en sala.',
    detail: '81 referencias · platos de carta · modo camarero',
    tags: ['Carta', 'Platos', 'Sala'],
  },
  {
    eyebrow: 'Plato seleccionado',
    title: 'Codillo al Pedro Ximenez',
    text: 'La app entiende el plato: cerdo meloso, grasa, coccion lenta y reduccion dulce.',
    detail: 'No interpreta solo palabras sueltas: lee tecnica, textura y salsa.',
    tags: ['Textura', 'Salsa', 'Metodo'],
  },
  {
    eyebrow: 'Ficha de venta',
    title: 'Que buscar y que evitar',
    text: 'Buscar estructura, fruta madura y acidez. Evitar vinos ligeros, secantes o sin frescura.',
    detail: 'El camarero sabe que decir antes de recomendar.',
    tags: ['Buscar', 'Evitar', 'Frase'],
  },
  {
    eyebrow: 'Vinos compatibles',
    title: 'Tres opciones de la carta',
    text: 'Facil de vender, recomendado y premium. Siempre con vinos reales del restaurante.',
    detail: 'La recomendacion se apoya en la carta existente, no inventa botellas.',
    tags: ['Facil', 'Top', 'Premium'],
  },
  {
    eyebrow: 'Rotacion inteligente',
    title: 'Otras opciones compatibles',
    text: 'Si el restaurante quiere rotar stock, la app abre alternativas validas sin romper el criterio.',
    detail: 'No siempre empuja el mismo vino.',
    tags: ['Stock', 'Margen', 'Rotacion'],
  },
  {
    eyebrow: 'Para el propietario',
    title: 'Mejoras accionables',
    text: 'El dashboard detecta oportunidades: vinos por copa, frituras, peso de tintos y stock.',
    detail: 'La carta se convierte en una herramienta de negocio.',
    tags: ['Negocio', 'Stock', 'Ticket'],
  },
]

export default async function DemoReel({ searchParams }) {
  if (process.env.NEXT_PUBLIC_SHOW_DEMO !== 'true') {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#111', color: '#fff', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <p style={{ color: '#777', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 11 }}>Demo no disponible</p>
          <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 300 }}>Acceso privado</h1>
          <p style={{ color: '#aaa', lineHeight: 1.6 }}>Esta demo solo se activa para presentaciones internas.</p>
        </div>
      </main>
    )
  }

  const params = await searchParams
  const step = Math.max(0, Math.min(slides.length - 1, Number(params?.step || 0)))
  const slide = slides[step]
  const progress = `${((step + 1) / slides.length) * 100}%`
  const exportMode = params?.export === '1'

  return (
    <main className={`reel ${exportMode ? 'export' : ''}`}>
      <style>{`
        html,
        body {
          margin: 0;
          background: #0f1110;
          overflow: hidden;
        }

        nextjs-portal {
          display: none !important;
        }

        .reel {
          width: 100vw;
          min-height: 100dvh;
          background: #111;
          color: #fff;
          font-family: Arial, Helvetica, sans-serif;
          display: flex;
          justify-content: center;
        }

        .reel.export {
          width: 1170px;
          height: 2532px;
          min-height: 2532px;
        }

        .phone {
          width: min(100vw, 430px);
          height: 100dvh;
          min-height: 720px;
          box-sizing: border-box;
          padding: 28px 24px 26px;
          display: grid;
          grid-template-rows: auto 1fr auto;
          gap: 20px;
        }

        .export .phone {
          width: 1170px;
          height: 2532px;
          min-height: 2532px;
          max-width: none;
          padding: 84px 72px 78px;
          gap: 60px;
        }

        .top {
          padding-top: 4px;
        }

        .brand {
          margin: 0 0 10px;
          color: rgba(255,255,255,0.66);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .export .brand {
          margin-bottom: 30px;
          font-size: 33px;
        }

        .bar {
          height: 5px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255,255,255,0.16);
        }

        .export .bar {
          height: 15px;
        }

        .fill {
          width: ${progress};
          height: 100%;
          border-radius: inherit;
          background: #fff;
        }

        .content {
          min-height: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 4px 0 10px;
        }

        .export .content {
          padding: 12px 0 30px;
        }

        .eyebrow {
          margin: 0 0 14px;
          color: rgba(255,255,255,0.72);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .export .eyebrow {
          margin-bottom: 42px;
          font-size: 36px;
        }

        h1 {
          max-width: 10ch;
          margin: 0 0 22px;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 46px;
          line-height: 1.02;
          font-weight: 400;
          letter-spacing: 0;
          overflow-wrap: break-word;
        }

        .export h1 {
          margin-bottom: 66px;
          font-size: 138px;
        }

        .copy {
          margin: 0 0 20px;
          color: rgba(255,255,255,0.88);
          font-size: 20px;
          line-height: 1.42;
          overflow-wrap: break-word;
        }

        .export .copy {
          margin-bottom: 60px;
          font-size: 60px;
        }

        .detail {
          margin: 0 0 18px;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          background: rgba(255,255,255,0.08);
          padding: 16px;
          color: rgba(255,255,255,0.78);
          font-size: 15px;
          line-height: 1.42;
        }

        .export .detail {
          margin-bottom: 54px;
          border-radius: 24px;
          padding: 48px;
          font-size: 45px;
        }

        .tags {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .export .tags,
        .export .nav {
          gap: 24px;
        }

        .tag,
        .navItem {
          min-width: 0;
          border-radius: 8px;
          padding: 10px 8px;
          text-align: center;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .export .tag,
        .export .navItem {
          border-radius: 24px;
          padding: 30px 24px;
          font-size: 36px;
        }

        .tag {
          color: #161616;
          background: #fff;
        }

        .nav {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          padding-bottom: 2px;
        }

        .navItem {
          color: rgba(255,255,255,0.54);
          background: rgba(255,255,255,0.1);
        }

        .navItem.active {
          color: #111;
          background: #fff;
        }

        @media (max-height: 760px) {
          .phone {
            min-height: 100dvh;
            padding-top: 22px;
            padding-bottom: 18px;
            gap: 14px;
          }

          h1 {
            font-size: 39px;
            margin-bottom: 16px;
          }

          .copy {
            font-size: 17px;
            line-height: 1.36;
          }

          .detail {
            font-size: 13px;
            padding: 13px;
          }
        }
      `}</style>

      <section className="phone" aria-label="Demo Carta Viva">
        <header className="top">
          <p className="brand">Carta Viva · Demo</p>
          <div className="bar">
            <div className="fill" />
          </div>
        </header>

        <div className="content">
          <p className="eyebrow">{slide.eyebrow}</p>
          <h1>{slide.title}</h1>
          <p className="copy">{slide.text}</p>
          <p className="detail">{slide.detail}</p>
          <div className="tags">
            {slide.tags.map((tag) => (
              <span className="tag" key={tag}>{tag}</span>
            ))}
          </div>
        </div>

        <footer className="nav">
          {['Ficha', 'Vinos', 'Stock'].map((item, idx) => (
            <span className={`navItem ${idx <= Math.min(step, 2) ? 'active' : ''}`} key={item}>
              {item}
            </span>
          ))}
        </footer>
      </section>
    </main>
  )
}
