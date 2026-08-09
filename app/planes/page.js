'use client'

import Link from 'next/link'
import { KIOSKO_PLANS } from '../lib/plans'

const WHATSAPP = '34600000000' // reemplazar con número real

const FEATURES = [
  { label: 'Kiosko interactivo (Explorar, Ayúdame a elegir, ¿Con qué lo tomo?)', basic: true, premium: true },
  { label: 'Cesta regalo', basic: true, premium: true },
  { label: 'Fichas de vino con IA (cata, maridaje, temperatura, curiosidad)', basic: true, premium: true },
  { label: 'Multi-idioma (ES / EN / FR / DE)', basic: true, premium: true },
  { label: 'Personalización visual (logo, colores, tipografía)', basic: true, premium: true },
  { label: 'Gestión de catálogo + checklist de calidad', basic: true, premium: true },
  { label: 'Analítica: qué buscan tus clientes y vinos más recomendados', basic: true, premium: true },
  { label: 'Widget de valoración del cliente', basic: true, premium: true },
  { label: 'Motor de conversión: fugas y € no capturados por vino', basic: false, premium: true, highlight: true },
  { label: 'Diagnóstico automático de causas (sin foto / ubicación / stock)', basic: false, premium: true, highlight: true },
  { label: 'Optimización de precios y márgenes', basic: false, premium: true, highlight: true },
  { label: 'Cuadrante de rentabilidad', basic: false, premium: true, highlight: true },
  { label: 'Analítica de ventas TPV + vinos sin movimiento', basic: false, premium: true, highlight: true },
  { label: 'Captación de clientes (leads con email, opt-in RGPD)', basic: false, premium: true, highlight: true },
  { label: 'Venta cruzada gourmet automática ("Para acompañar")', basic: false, premium: true, highlight: true },
  { label: 'Informe semanal por email', basic: false, premium: true, highlight: true },
  { label: 'Widget embebible para tu web', basic: false, premium: true, highlight: true },
]

const FAQ = [
  { q: '¿Puedo cambiar de plan cuando quiera?', a: 'Sí, el cambio se aplica al instante. Pasas a Premium y en segundos tienes acceso a todas las funciones.' },
  { q: '¿Los datos que ya tengo se mantienen al mejorar?', a: 'Sí, no se pierde nada. Tu catálogo, analítica y configuración siguen intactos.' },
  { q: '¿El plan Básico tiene permanencia?', a: 'No. Puedes cancelar en cualquier momento desde el panel de administración.' },
]

const GOLD = '#af8b52'
const DARK = '#17120f'
const CREAM = '#fbf6ec'
const SOFT  = '#f3eee5'
const MUTED = '#756d63'
const LINE  = 'rgba(52,35,23,.12)'

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="9" fill={GOLD} fillOpacity=".15" />
      <path d="M5.5 9l2.5 2.5 4.5-5" stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M6 9h6" stroke="#c9c0b4" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export default function PlanesPage() {
  const basic   = KIOSKO_PLANS.basic
  const premium = KIOSKO_PLANS.premium

  function waUrl(plan) {
    const txt = encodeURIComponent(`Hola, me interesa el plan ${plan} del Kiosko. ¿Podemos hablarlo?`)
    return `https://wa.me/${WHATSAPP}?text=${txt}`
  }

  return (
    <div style={{ background: CREAM, minHeight: '100vh', fontFamily: "Georgia, 'Times New Roman', serif" }}>

      {/* Nav mínima */}
      <nav style={{ background: '#fff', borderBottom: `1px solid ${LINE}`, padding: '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: DARK, letterSpacing: '-.01em' }}>Carta Viva</span>
          <span style={{ fontSize: '.7rem', color: MUTED, fontFamily: 'system-ui, sans-serif', letterSpacing: '.06em', textTransform: 'uppercase' }}>Kiosko</span>
        </Link>
        <a href={waUrl('Premium')} target="_blank" rel="noreferrer"
          style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.82rem', fontWeight: 600, color: GOLD, textDecoration: 'none', border: `1px solid ${GOLD}`, borderRadius: 6, padding: '5px 14px' }}>
          Hablar con ventas
        </a>
      </nav>

      {/* Hero */}
      <header style={{ textAlign: 'center', padding: '72px 24px 48px' }}>
        <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.75rem', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: GOLD, marginBottom: 16 }}>
          Planes y precios
        </p>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', fontWeight: 700, color: DARK, margin: '0 0 20px', lineHeight: 1.15 }}>
          El kiosko que trabaja<br />mientras tú vendes
        </h1>
        <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '1.05rem', color: MUTED, maxWidth: 520, margin: '0 auto', lineHeight: 1.65 }}>
          Elige el nivel que necesitas. Empieza en Básico y mejora cuando quieras —sin perder nada.
        </p>
      </header>

      {/* Cards */}
      <section style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', padding: '0 24px 64px', maxWidth: 900, margin: '0 auto' }}>

        {/* Básico */}
        <div style={{ flex: '1 1 320px', maxWidth: 400, background: '#fff', borderRadius: 20, border: `1px solid ${LINE}`, padding: '36px 32px', display: 'flex', flexDirection: 'column' }}>
          <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.7rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>Plan {basic.name}</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: '2.8rem', fontWeight: 700, color: DARK, lineHeight: 1 }}>{basic.price} €</span>
            <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.85rem', color: MUTED }}>/{basic.period}</span>
          </div>
          <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.82rem', color: MUTED, marginBottom: 24, lineHeight: 1.5 }}>
            El kiosko que vende por ti.
          </p>
          <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.88rem', color: DARK, lineHeight: 1.65, marginBottom: 16 }}>
            Tu carta de vinos cobra vida. Tus clientes exploran, entienden y eligen solos —sin esperar a que alguien les atienda.
          </p>
          <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.78rem', color: MUTED, lineHeight: 1.55, marginBottom: 32, fontStyle: 'italic' }}>
            Ideal para vinotecas y tiendas gourmet que quieren dar un salto de experiencia en tienda.
          </p>
          <div style={{ marginTop: 'auto' }}>
            <a href={waUrl('Básico')} target="_blank" rel="noreferrer"
              style={{ display: 'block', textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontWeight: 600, fontSize: '.92rem', color: DARK, border: `1.5px solid ${LINE}`, borderRadius: 10, padding: '13px 0', textDecoration: 'none', transition: 'border-color .2s' }}>
              Empezar con Básico
            </a>
          </div>
        </div>

        {/* Premium */}
        <div style={{ flex: '1 1 320px', maxWidth: 400, background: DARK, borderRadius: 20, border: `2px solid ${GOLD}`, padding: '36px 32px', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: `0 8px 40px rgba(175,139,82,.18)` }}>
          <span style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', fontFamily: 'system-ui, sans-serif', fontSize: '.65rem', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', background: GOLD, color: '#fff', borderRadius: 20, padding: '4px 14px', whiteSpace: 'nowrap' }}>
            RECOMENDADO
          </span>
          <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.7rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: GOLD, marginBottom: 8 }}>Plan {premium.name}</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: '2.8rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>{premium.price} €</span>
            <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.85rem', color: '#c9b98a' }}>/{premium.period}</span>
          </div>
          <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.82rem', color: GOLD, marginBottom: 24, lineHeight: 1.5 }}>
            Inteligencia que recupera dinero.
          </p>
          <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.88rem', color: '#e8dfc8', lineHeight: 1.65, marginBottom: 16 }}>
            Todo lo del plan Básico, y además descubres cuánto dinero estás dejando en la mesa —y exactamente cómo recuperarlo.
          </p>
          <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.78rem', color: '#a89878', lineHeight: 1.55, marginBottom: 16, fontStyle: 'italic' }}>
            Para tiendas que quieren vender más con el stock que ya tienen y captar clientes para el futuro.
          </p>
          <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.75rem', color: GOLD, lineHeight: 1.55, marginBottom: 32, background: 'rgba(175,139,82,.12)', borderRadius: 8, padding: '10px 12px' }}>
            💡 Nuestras tiendas detectan de media cientos de € al mes en ventas que se escapaban. El plan se paga solo.
          </p>
          <div style={{ marginTop: 'auto' }}>
            <a href={waUrl('Premium')} target="_blank" rel="noreferrer"
              style={{ display: 'block', textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontWeight: 700, fontSize: '.92rem', color: DARK, background: GOLD, borderRadius: 10, padding: '13px 0', textDecoration: 'none' }}>
              Mejorar a Premium
            </a>
          </div>
        </div>
      </section>

      {/* Tabla comparativa */}
      <section style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 700, color: DARK, marginBottom: 8 }}>
          Todo lo que incluye cada plan
        </h2>
        <p style={{ textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontSize: '.88rem', color: MUTED, marginBottom: 36 }}>
          Sin letra pequeña. Sin costes ocultos.
        </p>

        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${LINE}`, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', background: SOFT, borderBottom: `1px solid ${LINE}`, padding: '12px 24px' }}>
            <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.72rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED }}>Función</span>
            <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.72rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED, textAlign: 'center' }}>Básico</span>
            <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.72rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: GOLD, textAlign: 'center' }}>Premium</span>
          </div>

          {FEATURES.map((f, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 100px',
              padding: '13px 24px',
              borderBottom: i < FEATURES.length - 1 ? `1px solid ${LINE}` : 'none',
              background: f.highlight ? `${GOLD}08` : i % 2 === 0 ? '#fff' : `${SOFT}88`,
              alignItems: 'center',
            }}>
              <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.83rem', color: f.highlight ? DARK : '#544c44', fontWeight: f.highlight ? 600 : 400, lineHeight: 1.4 }}>
                {f.label}
              </span>
              <div style={{ textAlign: 'center' }}>{f.basic ? <CheckIcon /> : <DashIcon />}</div>
              <div style={{ textAlign: 'center' }}>{f.premium ? <CheckIcon /> : <DashIcon />}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 640, margin: '0 auto', padding: '0 24px 96px' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.4rem', fontWeight: 700, color: DARK, marginBottom: 36 }}>
          Preguntas frecuentes
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {FAQ.map((item, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${LINE}`, padding: '20px 24px' }}>
              <p style={{ fontFamily: 'system-ui, sans-serif', fontWeight: 700, fontSize: '.9rem', color: DARK, margin: '0 0 8px' }}>{item.q}</p>
              <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.85rem', color: MUTED, margin: 0, lineHeight: 1.65 }}>{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section style={{ background: DARK, padding: '64px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fff', margin: '0 0 12px', lineHeight: 1.2 }}>
          ¿Listo para empezar?
        </h2>
        <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '.95rem', color: '#a89878', margin: '0 0 32px', lineHeight: 1.6 }}>
          Prueba gratis 14 días. Sin tarjeta de crédito.
        </p>
        <a href={waUrl('Premium')} target="_blank" rel="noreferrer"
          style={{ display: 'inline-block', fontFamily: 'system-ui, sans-serif', fontWeight: 700, fontSize: '1rem', color: DARK, background: GOLD, borderRadius: 12, padding: '15px 36px', textDecoration: 'none' }}>
          Hablar con el equipo
        </a>
      </section>

    </div>
  )
}
