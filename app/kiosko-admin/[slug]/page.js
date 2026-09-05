'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import styles from './admin.module.css'
import { supabase } from '../../supabase'
import { isAdminEmail } from '../../demo'

const TIPOS = ['tinto','blanco','rosado','espumoso','generoso','dulce','naranja','sin_alcohol']

const WHATSAPP_VENTAS = '34601502868'
const COUNTER_ORDERS_IN_DEVELOPMENT = true

// ── Constantes de personalización ─────────────────────────────────────────────

const PALETAS = [
  { id: 'clasico',  label: 'Clásico',         primario: '#0d0d1a', acento: '#c9a96e' },
  { id: 'sibaris',  label: 'Síbaris Gourmet', primario: '#1e1b22', acento: '#c48e10' },
  { id: 'blanco',   label: 'Blanco elegante',  primario: '#FAFAF8', acento: '#1a1a2e' },
  { id: 'verde',    label: 'Verde vinoteca',   primario: '#122012', acento: '#7cb87c' },
  { id: 'burdeos',  label: 'Burdeos',          primario: '#1a0408', acento: '#c45069' },
  { id: 'azul',     label: 'Azul pizarra',     primario: '#0f1729', acento: '#7099cf' },
  { id: 'arena',    label: 'Arena cálida',     primario: '#f5f0e8', acento: '#8b6341' },
]

const FUENTES = [
  { id: 'clasica',   label: 'Clásica',      muestra: 'El arte del vino',  css: "'Playfair Display', Georgia, serif",    google: 'Playfair+Display:ital,wght@0,400;0,700;1,400' },
  { id: 'moderna',   label: 'Moderna',      muestra: 'El arte del vino',  css: "'Inter', system-ui, sans-serif",         google: null },
  { id: 'elegante',  label: 'Elegante',     muestra: 'El arte del vino',  css: "'Cormorant Garamond', Palatino, serif",  google: 'Cormorant+Garamond:ital,wght@0,400;0,600;1,400' },
  { id: 'natural',   label: 'Natural',      muestra: 'El arte del vino',  css: "'Lato', Trebuchet MS, sans-serif",       google: 'Lato:wght@400;700' },
  { id: 'redondeada',label: 'Redondeada',   muestra: 'El arte del vino',  css: "'Nunito', system-ui, sans-serif",        google: 'Nunito:wght@400;700;800' },
]

const ICON_STYLE_OPTIONS = [
  { id: 'emoji', label: 'Emojis', desc: 'Más cercano y rápido para venta asistida.', preview: ['🍾', '🤔', '🍽️'] },
  { id: 'lineal', label: 'Iconos lineales', desc: 'Más sobrio para tiendas con estética premium.', preview: null },
]

const PREVIEW_ACTIONS = [
  { icon: '🍾', iconName: 'browse', label: 'Explorar vinos' },
  { icon: '🤔', iconName: 'choose', label: 'Ayúdame\na elegir' },
  { icon: '🍽️', iconName: 'pairing', label: '¿Con qué\nlo tomo?' },
]

const PEDIDO_STATUS = [
  { id: 'pendiente_pago', label: 'Pendiente pago' },
  { id: 'preparando', label: 'Preparando' },
  { id: 'cerrado', label: 'Entregado' },
  { id: 'cancelado', label: 'Cancelado' },
]

function pedidoVisualStatus(status) {
  return status === 'nuevo' ? 'pendiente_pago' : status
}

function detectarCatGourmet(nombre, descripcion) {
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const n = norm(nombre)
  const t = norm(`${nombre} ${descripcion || ''}`)
  const d = norm(descripcion || '')
  if (/vermut|vermouth|vermell\b|sidra\b|cerveza\b|kombucha/.test(n)) return 'Vermut·Sidra'
  if (/jamon|iberic|paleta|lomo\b|chorizo|salchich|fuet|sobrasada|cecina|morcill|embutido|presa\b|butifarra|longaniz|salami|bresaola|panceta|bacon|tocino|oreja\b|pulled\s*pork/.test(n)) return 'Embutido'
  if (/queso|manchego|brie|camembert|gorgonzola|parmesano|gouda|idiazabal|tetilla|rulo\b|cabra\b|ricota|burrata|mozzarell|feta\b|roquefort|stilton|cheddar|mahon/.test(n)) return 'Queso'
  if (/galleta|cookie|cracker|snack|papas?\s*fritas?|\bpapas\b|patata\s*fritas?|chips\b|nachos|batatito/.test(n)) return 'Snack'
  if (/conserva|chipiron|calamar|pulpo|ventresca|bonito|caballa|sardin|anchoa|almeja|mejillon|berberecho|atun|bacalao|ahumado|navajas|zamburin|txangurro|boquer/.test(t)) return 'Conserva mar'
  if (/foie|pate\b|trufa|hummus|tahini|mousse\b|rillet|almogrote|crema\s+de\b/.test(t)) return 'Foie·Paté'
  if (/aceituna|olivada|tapenade/.test(n)) return 'Aceituna·Olivada'
  if (/esparrago|alcachofa|pimiento|piquillo|tomate\b|seta|hongo|puerro|banderilla|guindilla/.test(n)) return 'Verdura'
  if (/chocolate|bombon|turron|mazapan|nougat|polvoron/.test(t)) return 'Dulce'
  if (/fruto\s*seco|almendra|nuez\b|pistacho|avellana|anacardo/.test(t)) return 'Frutos secos'
  if (/miel|mermelada/.test(t)) return 'Miel·Mermelada'
  if (/vinagre|balsamic/.test(n)) return 'Vinagre·Balsámico'
  if (/condimento|aliño|aderezo/.test(n)) return 'Condimento'
  if (/^aceite|virgen\s*extra|\baove\b|aceite\s+de\s+oliva/.test(n)) return 'Aceite·AOVE'
  if (/aceite\s+de\s+oliva\s+virgen|\baove\b/.test(d)) return 'Aceite·AOVE'
  if (/\bpan\b/.test(n)) return 'Panadería'
  return 'Otros'
}

const CATS_GOURMET = [
  'Aceite·AOVE', 'Aceituna·Olivada', 'Condimento', 'Conserva mar', 'Dulce',
  'Embutido', 'Foie·Paté', 'Frutos secos', 'Miel·Mermelada', 'Panadería',
  'Queso', 'Snack', 'Verdura', 'Vermut·Sidra', 'Vinagre·Balsámico', 'Otros',
]

function Sparkline({ data, width = 72, height = 24 }) {
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - Math.round((v / max) * (height - 2)) - 1
    return `${x.toFixed(1)},${y}`
  }).join(' ')
  const trend = data[data.length - 1] - data[0]
  const color = trend > 0 ? '#2ea55a' : trend < 0 ? '#c03030' : '#bbb'
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function AdminThumbImage({ src, alt = '', className, fallback }) {
  const [failedSrc, setFailedSrc] = useState(null)
  if (!src || failedSrc === src) return fallback
  return <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailedSrc(src)} />
}

function PreviewKioskIcon({ name }) {
  if (name === 'choose') return (
    <svg className={styles.previewActionSvg} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="17" />
      <path d="M28.5 19.5 20 22l-2.5 8.5 8.5-2.5 2.5-8.5Z" />
      <circle cx="24" cy="24" r="2" />
    </svg>
  )

  if (name === 'pairing') return (
    <svg className={styles.previewActionSvg} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M16 8v16" />
      <path d="M11 8v9c0 4 2 7 5 7s5-3 5-7V8" />
      <path d="M16 24v16" />
      <path d="M31 8c4 3 6 8 5 14-.5 3-2 5-5 6v12" />
      <path d="M29 8v32" />
    </svg>
  )

  return (
    <svg className={styles.previewActionSvg} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M21 7h6" />
      <path d="M22 7v9l-5 7v15c0 2 1.5 3 3 3h8c1.5 0 3-1 3-3V23l-5-7V7" />
      <path d="M17 28h14" />
      <path d="M18 35h12" />
    </svg>
  )
}

function esColorClaro(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return false
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return (r*299 + g*587 + b*114)/1000 > 145
}

// ── Componente de ajustes ──────────────────────────────────────────────────────

function PremiumLock({ children, label = 'Premium' }) {
  return (
    <div style={{ position: 'relative', opacity: .45, pointerEvents: 'none', userSelect: 'none' }}>
      {children}
      <span style={{
        position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)',
        background: '#c9a96e', color: '#1a1a2e', fontSize: '.62rem', fontWeight: 800,
        padding: '2px 7px', borderRadius: 20, letterSpacing: '.05em',
      }}>{label}</span>
    </div>
  )
}

const UPGRADE_CONFIG = {
  analitica: {
    icon: '📊',
    title: 'Analítica avanzada',
    bullets: [
      'Qué buscan tus clientes y qué vinos recomiendan más',
      'Motor de conversión: ventas perdidas y € no capturados por vino',
      'Cuadrante de rentabilidad, precios y márgenes',
    ],
  },
  leads: {
    icon: '📧',
    title: 'Captación de clientes',
    bullets: [
      'Recoge emails de clientes con opt-in RGPD automático',
      'Les envías su selección de vino por email al instante',
      'Construyes tu propia base de datos de clientes fieles',
    ],
  },
  informe: {
    icon: '📬',
    title: 'Informe semanal por email',
    bullets: [
      'Resumen automático cada semana sin hacer nada',
      'Ventas perdidas, alertas de stock y tendencias',
      'Toma decisiones con datos, no con intuición',
    ],
  },
  widget: {
    icon: '🌐',
    title: 'Widget para tu web',
    bullets: [
      'Añade el kiosko como botón flotante en tu propia web',
      'Sin código: copia y pega un script de una línea',
      'Más visitas al kiosko = más ventas y leads capturados',
    ],
  },
}

function UpgradeModal({ feature, onClose }) {
  const cfg = UPGRADE_CONFIG[feature]
  if (!cfg) return null
  return (
    <div className={styles.overlay} onClick={onClose} style={{ background: 'rgba(10,8,6,.72)', zIndex: 400 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#17120f', borderRadius: 20, maxWidth: 440, width: '100%',
        border: '1.5px solid rgba(201,169,110,.35)', boxShadow: '0 16px 56px rgba(0,0,0,.55)',
        padding: '2.25rem 2rem 2rem', position: 'relative',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.08)',
          border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer',
          color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>

        <div style={{ fontSize: '2.4rem', lineHeight: 1, marginBottom: '1rem' }}>{cfg.icon}</div>
        <div style={{ fontFamily: 'system-ui,sans-serif', fontSize: '.68rem', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#c9a96e', marginBottom: '.4rem' }}>
          Plan Premium
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff', margin: '0 0 1.25rem', lineHeight: 1.2 }}>
          {cfg.title}
        </h2>

        <ul style={{ margin: '0 0 1.75rem', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
          {cfg.bullets.map((b, i) => (
            <li key={i} style={{ display: 'flex', gap: '.65rem', alignItems: 'flex-start' }}>
              <span style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="9" fill="#c9a96e" fillOpacity=".18" />
                  <path d="M5.5 9l2.5 2.5 4.5-5" stroke="#c9a96e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span style={{ fontFamily: 'system-ui,sans-serif', fontSize: '.88rem', color: '#d4c8b0', lineHeight: 1.55 }}>{b}</span>
            </li>
          ))}
        </ul>

        <a href="/planes" target="_blank" rel="noreferrer" onClick={onClose} style={{
          display: 'block', textAlign: 'center', fontFamily: 'system-ui,sans-serif',
          fontWeight: 700, fontSize: '.95rem', color: '#17120f',
          background: '#c9a96e', borderRadius: 10, padding: '13px 0', textDecoration: 'none',
          marginBottom: '.85rem',
        }}>
          Ver planes y precios →
        </a>
        <button onClick={onClose} style={{
          display: 'block', width: '100%', background: 'transparent', border: 'none',
          fontFamily: 'system-ui,sans-serif', fontSize: '.82rem', color: 'rgba(255,255,255,.35)',
          cursor: 'pointer', padding: '4px 0',
        }}>
          Ahora no
        </button>
      </div>
    </div>
  )
}

function CambiarPassword() {
  const [pass1, setPass1]   = useState('')
  const [pass2, setPass2]   = useState('')
  const [msg,   setMsg]     = useState('')
  const [saving, setSaving] = useState(false)

  async function actualizar() {
    if (pass1.length < 6) return setMsg('Mínimo 6 caracteres')
    if (pass1 !== pass2)  return setMsg('Las contraseñas no coinciden')
    setSaving(true); setMsg('')
    const { error } = await supabase.auth.updateUser({ password: pass1 })
    setSaving(false)
    if (error) setMsg(error.message)
    else { setMsg('✓ Contraseña actualizada'); setPass1(''); setPass2('') }
  }

  return (
    <div className={styles.ajustesSec} style={{ marginTop: '1.5rem', borderTop: '1px solid #e8e5e0', paddingTop: '1.5rem' }}>
      <p className={styles.ajustesSecTitulo}>Seguridad</p>
      <div className={styles.ajustesFormGrid}>
        <div className={styles.ajustesFormField}>
          <label>Nueva contraseña</label>
          <input type="password" value={pass1} onChange={e => setPass1(e.target.value)}
            placeholder="Mínimo 6 caracteres" />
        </div>
        <div className={styles.ajustesFormField}>
          <label>Confirmar contraseña</label>
          <input type="password" value={pass2} onChange={e => setPass2(e.target.value)}
            placeholder="Repite la contraseña"
            onKeyDown={e => e.key === 'Enter' && actualizar()} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginTop: '.75rem' }}>
        {msg && <span className={msg.startsWith('✓') ? styles.msgOk : styles.msgError}>{msg}</span>}
        <button type="button" className={styles.btnPrimario} onClick={actualizar} disabled={saving || !pass1}>
          {saving ? 'Guardando…' : 'Actualizar contraseña'}
        </button>
      </div>
    </div>
  )
}

function AjustesTab({ slug, tienda, onSaved, esAdmin }) {
  const esPremium = !tienda?.plan || tienda.plan === 'premium' || tienda.plan === 'trial'
  const [ajustesUpgradeModal, setAjustesUpgradeModal] = useState(null)
  const [squareTokenInput, setSquareTokenInput] = useState('')
  const [guardandoSquare, setGuardandoSquare] = useState(false)
  const [squareMsg, setSquareMsg] = useState('')
  const [ajustes, setAjustes] = useState({
    nombre:         tienda?.nombre         || '',
    ciudad:         tienda?.ciudad         || '',
    descripcion:    tienda?.descripcion    || '',
    logo_url:       tienda?.logo_url       || '',
    color_primario: tienda?.color_primario || '#0d0d1a',
    color_acento:   tienda?.color_acento   || '#c9a96e',
    font_family:    tienda?.font_family    || 'clasica',
    kiosko_icon_style: tienda?.kiosko_icon_style === 'lineal' ? 'lineal' : 'emoji',
    kiosko_orders_enabled: tienda?.kiosko_orders_enabled === true,
    cesta_activa: tienda?.cesta_activa === true,
    escaparate_timeout_segundos: tienda?.escaparate_timeout_segundos ?? 60,
    informe_email:  tienda?.informe_email  || tienda?.propietario_email || tienda?.email || '',
  })
  const [logoFile,     setLogoFile]     = useState(null)
  const [logoPreview,  setLogoPreview]  = useState(tienda?.logo_url || '')
  const [draggingLogo, setDraggingLogo] = useState(false)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [guardando,    setGuardando]    = useState(false)
  const [msg,          setMsg]          = useState('')
  const logoInputRef = useRef(null)
  const authHeaders = tienda?._token ? { Authorization: `Bearer ${tienda._token}` } : {}

  async function guardarSquareToken() {
    if (!squareTokenInput.trim()) return
    setGuardandoSquare(true); setSquareMsg('')
    try {
      const r = await fetch(`/api/kiosko/${slug}/admin/ajustes`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ square_access_token: squareTokenInput.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error al guardar')
      setSquareMsg('✓ Token guardado')
      setSquareTokenInput('')
      onSaved()
    } catch (e) { setSquareMsg(e.message) }
    finally { setGuardandoSquare(false) }
  }

  useEffect(() => {
    const fonts = [
      'Playfair+Display:ital,wght@0,400;0,700;1,400',
      'Cormorant+Garamond:ital,wght@0,400;0,600;1,400',
      'Lato:wght@400;700',
    ]
    fonts.forEach(f => {
      const id = `gfont-${f.split(':')[0].replace(/\+/g, '-')}`
      if (!document.getElementById(id)) {
        const link = document.createElement('link')
        link.id = id; link.rel = 'stylesheet'
        link.href = `https://fonts.googleapis.com/css2?family=${f}&display=swap`
        document.head.appendChild(link)
      }
    })
  }, [])

  function cambiar(k, v) { setAjustes(prev => ({ ...prev, [k]: v })) }

  function aplicarPaleta(p) {
    setAjustes(prev => ({ ...prev, color_primario: p.primario, color_acento: p.acento }))
  }

  function onFileLogo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  function onDropLogo(e) {
    e.preventDefault(); setDraggingLogo(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFileLogo({ target: { files: [file], value: '' } })
  }

  function eliminarLogo() {
    if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    setLogoFile(null); setLogoPreview('')
    cambiar('logo_url', '')
  }

  async function guardar() {
    setGuardando(true); setMsg('')
    try {
      let logoUrl = ajustes.logo_url

      if (logoFile) {
        setSubiendoLogo(true)
        const fd = new FormData()
        fd.append('logo', logoFile)
        const r = await fetch(`/api/kiosko/${slug}/admin/upload-logo`, { method: 'POST', headers: authHeaders, body: fd })
        const d = await r.json()
        setSubiendoLogo(false)
        if (!r.ok) throw new Error(d.error || 'Error subiendo logo')
        logoUrl = d.url
        setLogoPreview(logoUrl)
        setLogoFile(null)
      }

      const r = await fetch(`/api/kiosko/${slug}/admin/ajustes`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ajustes, logo_url: logoUrl }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error al guardar')

      setMsg('✓ Ajustes guardados')
      onSaved()
    } catch (e) { setMsg(e.message) }
    finally { setGuardando(false); setSubiendoLogo(false) }
  }

  const temaClaro  = esColorClaro(ajustes.color_primario)
  const textoColor = temaClaro ? '#141413' : '#f0ede8'
  const textoMedio = temaClaro ? 'rgba(20,20,19,.55)' : 'rgba(240,237,232,.55)'
  const panelColor = temaClaro ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.08)'
  const fontCss    = FUENTES.find(f => f.id === ajustes.font_family)?.css || FUENTES[0].css

  return (
    <>
    <div className={styles.ajustesWrap}>
      {/* ── Panel izquierdo ── */}
      <div className={styles.ajustesPanelLeft}>

        {/* Logo */}
        <div className={styles.ajustesSec}>
          <p className={styles.ajustesSecTitulo}>Logotipo</p>
          <div
            className={`${styles.logoZone} ${logoPreview ? styles.logoZoneHasLogo : ''} ${draggingLogo ? styles.logoZoneDrag : ''}`}
            onDrop={onDropLogo}
            onDragOver={e => { e.preventDefault(); setDraggingLogo(true) }}
            onDragLeave={() => setDraggingLogo(false)}
            onClick={() => logoInputRef.current?.click()}
          >
            {subiendoLogo ? (
              <div className={styles.logoSpinner} />
            ) : logoPreview ? (
              <img src={logoPreview} alt="Logo" className={styles.logoPreviewImg} />
            ) : (
              <>
                <span className={styles.logoZoneIcon}>🏷️</span>
                <span className={styles.logoZoneText}>Arrastra o haz clic para subir</span>
                <span className={styles.logoZoneHint}>PNG · JPG · SVG · máx 2 MB</span>
              </>
            )}
          </div>
          {logoPreview && (
            <div className={styles.logoActions}>
              <button type="button" className={styles.btnSecundario} onClick={() => logoInputRef.current?.click()}>
                Cambiar
              </button>
              <button type="button" className={`${styles.btnSecundario} ${styles.btnDanger}`} onClick={eliminarLogo}>
                Quitar logo
              </button>
            </div>
          )}
          <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: 'none' }} onChange={onFileLogo} />
        </div>

        {/* Paleta de colores */}
        <div className={styles.ajustesSec}>
          <p className={styles.ajustesSecTitulo}>Paleta de colores</p>
          <div className={styles.paletas}>
            {PALETAS.map(p => (
              <button
                key={p.id} type="button"
                className={`${styles.paletaItem} ${ajustes.color_primario === p.primario && ajustes.color_acento === p.acento ? styles.paletaItemActivo : ''}`}
                onClick={() => aplicarPaleta(p)} title={p.label}
              >
                <span className={styles.paletaSwatch} style={{ background: p.primario }} />
                <span className={styles.paletaAcento} style={{ background: p.acento }} />
                <span className={styles.paletaLabel}>{p.label}</span>
              </button>
            ))}
          </div>
          <p className={styles.ajustesSecSubtitulo} style={{ marginTop: '1rem' }}>Personalizar colores</p>
          <div className={styles.colorPickers}>
            <div className={styles.colorPickerItem}>
              <label>Color de fondo</label>
              <div className={styles.colorPickerRow}>
                <input type="color" value={ajustes.color_primario} onChange={e => cambiar('color_primario', e.target.value)} />
                <input type="text" value={ajustes.color_primario} maxLength={7}
                  onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) cambiar('color_primario', e.target.value) }} />
              </div>
            </div>
            <div className={styles.colorPickerItem}>
              <label>Color acento</label>
              <div className={styles.colorPickerRow}>
                <input type="color" value={ajustes.color_acento} onChange={e => cambiar('color_acento', e.target.value)} />
                <input type="text" value={ajustes.color_acento} maxLength={7}
                  onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) cambiar('color_acento', e.target.value) }} />
              </div>
            </div>
          </div>
        </div>

        {/* Tipografía */}
        <div className={styles.ajustesSec}>
          <p className={styles.ajustesSecTitulo}>Tipografía</p>
          <div className={styles.fuenteGrid}>
            {FUENTES.map(f => (
              <button
                key={f.id} type="button"
                className={`${styles.fuenteBtn} ${ajustes.font_family === f.id ? styles.fuenteBtnActivo : ''}`}
                onClick={() => cambiar('font_family', f.id)}
              >
                <span className={styles.fuenteNombre}>{f.label}</span>
                <span className={styles.fuenteMuestra} style={{ fontFamily: f.css }}>{f.muestra}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Estilo visual */}
        <div className={styles.ajustesSec}>
          <p className={styles.ajustesSecTitulo}>Iconos de bienvenida</p>
          <div className={styles.iconStyleGrid}>
            {ICON_STYLE_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                className={`${styles.iconStyleBtn} ${ajustes.kiosko_icon_style === option.id ? styles.iconStyleBtnActivo : ''}`}
                onClick={() => cambiar('kiosko_icon_style', option.id)}
              >
                <span className={styles.iconStylePreview}>
                  {option.preview
                    ? option.preview.map(icon => <span key={icon}>{icon}</span>)
                    : PREVIEW_ACTIONS.map(action => <PreviewKioskIcon key={action.iconName} name={action.iconName} />)}
                </span>
                <span className={styles.iconStyleLabel}>{option.label}</span>
                <span className={styles.iconStyleDesc}>{option.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Cesta regalo (beta) */}
        <div className={styles.ajustesSec}>
          <p className={styles.ajustesSecTitulo}>
            Cesta regalo
            <span className={styles.premiumTag}>Premium</span>
            <span className={styles.premiumTag} style={{ background: '#e8a020', color: '#fff' }}>BETA</span>
          </p>
          <button
            type="button"
            className={`${styles.settingToggleCard} ${ajustes.cesta_activa ? styles.settingToggleCardOn : ''}`}
            onClick={() => cambiar('cesta_activa', !ajustes.cesta_activa)}
          >
            <span className={styles.settingToggleText}>
              <strong>Mostrar cesta regalo en el kiosko</strong>
              <small>
                {ajustes.cesta_activa
                  ? 'Activa — los clientes pueden crear cestas personalizadas con vinos y productos gourmet.'
                  : 'Inactiva — el kiosko funciona exactamente igual que hasta ahora, sin cambios.'}
              </small>
              {ajustes.cesta_activa && (
                <small style={{ color: '#b45309', marginTop: '.2rem' }}>
                  Función en fase beta. Actívala solo si has revisado el catálogo de productos gourmet (pestaña Otros).
                </small>
              )}
            </span>
            <span className={styles.settingSwitch} aria-hidden="true">
              <span />
            </span>
          </button>
        </div>

        {/* Modo Escaparate */}
        <div className={styles.ajustesSec}>
          <p className={styles.ajustesSecTitulo}>Modo Escaparate (digital signage)</p>
          <div className={styles.ajustesFormGrid}>
            <div className={styles.ajustesFormField}>
              <label>Activar carrusel tras inactividad</label>
              <select
                value={ajustes.escaparate_timeout_segundos}
                onChange={e => cambiar('escaparate_timeout_segundos', Number(e.target.value))}
              >
                <option value={0}>Desactivado (nunca)</option>
                <option value={30}>30 segundos</option>
                <option value={60}>1 minuto (recomendado)</option>
                <option value={90}>1 min 30 s</option>
                <option value={120}>2 minutos</option>
                <option value={180}>3 minutos</option>
                <option value={300}>5 minutos</option>
              </select>
            </div>
          </div>
          <p style={{ fontSize: '.75rem', color: '#aaa', margin: '.5rem 0 0' }}>
            Si el kiosko lleva este tiempo sin interacción, entra en carrusel de vinos destacados a pantalla completa. Cualquier toque lo cierra. El modo manual (pulsación larga del logo) no se ve afectado por este ajuste.
          </p>
        </div>

        <div className={styles.ajustesSec}>
          <p className={styles.ajustesSecTitulo}>Pedido de mostrador</p>
          <button
            type="button"
            className={`${styles.settingToggleCard} ${styles.settingToggleCardDisabled}`}
            disabled
          >
            <span className={styles.settingToggleText}>
              <strong>En desarrollo</strong>
              <small>La creación de pedidos desde el carrito está pausada hasta cerrar bien el flujo operativo.</small>
            </span>
            <span className={styles.settingSwitch} aria-hidden="true">
              <span />
            </span>
          </button>
        </div>

        {/* Info tienda */}
        <div className={styles.ajustesSec}>
          <p className={styles.ajustesSecTitulo}>Información de la tienda</p>
          <div className={styles.ajustesFormGrid}>
            <div className={styles.ajustesFormField}>
              <label>Nombre de la tienda</label>
              <input value={ajustes.nombre} onChange={e => cambiar('nombre', e.target.value)} placeholder="Mi Vinoteca" />
            </div>
            <div className={styles.ajustesFormField}>
              <label>Ciudad</label>
              <input value={ajustes.ciudad} onChange={e => cambiar('ciudad', e.target.value)} placeholder="Madrid" />
            </div>
            <div className={styles.ajustesFormField}>
              <label>Descripción (aparece en la bienvenida del kiosko)</label>
              <textarea rows={3} value={ajustes.descripcion} onChange={e => cambiar('descripcion', e.target.value)}
                placeholder="Selección artesanal de los mejores vinos del mundo…" />
            </div>
          </div>
        </div>

        {/* Informe semanal */}
        {esPremium ? (
          <div className={styles.ajustesSec}>
            <p className={styles.ajustesSecTitulo}>Informe semanal por email <span className={styles.premiumTag}>Premium</span></p>
            <div className={styles.ajustesFormGrid}>
              <div className={styles.ajustesFormField}>
                <label>Email donde recibir el informe</label>
                <input
                  type="email"
                  value={ajustes.informe_email}
                  onChange={e => cambiar('informe_email', e.target.value)}
                  placeholder="propietario@tienda.com"
                />
              </div>
            </div>
            <p style={{ fontSize: '.75rem', color: '#aaa', margin: '.5rem 0 0' }}>
              Cada martes a las 8:00 recibirás un resumen con las búsquedas de la semana, los vinos más recomendados y alertas de stock. Deja el campo vacío para no recibir el informe.
            </p>
            {esAdmin && (
              <a href={`/kiosko-admin/${slug}/informes`} style={{ display: 'inline-block', marginTop: '.75rem', fontSize: '.78rem', color: '#c9a96e', textDecoration: 'underline' }}>
                Ver historial de informes →
              </a>
            )}
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <div style={{ opacity: .45, pointerEvents: 'none', userSelect: 'none' }}>
              <div className={styles.ajustesSec}>
                <p className={styles.ajustesSecTitulo}>Informe semanal por email</p>
                <div className={styles.ajustesFormGrid}>
                  <div className={styles.ajustesFormField}>
                    <label>Email donde recibir el informe</label>
                    <input type="email" disabled placeholder="Disponible en plan Premium" />
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => setAjustesUpgradeModal('informe')} style={{
              position: 'absolute', inset: 0, width: '100%', background: 'transparent',
              border: 'none', cursor: 'pointer',
            }} aria-label="Ver plan Premium" />
          </div>
        )}

        {/* Widget embebible — solo Premium */}
        {esPremium ? (
          <div className={styles.ajustesSec}>
            <p className={styles.ajustesSecTitulo}>Widget para tu web <span className={styles.premiumTag}>Premium</span></p>
            <p style={{ fontSize: '.78rem', color: '#888', margin: '0 0 .75rem' }}>
              Pega este código en cualquier web para añadir un botón flotante que abre el kiosko en un panel lateral.
            </p>
            {(() => {
              const base = typeof window !== 'undefined' ? window.location.origin : 'https://cataconjuanjo.com'
              const code = `<script src="${base}/api/kiosko/${slug}/widget"><\/script>`
              return (
                <div className={styles.widgetEmbedBox}>
                  <code className={styles.widgetEmbedCode}>{code}</code>
                  <button type="button" className={styles.widgetCopyBtn}
                    onClick={() => { navigator.clipboard?.writeText(code); }}>
                    Copiar
                  </button>
                </div>
              )
            })()}
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <div style={{ opacity: .45, pointerEvents: 'none', userSelect: 'none' }}>
              <div className={styles.ajustesSec}>
                <p className={styles.ajustesSecTitulo}>Widget para tu web</p>
                <p style={{ fontSize: '.78rem', color: '#888', margin: '0 0 .75rem' }}>
                  Añade el kiosko como botón flotante en tu web. Disponible en plan Premium.
                </p>
                <div className={styles.widgetEmbedBox}>
                  <code className={styles.widgetEmbedCode}>&lt;script src=&quot;...&quot;&gt;&lt;/script&gt;</code>
                </div>
              </div>
            </div>
            <button onClick={() => setAjustesUpgradeModal('widget')} style={{
              position: 'absolute', inset: 0, width: '100%', background: 'transparent',
              border: 'none', cursor: 'pointer',
            }} aria-label="Ver plan Premium" />
          </div>
        )}

        {/* Square — token por tienda */}
        <div className={styles.ajustesSec}>
          <p className={styles.ajustesSecTitulo}>
            Integración Square
            {tienda?.has_square_token
              ? <span style={{ marginLeft: 8, fontSize: '.75rem', color: '#4caf50' }}>✓ Configurado</span>
              : <span style={{ marginLeft: 8, fontSize: '.75rem', color: '#888' }}>Sin configurar</span>}
          </p>
          <p style={{ fontSize: '.78rem', color: '#888', margin: '0 0 .75rem' }}>
            Token de acceso de tu cuenta Square. Permite sincronizar el catálogo de esta tienda de forma independiente.
          </p>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <input
              type="password"
              placeholder={tienda?.has_square_token ? 'Introduce nuevo token para reemplazar' : 'EAAAl...'}
              value={squareTokenInput}
              onChange={e => setSquareTokenInput(e.target.value)}
              style={{ flex: 1, padding: '.5rem .75rem', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.06)', color: 'inherit', fontSize: '.85rem' }}
            />
            <button
              type="button"
              className={styles.btnSecundario}
              onClick={guardarSquareToken}
              disabled={guardandoSquare || !squareTokenInput.trim()}
            >
              {guardandoSquare ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          {squareMsg && <p style={{ fontSize: '.78rem', marginTop: '.5rem', color: squareMsg.startsWith('✓') ? '#4caf50' : '#e57373' }}>{squareMsg}</p>}
        </div>

        {/* Guardar */}
        <div className={styles.ajustesActions}>
          {msg && <span className={msg.startsWith('✓') ? styles.msgOk : styles.msgError}>{msg}</span>}
          <button type="button" className={styles.btnPrimario} onClick={guardar} disabled={guardando || subiendoLogo}>
            {guardando ? 'Guardando…' : 'Guardar ajustes'}
          </button>
        </div>

        {/* Cambiar contraseña */}
        <CambiarPassword />
      </div>

      {/* ── Preview en vivo ── */}
      <div className={styles.ajustesPreviewSticky}>
        <p className={styles.previewTitle}>Vista previa del kiosko</p>
        <div className={styles.previewBox} style={{ background: ajustes.color_primario, fontFamily: fontCss }}>
          {/* Cabecera */}
          <div className={styles.previewHeader}>
            {logoPreview
              ? <img src={logoPreview} alt="Logo" className={styles.previewLogo} />
              : <span className={styles.previewWine}>🍷</span>}
            <p className={styles.previewNombre} style={{ color: ajustes.color_acento }}>
              {ajustes.nombre || 'Tu Vinoteca'}
            </p>
            {ajustes.descripcion && (
              <p className={styles.previewDesc} style={{ color: textoMedio }}>
                {ajustes.descripcion.slice(0, 60)}{ajustes.descripcion.length > 60 ? '…' : ''}
              </p>
            )}
            <div className={styles.previewStats} style={{ color: textoMedio }}>
              <span>42 referencias</span>
              <span>·</span>
              <span>38 disponibles</span>
            </div>
          </div>

          {/* Tarjetas de acción — igual que el kiosko real */}
          <div className={styles.previewActions}>
            {PREVIEW_ACTIONS.map(a => (
              <div key={a.label} className={styles.previewActionCard}
                style={{ background: panelColor, border: `1px solid ${ajustes.color_acento}22` }}>
                <span
                  className={`${styles.previewActionIcon} ${ajustes.kiosko_icon_style === 'emoji' ? styles.previewActionIconEmoji : ''}`}
                  style={{ color: ajustes.color_acento }}
                >
                  {ajustes.kiosko_icon_style === 'lineal' ? <PreviewKioskIcon name={a.iconName} /> : a.icon}
                </span>
                <span className={styles.previewActionLabel} style={{ color: ajustes.color_acento }}>{a.label}</span>
              </div>
            ))}
          </div>

          {/* Strip destacados */}
          <div className={styles.previewFeaturedStrip}>
            <p className={styles.previewFeaturedLabel} style={{ color: ajustes.color_acento }}>★ Destacados</p>
            <div className={styles.previewFeaturedCards}>
              {['Ribera 2020','Albariño','Cava Brut'].map(n => (
                <div key={n} className={styles.previewFeaturedCard} style={{ background: panelColor }}>
                  <div className={styles.previewFeaturedThumb} style={{ background: `${ajustes.color_acento}22` }}>🍷</div>
                  <p className={styles.previewFeaturedNombre} style={{ color: textoColor }}>{n}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Crédito */}
          <p className={styles.previewCredit} style={{ color: textoMedio }}>
            Kiosko Virtual × @cataconjuanjo
          </p>
        </div>
      </div>
    </div>
    {ajustesUpgradeModal && <UpgradeModal feature={ajustesUpgradeModal} onClose={() => setAjustesUpgradeModal(null)} />}
    </>
  )
}

function TrialGate({ tienda, onCheckout, generandoCheckout }) {
  const [periodo, setPeriodo] = useState('mensual')
  const esAnual = periodo === 'anual'

  const precioPremiumMensual = tienda.precio_especial || 129
  const esEspecial           = !!tienda.precio_especial
  const ahorroPremiumAnual   = precioPremiumMensual * 2

  const precioBasico  = esAnual ? 590  : 59
  const precioPremium = esAnual ? precioPremiumMensual * 10 : precioPremiumMensual
  const sufijo        = esAnual ? '€/año' : '€/mes'

  // Setup fee: solo en Básico mensual; anual y Premium siempre lo incluyen
  const setupFeeBasico = !esAnual ? 100 : null

  function waMsg(plan) {
    const txt = encodeURIComponent(
      `Hola, acabo de probar el Kiosko Virtual de ${tienda.nombre || 'mi tienda'} y me interesa el plan ${plan} (facturación ${periodo}). ¿Cuándo podemos hablarlo?`
    )
    return `https://wa.me/${WHATSAPP_VENTAS}?text=${txt}`
  }

  return (
    <div className={styles.trialGate}>
      <p className={styles.trialGateTitle}>Tu prueba ha terminado 🍷</p>
      <p className={styles.trialGateDesc}>
        Has explorado el Kiosko Virtual al completo. Elige tu plan para seguir ofreciendo a tus clientes una experiencia premium.
      </p>

      {/* Toggle mensual / anual */}
      <div className={styles.trialPeriodoToggle}>
        <button
          className={`${styles.trialPeriodoBtn} ${!esAnual ? styles.trialPeriodoBtnActive : ''}`}
          onClick={() => setPeriodo('mensual')}
        >
          Mensual
        </button>
        <button
          className={`${styles.trialPeriodoBtn} ${esAnual ? styles.trialPeriodoBtnActive : ''}`}
          onClick={() => setPeriodo('anual')}
        >
          Anual <span className={styles.trialPeriodoBadge}>2 meses gratis</span>
        </button>
      </div>

      <div className={styles.trialGatePlans}>

        {/* Básico */}
        <div className={styles.trialPlanCard}>
          <p className={styles.trialPlanNombre}>Plan Básico</p>
          <p className={styles.trialPlanPrecio}>{precioBasico} <span style={{ fontSize: '1rem' }}>{sufijo}</span></p>
          {setupFeeBasico
            ? <p className={styles.trialPlanPrecioSub}>+ {setupFeeBasico} € puesta en marcha (pago único)</p>
            : <p className={styles.trialPlanPrecioSub}>Puesta en marcha incluida</p>
          }
          <ul className={styles.trialPlanFeatures}>
            <li>Kiosko digital táctil para tus clientes</li>
            <li>Catálogo completo con gestión de stock</li>
            <li>Asistente que ayuda a elegir según gusto y presupuesto</li>
            <li>Alta, edición y foto de cada vino desde el panel</li>
            <li>Importación masiva de catálogo por Excel</li>
            <li>Personalización total: colores, logo y banner</li>
            <li>Filtros y búsqueda avanzada en administración</li>
          </ul>
          <button disabled={generandoCheckout} onClick={() => onCheckout('basico')} className={`${styles.trialPlanCta} ${styles.trialPlanCtaSecundario}`}>{generandoCheckout ? 'Preparando pago…' : 'Quiero el Básico'}</button>
        </div>

        {/* Premium */}
        <div className={`${styles.trialPlanCard} ${styles.trialPlanCardPremium}`}>
          <span className={styles.trialPlanBadge}>Recomendado</span>
          <p className={styles.trialPlanNombre}>Plan Premium</p>
          <p className={styles.trialPlanPrecio}>{precioPremium} <span style={{ fontSize: '1rem' }}>{sufijo}</span></p>
          <p className={styles.trialPlanPrecioSub}>
            {esAnual
              ? `Ahorras ${ahorroPremiumAnual} € · Puesta en marcha incluida`
              : 'Puesta en marcha incluida'}
          </p>
          {esEspecial && (
            <span className={styles.trialPlanEspecial}>
              ★ Precio fundador · Bloqueado para siempre
            </span>
          )}
          <ul className={styles.trialPlanFeatures}>
            <li>Todo lo del plan Básico</li>
            <li>Fichas de vino generadas por IA</li>
            <li>Analítica completa de búsquedas y recomendaciones</li>
            <li>Cuadrante de rentabilidad (margen × popularidad)</li>
            <li>Tendencias de uso a 8 semanas</li>
            <li>Alertas de stock bajo en vinos muy recomendados</li>
            <li>Informe semanal automático cada lunes por email</li>
            <li>Badge de margen y coste visible en tu panel</li>
          </ul>
          <button disabled={generandoCheckout} onClick={() => onCheckout('premium')} className={styles.trialPlanCta}>{generandoCheckout ? 'Preparando pago…' : 'Quiero el Premium →'}</button>
        </div>
      </div>

      {esEspecial && (
        <p className={styles.trialGateFounderNote}>
          El precio de referencia para nuevos clientes es {esAnual ? '1.290' : '129'} €/{esAnual ? 'año' : 'mes'}.
          Como cliente fundador, tu precio queda fijado en {esAnual ? precioPremiumMensual * 10 : precioPremiumMensual} €/{esAnual ? 'año' : 'mes'}.
        </p>
      )}
    </div>
  )
}

const VINO_VACIO = {
  nombre:'', bodega:'', tipo:'', uva:'', anada:'', region:'', pais:'España',
  precio_pvp:'', precio_coste:'', precio_oferta:'', stock:'', stock_minimo:0, ubicacion_estanteria:'',
  foto_url:'', notas_cata:'', descripcion:'', puntuacion:'', destacado:false, activo:true,
}

const QUALITY_CHECKS = [
  { id: 'sin_foto', label: 'Sin foto', desc: 'La tarjeta publica pierde confianza.' },
  { id: 'sin_pvp', label: 'Sin PVP', desc: 'El cliente vuelve a preguntar precio.' },
  { id: 'sin_ubicacion', label: 'Sin ubicacion', desc: 'Cuesta encontrarlo en tienda.' },
  { id: 'sin_stock', label: 'Sin stock', desc: 'No aparece disponible para vender.' },
  { id: 'sin_texto', label: 'Sin texto de venta', desc: 'Falta descripcion, notas o ficha IA.' },
]

function hasText(value) {
  return String(value || '').trim().length > 0
}

function vinoTieneQualityIssue(vino, issueId) {
  if (!vino || vino.activo === false) return false
  switch (issueId) {
    case 'sin_foto':
      return !hasText(vino.foto_url)
    case 'sin_pvp':
      return !(Number(vino.precio_pvp) > 0)
    case 'sin_ubicacion':
      return !hasText(vino.ubicacion_estanteria)
    case 'sin_stock':
      return !(Number(vino.stock) > 0)
    case 'sin_texto':
      return !hasText(vino.descripcion) && !hasText(vino.notas_cata) && !vino.has_ficha_ia
    case 'pendientes':
      return QUALITY_CHECKS.some(check => vinoTieneQualityIssue(vino, check.id))
    default:
      return false
  }
}

function qualityIssuesForVino(vino) {
  return QUALITY_CHECKS.filter(check => vinoTieneQualityIssue(vino, check.id))
}

export default function AdminKioskoPage() {
  const { slug }       = useParams()
  const searchParams   = useSearchParams()
  const previewTrial   = searchParams.get('preview_trial') === '1'

  const checkoutOk     = searchParams.get('checkout') === 'ok'

  const [tienda, setTienda]         = useState(null)
  const [vinos, setVinos]           = useState([])
  const [cargando, setCargando]     = useState(true)
  const [error, setError]           = useState('')
  const [accesoDenegado, setAccesoDenegado] = useState(false)
  const [esAdminUsuario, setEsAdminUsuario] = useState(false)
  const [generandoCheckout, setGenerandoCheckout] = useState(false)
  const [esperandoWebhook, setEsperandoWebhook] = useState(false)

  const [modal, setModal]         = useState(null)  // null | 'nuevo' | vino
  const [form, setForm]           = useState(VINO_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg]             = useState('')
  const [fotoFileModal, setFotoFileModal] = useState(null)
  const [draggingFoto, setDraggingFoto]   = useState(false)
  const fotoInputModalRef = useRef(null)

  const [inlineEdit,   setInlineEdit]   = useState(null)  // { id, campo, valor }
  const [stockPending, setStockPending] = useState(null)  // { id, anterior, nuevo }

  const [subiendoFoto, setSubiendoFoto] = useState(null)  // vinoId
  const fotoInputFilaRef  = useRef(null)
  const fotoVinoTargetRef = useRef(null)

  const [tab, setTab]               = useState('catalogo')
  const [upgradeModal, setUpgradeModal] = useState(null)
  const [analitica, setAnalitica]   = useState(null)
  const [analiticaLoad, setAnaliticaLoad] = useState(false)
  const [embudo, setEmbudo]         = useState(null)
  const [embudoLoad, setEmbudoLoad] = useState(false)
  const [leads, setLeads]           = useState(null)
  const [leadsLoad, setLeadsLoad]   = useState(false)
  const [pedidos, setPedidos]       = useState(null)
  const [pedidosLoad, setPedidosLoad] = useState(false)
  const [pedidoMsg, setPedidoMsg]   = useState('')
  const [lastSync, setLastSync]     = useState(null) // { ultimoPagoAt, ultimoCatalogoAt }

  const esPremium = !tienda?.plan || tienda.plan === 'premium' || tienda.plan === 'trial'
  const pedidosMostradorActivos = tienda?.kiosko_orders_enabled === true && !COUNTER_ORDERS_IN_DEVELOPMENT
  const authHeaders = useMemo(
    () => tienda?._token ? { Authorization: `Bearer ${tienda._token}` } : {},
    [tienda?._token]
  )
  const jsonAuthHeaders = useMemo(
    () => ({ ...authHeaders, 'Content-Type': 'application/json' }),
    [authHeaders]
  )

  // ── Trial ──────────────────────────────────────────────────────────────────
  const [trialSegsRestantes, setTrialSegsRestantes] = useState(null)

  useEffect(() => {
    if (tienda?.plan !== 'trial') return
    if (previewTrial) return   // modo preview: no arranca el reloj
    if (esAdminUsuario) return // admin nunca consume el trial

    const LIMIT = 3600 // 1 hora

    // ── Nuevo sistema: trial_used_seconds (tiempo de uso real) ──────────────
    if (tienda.trial_used_seconds != null) {
      let localRemaining = Math.max(0, LIMIT - tienda.trial_used_seconds)
      setTrialSegsRestantes(localRemaining)
      if (localRemaining === 0) return // ya expirado

      // Tick local: solo decrementa cuando la pestaña está visible
      const tickIv = setInterval(() => {
        if (document.visibilityState === 'hidden') return
        localRemaining = Math.max(0, localRemaining - 1)
        setTrialSegsRestantes(localRemaining)
      }, 1000)

      // Heartbeat cada 30s: suma al servidor solo cuando está visible
      const PING_SECS = 30
      let sinceLastPing = 0 // en unidades de 5s
      const pingIv = setInterval(async () => {
        if (document.visibilityState === 'hidden') return
        sinceLastPing++
        if (sinceLastPing < PING_SECS / 5) return
        sinceLastPing = 0
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) return
          const res = await fetch(`/api/kiosko/${slug}/admin/trial-ping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ seconds: PING_SECS }),
          })
          if (!res.ok) return
          const data = await res.json()
          if (typeof data.trial_remaining_seconds === 'number') {
            // Sincronizar con el valor real del servidor
            localRemaining = Math.max(0, data.trial_remaining_seconds)
            setTrialSegsRestantes(localRemaining)
          }
        } catch { /* ignorar errores de red — el contador local sigue */ }
      }, 5000) // comprobamos cada 5s

      return () => { clearInterval(tickIv); clearInterval(pingIv) }
    }

    // ── Sistema antiguo: wall-clock via trial_expires_at (retrocompatibilidad) ──
    async function iniciarTrialAntiguo() {
      let expiresAt = tienda.trial_expires_at
      if (!expiresAt) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch(`/api/kiosko/${slug}/admin/trial-start`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const d = await res.json()
        expiresAt = d.trial_expires_at
      }
      if (!expiresAt) return
      function tick() {
        setTrialSegsRestantes(Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000)))
      }
      tick()
      return setInterval(tick, 1000)
    }
    let iv
    iniciarTrialAntiguo().then(interval => { iv = interval })
    return () => clearInterval(iv)
  }, [tienda?.plan, tienda?.trial_used_seconds, tienda?.trial_expires_at, slug, previewTrial, esAdminUsuario])

  const [busqueda, setBusqueda]           = useState('')
  const [verInactivos, setVerInactivos]         = useState(false)
  const [verInactivosOtros, setVerInactivosOtros] = useState(false)
  const [filtroOtrosCat, setFiltroOtrosCat]   = useState('todas')
  const [paginaOtros, setPaginaOtros]         = useState(1)
  const [porPaginaOtros, setPorPaginaOtros]   = useState(20)
  const [filtroTipo, setFiltroTipo]       = useState('')
  const [filtroEstado, setFiltroEstado]   = useState('todos')
  const [filtroRegion, setFiltroRegion]   = useState('')
  const [filtroPais, setFiltroPais]       = useState('')
  const [filtroStock, setFiltroStock]     = useState('todos')
  const [filtroCalidad, setFiltroCalidad] = useState('')
  const [precioMin, setPrecioMin]         = useState('')
  const [precioMax, setPrecioMax]         = useState('')
  const [ordenPor, setOrdenPor]           = useState('nombre')
  const [ordenDir, setOrdenDir]           = useState('asc')
  const [paginaActual, setPaginaActual]   = useState(1)
  const [porPagina, setPorPagina]         = useState(20)

  const [subTabAnalitica, setSubTabAnalitica] = useState('resumen')
  const [seleccionados, setSeleccionados]     = useState(new Set())

  const [filtroDestacado, setFiltroDestacado] = useState('todos')

  const [modalImport, setModalImport]     = useState(false)
  const [archivoImport, setArchivoImport] = useState(null)
  const [modoImport, setModoImport]       = useState('añadir')
  const [importando, setImportando]       = useState(false)
  const [resultImport, setResultImport]   = useState(null)
  const [draggingImport, setDraggingImport] = useState(false)
  const [squareSyncing, setSquareSyncing] = useState(false)
  const [squareSyncResult, setSquareSyncResult] = useState(null)
  const [squareStockSyncing, setSquareStockSyncing] = useState(false)

  const [moreMenuOpen, setMoreMenuOpen]         = useState(false)
  const moreMenuRef = useRef(null)
  const [filtrosPanelOpen, setFiltrosPanelOpen] = useState(false)
  const filtrosPanelRef = useRef(null)
  const [filtrosPanelOtrosOpen, setFiltrosPanelOtrosOpen] = useState(false)
  const filtrosPanelOtrosRef = useRef(null)
  const [busquedaOtros, setBusquedaOtros] = useState('')

  useEffect(() => { if (slug) cargar() }, [slug])

  // Polling silencioso: recarga el catálogo cada 30 s para reflejar sincronizaciones de Square
  const authHeadersRef = useRef({})
  useEffect(() => { authHeadersRef.current = authHeaders }, [authHeaders])
  useEffect(() => {
    if (!slug) return
    const iv = setInterval(async () => {
      const headers = authHeadersRef.current
      if (!headers.Authorization) return
      try {
        const res = await fetch(`/api/kiosko/${slug}/admin/vinos`, { headers })
        if (!res.ok) return
        const data = await res.json()
        setVinos(data.vinos || [])
      } catch {}
    }, 30_000)
    return () => clearInterval(iv)
  }, [slug])

  useEffect(() => { setPaginaActual(1) }, [busqueda, filtroTipo, filtroEstado, filtroCalidad, filtroDestacado, ordenPor, ordenDir, porPagina, verInactivos])
  useEffect(() => { setPaginaOtros(1) }, [filtroOtrosCat, busquedaOtros, porPaginaOtros, verInactivosOtros])

  useEffect(() => {
    if (!moreMenuOpen) return
    function h(e) { if (!moreMenuRef.current?.contains(e.target)) setMoreMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [moreMenuOpen])

  useEffect(() => {
    if (!filtrosPanelOpen) return
    function h(e) { if (!filtrosPanelRef.current?.contains(e.target)) setFiltrosPanelOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [filtrosPanelOpen])

  useEffect(() => {
    if (!filtrosPanelOtrosOpen) return
    function h(e) { if (!filtrosPanelOtrosRef.current?.contains(e.target)) setFiltrosPanelOtrosOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [filtrosPanelOtrosOpen])

  useEffect(() => {
    if (tab === 'pedidos' && tienda && (tienda.kiosko_orders_enabled !== true || COUNTER_ORDERS_IN_DEVELOPMENT)) setTab('catalogo')
  }, [tab, tienda])

  // Tras un pago exitoso, el webhook puede tardar unos segundos.
  // Si subscription_status sigue en 'pending', reintentamos cada 3s hasta 30s.
  useEffect(() => {
    if (!checkoutOk || !tienda) return
    if (tienda.subscription_status !== 'pending') return

    setEsperandoWebhook(true)
    let intentos = 0
    const intervalo = setInterval(async () => {
      intentos++
      const res = await fetch(`/api/kiosko/${slug}/meta`, { headers: authHeaders })
      if (res.ok) {
        const data = await res.json()
        if (data.tienda?.subscription_status !== 'pending') {
          clearInterval(intervalo)
          setEsperandoWebhook(false)
          await cargar()
        }
      }
      if (intentos >= 10) { clearInterval(intervalo); setEsperandoWebhook(false) }
    }, 3000)

    return () => clearInterval(intervalo)
  }, [authHeaders, checkoutOk, slug, tienda?.subscription_status])

  // ── Datos ──────────────────────────────────────────────────────────────────
  async function cargar() {
    setCargando(true); setError('')
    try {
      // Verificar sesión y acceso a esta tienda
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setAccesoDenegado(true)
        return
      }
      const meRes  = await fetch('/api/kiosko/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const meData = await meRes.json()
      const esAdmin  = isAdminEmail(session.user?.email)
      setEsAdminUsuario(esAdmin)
      const esPropio = meData.tienda?.slug === slug
      if (!esAdmin && !esPropio) {
        setAccesoDenegado(true)
        return
      }

      const requestHeaders = { Authorization: `Bearer ${session.access_token}` }
      const [r1, r2, r3] = await Promise.all([
        fetch(`/api/kiosko/${slug}/meta`, { headers: requestHeaders }),
        fetch(`/api/kiosko/${slug}/admin/vinos`, { headers: requestHeaders }),
        fetch(`/api/kiosko/${slug}/admin/last-sync`, { headers: requestHeaders }),
      ])
      if (!r1.ok) throw new Error('Tienda no encontrada')
      const meta = await r1.json()
      const dv   = await r2.json()
      if (r3.ok) { const ls = await r3.json(); setLastSync(ls) }
      setTienda({ ...meta.tienda, _token: session.access_token })
      setVinos(dv.vinos || [])
    } catch (e) { setError(e.message) }
    finally     { setCargando(false)  }
  }

  async function irACheckout(planElegido = 'premium') {
    if (previewTrial) { alert('Modo preview — el pago no se procesa. El cliente verá este flujo real.'); return }
    if (!tienda?._token) return
    setGenerandoCheckout(true)
    try {
      const res = await fetch(`/api/kiosko/${slug}/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tienda._token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planElegido }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else alert(data.error || 'No se pudo iniciar el pago. Contacta con soporte.')
    } catch {
      alert('Error de conexión. Inténtalo de nuevo.')
    }
    finally { setGenerandoCheckout(false) }
  }

  // ── Modal añadir / editar ──────────────────────────────────────────────────
  function abrirNuevo() {
    setForm(VINO_VACIO); setFotoFileModal(null); setModal('nuevo'); setMsg('')
  }

  function abrirEditar(v) {
    setForm({ ...VINO_VACIO, ...v }); setFotoFileModal(null); setModal(v); setMsg('')
  }

  function cerrarModal() {
    if (form.foto_url?.startsWith('blob:')) URL.revokeObjectURL(form.foto_url)
    setModal(null); setForm(VINO_VACIO); setFotoFileModal(null); setMsg('')
  }

  function cambiar(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }

  async function guardar() {
    if (!form.nombre.trim()) return setMsg('El nombre es obligatorio')
    setGuardando(true); setMsg('')
    try {
      const esNuevo = modal === 'nuevo'
      const url     = esNuevo
        ? `/api/kiosko/${slug}/admin/vinos`
        : `/api/kiosko/${slug}/admin/vinos/${modal.id}`

      const fotoUrl = form.foto_url?.startsWith('blob:') ? null : (form.foto_url?.trim() || null)

      const res = await fetch(url, {
        method:  esNuevo ? 'POST' : 'PATCH',
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          ...form,
          foto_url:     fotoUrl,
          precio_pvp:   form.precio_pvp   ? Number(form.precio_pvp)   : null,
          precio_coste: form.precio_coste ? Number(form.precio_coste) : null,
          stock:        form.stock        ? Number(form.stock)        : 0,
          puntuacion:   form.puntuacion   ? Number(form.puntuacion)   : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')

      // Subir foto pendiente si nuevo modo
      if (esNuevo && fotoFileModal && data.vino?.id) {
        await subirFoto(data.vino.id, fotoFileModal)
      }

      setMsg(esNuevo ? '✓ Vino añadido' : '✓ Cambios guardados')
      await cargar()
      setTimeout(cerrarModal, 800)
    } catch (e) { setMsg(e.message) }
    finally     { setGuardando(false) }
  }

  async function duplicar() {
    if (!form.nombre.trim()) return setMsg('El nombre es obligatorio')
    setGuardando(true); setMsg('')
    try {
      const { id: _id, square_catalog_id: _sq, ficha_ia: _fi, ...rest } = form
      const fotoUrl = form.foto_url?.startsWith('blob:') ? null : (form.foto_url?.trim() || null)
      const res = await fetch(`/api/kiosko/${slug}/admin/vinos`, {
        method: 'POST',
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          ...rest,
          nombre:        `${form.nombre} (copia)`,
          foto_url:      fotoUrl,
          precio_pvp:    form.precio_pvp    ? Number(form.precio_pvp)    : null,
          precio_coste:  form.precio_coste  ? Number(form.precio_coste)  : null,
          precio_oferta: form.precio_oferta ? Number(form.precio_oferta) : null,
          stock:         form.stock         ? Number(form.stock)         : 0,
          stock_minimo:  form.stock_minimo  ? Number(form.stock_minimo)  : 0,
          puntuacion:    form.puntuacion    ? Number(form.puntuacion)    : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al duplicar')
      setMsg('✓ Vino duplicado')
      await cargar()
      setTimeout(cerrarModal, 800)
    } catch (e) { setMsg(e.message) }
    finally { setGuardando(false) }
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este vino?')) return
    await fetch(`/api/kiosko/${slug}/admin/vinos/${id}`, { method: 'DELETE', headers: authHeaders })
    setVinos(prev => prev.filter(v => v.id !== id))
  }

  // ── Inline edit ────────────────────────────────────────────────────────────
  function startInline(id, campo, valorActual, e) {
    e?.stopPropagation()
    setInlineEdit({ id, campo, valor: valorActual ?? '' })
  }

  async function guardarInline() {
    if (!inlineEdit) return
    const { id, campo, valor } = inlineEdit
    setInlineEdit(null)

    const numericos  = ['precio_pvp', 'precio_coste', 'precio_oferta', 'stock', 'puntuacion']
    const valorFinal = numericos.includes(campo)
      ? (valor !== '' && valor !== null ? Number(valor) : (campo === 'stock' ? 0 : null))
      : (String(valor).trim() || null)

    if (campo === 'stock') {
      const anterior = vinos.find(v => v.id === id)?.stock ?? 0
      if (valorFinal === anterior) return
      setStockPending({ id, anterior, nuevo: valorFinal })
      return
    }

    const res = await fetch(`/api/kiosko/${slug}/admin/vinos/${id}`, {
      method:  'PATCH',
      headers: jsonAuthHeaders,
      body: JSON.stringify({ [campo]: valorFinal }),
    })
    if (res.ok) {
      setVinos(prev => prev.map(v => v.id === id ? { ...v, [campo]: valorFinal } : v))
    }
  }

  async function confirmarStock() {
    if (!stockPending) return
    const { id, anterior, nuevo } = stockPending
    setStockPending(null)
    const vino    = vinos.find(v => v.id === id)
    const updates = {
      stock: nuevo,
      ...(nuevo === 0 ? { activo: false } : {}),
      ...(nuevo > 0 && !vino?.activo ? { activo: true } : {}),
    }
    const res = await fetch(`/api/kiosko/${slug}/admin/vinos/${id}`, {
      method:  'PATCH',
      headers: jsonAuthHeaders,
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      setVinos(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v))
      // Log historial
      fetch(`/api/kiosko/${slug}/admin/stock-log`, {
        method: 'POST', headers: jsonAuthHeaders,
        body: JSON.stringify({ vino_id: id, vino_nombre: vino?.nombre, stock_anterior: anterior, stock_nuevo: nuevo }),
      }).catch(() => {})
      // Alerta instantánea si stock bajo
      if (nuevo <= 3) {
        fetch(`/api/kiosko/${slug}/admin/alerta-stock`, {
          method: 'POST', headers: jsonAuthHeaders,
          body: JSON.stringify({ vino_nombre: vino?.nombre || id, stock_nuevo: nuevo }),
        }).catch(() => {})
      }
    }
  }

  function cancelarStock() { setStockPending(null) }

  // ── Toggle ─────────────────────────────────────────────────────────────────
  async function toggleCampo(id, campo, valorActual) {
    const nuevo = !valorActual
    const res = await fetch(`/api/kiosko/${slug}/admin/vinos/${id}`, {
      method:  'PATCH',
      headers: jsonAuthHeaders,
      body: JSON.stringify({ [campo]: nuevo }),
    })
    if (res.ok) {
      setVinos(prev => prev.map(v => v.id === id ? { ...v, [campo]: nuevo } : v))
    }
  }

  // ── Foto en fila de tabla ──────────────────────────────────────────────────
  function abrirFotoFila(vinoId) {
    fotoVinoTargetRef.current = vinoId
    fotoInputFilaRef.current?.click()
  }

  async function subirFoto(vinoId, file) {
    if (!file) return null
    setSubiendoFoto(vinoId)
    try {
      const fd = new FormData()
      fd.append('foto', file)
      fd.append('vinoId', vinoId)
      const res  = await fetch(`/api/kiosko/${slug}/admin/upload-foto`, { method: 'POST', headers: authHeaders, body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al subir foto')
      setVinos(prev => prev.map(v => v.id === vinoId ? { ...v, foto_url: data.url } : v))
      return data.url
    } catch (e) { alert(e.message); return null }
    finally     { setSubiendoFoto(null) }
  }

  async function onFileFotoFila(e) {
    const file   = e.target.files?.[0]
    const vinoId = fotoVinoTargetRef.current
    if (file && vinoId) await subirFoto(vinoId, file)
    e.target.value = ''
  }

  // ── Foto en modal ──────────────────────────────────────────────────────────
  async function onFileFotoModal(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (form.foto_url?.startsWith('blob:')) URL.revokeObjectURL(form.foto_url)

    if (modal === 'nuevo') {
      setFotoFileModal(file)
      cambiar('foto_url', URL.createObjectURL(file))
    } else {
      setSubiendoFoto(modal.id)
      const url = await subirFoto(modal.id, file)
      if (url) cambiar('foto_url', url)
    }
  }

  function onDropFotoModal(e) {
    e.preventDefault(); setDraggingFoto(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFileFotoModal({ target: { files: [file], value: '' } })
  }

  async function eliminarFotoModal() {
    if (!form.foto_url) return
    if (modal !== 'nuevo') {
      await fetch(`/api/kiosko/${slug}/admin/upload-foto`, {
        method: 'DELETE',
        headers: jsonAuthHeaders,
        body: JSON.stringify({ vinoId: modal.id }),
      })
    }
    if (form.foto_url?.startsWith('blob:')) URL.revokeObjectURL(form.foto_url)
    cambiar('foto_url', '')
    setFotoFileModal(null)
  }

  // ── Sync Square manual ────────────────────────────────────────────────────
  async function syncSquare() {
    setSquareSyncing(true); setSquareSyncResult(null)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)
    try {
      const res  = await fetch(`/api/kiosko/${slug}/admin/square-sync`, { method: 'POST', headers: authHeaders, signal: controller.signal })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al sincronizar')
      setSquareSyncResult(data)
      await cargar()
    } catch (e) {
      setSquareSyncResult({ error: e.name === 'AbortError' ? 'Tiempo de espera agotado (>25 s)' : e.message })
    } finally {
      clearTimeout(timer)
      setSquareSyncing(false)
    }
  }

  // ── Sync completo: catálogo + stock ───────────────────────────────────────
  async function syncSquareFull() {
    setSquareSyncing(true); setSquareSyncResult(null)
    try {
      // 1. Catálogo
      const catRes = await fetch(`/api/kiosko/${slug}/admin/square-sync`, { method: 'POST', headers: authHeaders })
      const catData = await catRes.json()
      if (!catRes.ok) throw new Error(catData.error || 'Error al importar catálogo')
      // 2. Stock
      setSquareSyncing(false); setSquareStockSyncing(true)
      const stockRes = await fetch(`/api/kiosko/${slug}/admin/square-sync?reconcileStock=1`, { method: 'POST', headers: authHeaders })
      const stockData = await stockRes.json()
      if (!stockRes.ok) throw new Error(stockData.error || 'Error al sincronizar stock')
      setSquareSyncResult({
        insertados: catData.insertados ?? 0,
        actualizados: (catData.actualizados ?? 0) + (stockData.actualizados ?? 0),
        stockSincronizados: stockData.stockSincronizados ?? stockData.actualizados ?? 0,
      })
      await cargar()
    } catch (e) {
      setSquareSyncResult({ error: e.message })
    } finally {
      setSquareSyncing(false); setSquareStockSyncing(false)
    }
  }

  // ── Sync Stock Square ─────────────────────────────────────────────────────
  async function syncStockSquare() {
    setSquareStockSyncing(true)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 180_000)
    try {
      const res = await fetch(`/api/kiosko/${slug}/admin/square-sync?reconcileStock=1`, { method: 'POST', headers: authHeaders, signal: controller.signal })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al sincronizar stock')
      const { actualizados = 0, stockSincronizados = 0 } = data
      setSquareSyncResult({ insertados: 0, actualizados, stockSincronizados })
      await cargar()
    } catch (e) {
      setSquareSyncResult({ error: e.name === 'AbortError' ? 'Tiempo de espera agotado' : e.message })
    } finally {
      clearTimeout(timer)
      setSquareStockSyncing(false)
    }
  }

  // ── Importar ───────────────────────────────────────────────────────────────
  async function importar() {
    if (!archivoImport) return
    setImportando(true); setResultImport(null)
    const fd = new FormData()
    fd.append('file', archivoImport)
    fd.append('reemplazar', modoImport === 'reemplazar' ? '1' : '0')
    fd.append('modo', modoImport)
    try {
      const res  = await fetch(`/api/kiosko/${slug}/admin/importar`, { method: 'POST', headers: authHeaders, body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al importar')
      setResultImport(data)
      await cargar()
    } catch (e) { setResultImport({ error: e.message }) }
    finally     { setImportando(false) }
  }

  function cerrarImport() {
    setModalImport(false); setArchivoImport(null); setResultImport(null); setModoImport('añadir')
  }

  function onDropImport(e) {
    e.preventDefault(); setDraggingImport(false)
    const file = e.dataTransfer.files?.[0]
    if (file) setArchivoImport(file)
  }

  // ── Split por categoría ────────────────────────────────────────────────────
  const vinosVino  = useMemo(() => vinos.filter(v => v.categoria !== 'otro' && v.categoria !== 'carta'), [vinos])
  const vinosOtro  = useMemo(() => vinos.filter(v => v.categoria === 'otro' || v.categoria === 'carta'), [vinos])
  const usaSquare  = useMemo(() => vinos.some(v => v.square_catalog_id), [vinos])

  const otrosConCat     = useMemo(() => vinosOtro.map(v => ({ ...v, catAuto: v.cat_gourmet || detectarCatGourmet(v.nombre, v.descripcion) })), [vinosOtro])
  const categoriasOtros = useMemo(() => [...new Set(otrosConCat.map(v => v.catAuto))].sort(), [otrosConCat])
  const nInactivosOtros = useMemo(() => otrosConCat.filter(v => v.activo === false).length, [otrosConCat])
  const otrosFiltrados  = useMemo(() => {
    let r = filtroOtrosCat === 'todas' ? otrosConCat : otrosConCat.filter(v => v.catAuto === filtroOtrosCat)
    if (!verInactivosOtros) r = r.filter(v => v.activo !== false)
    if (busquedaOtros) { const q = busquedaOtros.toLowerCase(); r = r.filter(v => [v.nombre, v.descripcion].filter(Boolean).join(' ').toLowerCase().includes(q)) }
    return r
  }, [otrosConCat, filtroOtrosCat, busquedaOtros, verInactivosOtros])
  const totalPaginasOtros = Math.ceil(otrosFiltrados.length / porPaginaOtros)
  const otrosPaginados    = useMemo(() => { const s = (paginaOtros - 1) * porPaginaOtros; return otrosFiltrados.slice(s, s + porPaginaOtros) }, [otrosFiltrados, paginaOtros, porPaginaOtros])

  // ── Filtros (solo aplican al tab Catálogo / vinos) ─────────────────────────
  const regiones = useMemo(() => [...new Set(vinosVino.map(v => v.region).filter(Boolean))].sort(), [vinosVino])
  const paises   = useMemo(() => [...new Set(vinosVino.map(v => v.pais).filter(Boolean))].sort(), [vinosVino])

  const vinosFiltrados = useMemo(() => {
    return vinosVino
      .filter(v => {
        if (!verInactivos && filtroEstado !== 'inactivo' && v.activo === false) return false
        if (filtroTipo      && v.tipo   !== filtroTipo)   return false
        if (filtroEstado === 'activo'   && !v.activo)     return false
        if (filtroEstado === 'inactivo' &&  v.activo)     return false
        if (filtroRegion    && v.region !== filtroRegion) return false
        if (filtroPais      && v.pais   !== filtroPais)   return false
        if (filtroStock === 'sin' && Number(v.stock) > 0) return false
        if (filtroStock === 'con' && !(Number(v.stock) > 0)) return false
        if (filtroCalidad && !vinoTieneQualityIssue(v, filtroCalidad)) return false
        if (filtroDestacado === 'destacado' && !v.destacado) return false
        if (filtroDestacado === 'sin_foto'  && v.foto_url)   return false
        if (filtroDestacado === 'sin_ia'    && v.has_ficha_ia) return false
        if (precioMin !== '' && Number(v.precio_pvp || 0) < Number(precioMin)) return false
        if (precioMax !== '' && Number(v.precio_pvp || 0) > Number(precioMax)) return false
        if (!busqueda) return true
        const q = busqueda.toLowerCase()
        return [v.nombre, v.bodega, v.tipo, v.uva, v.region, v.pais, v.notas_cata, v.descripcion, v.ubicacion_estanteria]
          .filter(Boolean).join(' ').toLowerCase().includes(q)
      })
      .sort((a, b) => {
        let va, vb
        if (ordenPor === 'margen') {
          va = Number(a.precio_pvp) > 0 && Number(a.precio_coste) > 0 ? (Number(a.precio_pvp) - Number(a.precio_coste)) / Number(a.precio_pvp) : -1
          vb = Number(b.precio_pvp) > 0 && Number(b.precio_coste) > 0 ? (Number(b.precio_pvp) - Number(b.precio_coste)) / Number(b.precio_pvp) : -1
        } else {
          va = a[ordenPor]; vb = b[ordenPor]
          if (['precio_pvp', 'precio_coste', 'precio_oferta', 'stock', 'puntuacion'].includes(ordenPor)) {
            va = Number(va) || 0; vb = Number(vb) || 0
          } else {
            va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase()
          }
        }
        if (va < vb) return ordenDir === 'asc' ? -1 : 1
        if (va > vb) return ordenDir === 'asc' ? 1 : -1
        return 0
      })
  }, [vinosVino, filtroTipo, filtroEstado, filtroRegion, filtroPais, filtroStock, filtroCalidad, filtroDestacado, precioMin, precioMax, busqueda, ordenPor, ordenDir, verInactivos])

  const totalPaginas   = Math.ceil(vinosFiltrados.length / porPagina)
  const vinosPaginados = useMemo(() => {
    const start = (paginaActual - 1) * porPagina
    return vinosFiltrados.slice(start, start + porPagina)
  }, [vinosFiltrados, paginaActual, porPagina])

  const hayFiltrosActivos = filtroTipo || filtroEstado !== 'todos' || filtroRegion || filtroPais ||
    filtroStock !== 'todos' || filtroCalidad || filtroDestacado !== 'todos' || precioMin !== '' || precioMax !== '' || busqueda

  const filtrosActivosCount = [
    filtroTipo !== '', filtroEstado !== 'todos', filtroRegion !== '', filtroPais !== '',
    filtroStock !== 'todos', filtroDestacado !== 'todos', precioMin !== '', precioMax !== '',
  ].filter(Boolean).length

  function limpiarFiltros() {
    setBusqueda(''); setFiltroTipo(''); setFiltroEstado('todos')
    setFiltroRegion(''); setFiltroPais(''); setFiltroStock('todos')
    setFiltroCalidad(''); setFiltroDestacado('todos'); setPrecioMin(''); setPrecioMax('')
  }

  function aplicarFiltroCalidad(issueId) {
    setBusqueda('')
    setFiltroTipo('')
    setFiltroEstado('todos')
    setFiltroRegion('')
    setFiltroPais('')
    setFiltroStock('todos')
    setFiltroDestacado('todos')
    setPrecioMin('')
    setPrecioMax('')
    setFiltroCalidad(issueId)
    setOrdenPor('nombre')
    setOrdenDir('asc')
  }

  function sortHead(campo) {
    if (ordenPor === campo) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdenPor(campo); setOrdenDir('asc') }
  }

  function sortArrow(campo) {
    if (ordenPor !== campo) return ' ↕'
    return ordenDir === 'asc' ? ' ↑' : ' ↓'
  }

  // Stats (memoizadas — solo sobre vinos, no otros productos)
  const { sinFoto, sinPrecio, sinCoste, sinStock, nActivos, nInactivos, nDestacados, conFichaIA } = useMemo(() => ({
    sinFoto:     vinosVino.filter(v => v.activo !== false && !v.foto_url).length,
    sinPrecio:   vinosVino.filter(v => v.activo !== false && !v.precio_pvp).length,
    sinCoste:    vinosVino.filter(v => v.activo !== false && v.precio_pvp && !v.precio_coste).length,
    sinStock:    vinosVino.filter(v => v.activo !== false && !Number(v.stock)).length,
    nActivos:    vinosVino.filter(v => v.activo).length,
    nInactivos:  vinosVino.filter(v => v.activo === false).length,
    nDestacados: vinosVino.filter(v => v.destacado).length,
    conFichaIA:  vinosVino.filter(v => v.has_ficha_ia).length,
  }), [vinosVino])

  const catalogoChecklist = useMemo(() => {
    const activos = vinosVino.filter(v => v.activo !== false)
    const checks = QUALITY_CHECKS.map(check => {
      const afectados = activos.filter(v => vinoTieneQualityIssue(v, check.id))
      return { ...check, count: afectados.length, afectados }
    })
    const pendientesIds = new Set()
    checks.forEach(check => check.afectados.forEach(v => pendientesIds.add(v.id)))
    const pendientes = pendientesIds.size
    const score = activos.length ? Math.max(0, Math.round(((activos.length - pendientes) / activos.length) * 100)) : 100
    return { activos: activos.length, checks, pendientes, score }
  }, [vinosVino])

  const vinosPorId = useMemo(() => {
    const map = new Map()
    vinos.forEach(v => map.set(String(v.id), v))
    return map
  }, [vinos])

  async function cargarAnalitica() {
    setAnaliticaLoad(true)
    try {
      const res  = await fetch(`/api/kiosko/${slug}/admin/analitica`, { headers: authHeaders })
      const data = await res.json()
      setAnalitica(res.ok ? data : { vacio: true })
    } catch { setAnalitica({ vacio: true }) }
    finally { setAnaliticaLoad(false) }
  }

  async function cargarEmbudo() {
    setEmbudoLoad(true)
    try {
      const res  = await fetch(`/api/kiosko/${slug}/admin/embudo`, { headers: authHeaders })
      const data = await res.json()
      setEmbudo(res.ok ? data : null)
    } catch { setEmbudo(null) }
    finally { setEmbudoLoad(false) }
  }

  async function cargarLeads() {
    setLeadsLoad(true)
    try {
      const res  = await fetch(`/api/kiosko/${slug}/admin/leads`, { headers: authHeaders })
      const data = await res.json()
      setLeads(res.ok ? data.leads : [])
    } catch { setLeads([]) }
    finally { setLeadsLoad(false) }
  }

  async function borrarLead(id) {
    if (!confirm('¿Eliminar este lead? El email se borrará permanentemente (RGPD).')) return
    await fetch(`/api/kiosko/${slug}/admin/leads?id=${id}`, { method: 'DELETE', headers: authHeaders })
    setLeads(prev => prev.filter(l => l.id !== id))
  }

  async function cargarPedidos() {
    setPedidosLoad(true)
    setPedidoMsg('')
    try {
      const res = await fetch(`/api/kiosko/${slug}/admin/pedidos`, { headers: authHeaders })
      const data = await res.json()
      setPedidos(res.ok ? data : { pendiente: false, pedidos: [], resumen: { total: 0, abiertos: 0, nuevos: 0, totalImporte: 0 } })
    } catch {
      setPedidos({ pendiente: false, pedidos: [], resumen: { total: 0, abiertos: 0, nuevos: 0, totalImporte: 0 } })
    } finally {
      setPedidosLoad(false)
    }
  }

  async function cambiarEstadoPedido(id, status) {
    setPedidoMsg('')
    const anterior = pedidos
    setPedidos(prev => {
      if (!prev) return prev
      const lista = (prev.pedidos || []).map(p => p.id === id ? { ...p, status } : p)
      const abiertos = lista.filter(p => ['nuevo', 'preparando'].includes(p.status)).length
      const nuevos = lista.filter(p => p.status === 'nuevo').length
      const totalImporte = lista.reduce((sum, p) => sum + Number(p.total || 0), 0)
      return { ...prev, pedidos: lista, resumen: { total: lista.length, abiertos, nuevos, totalImporte } }
    })
    try {
      const res = await fetch(`/api/kiosko/${slug}/admin/pedidos`, {
        method: 'PATCH',
        headers: jsonAuthHeaders,
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'No se pudo actualizar el pedido')
    } catch (error) {
      setPedidos(anterior)
      setPedidoMsg(error.message || 'No se pudo actualizar el pedido')
    }
  }

  const rentabilidad = useMemo(() => {
    const conCoste = vinos.filter(v => v.activo && Number(v.precio_pvp) > 0 && Number(v.precio_coste) > 0)
    if (conCoste.length < 2) return null
    // Ventas Square como eje de popularidad; si no hay aún, fallback a recomendaciones IA
    const ventasSquare = analitica?.ventasPorVino || {}
    const hayVentasSquare = Object.keys(ventasSquare).length > 0
    const popularidad = {}
    if (hayVentasSquare) {
      Object.entries(ventasSquare).forEach(([id, uds]) => { popularidad[id] = uds })
    } else if (analitica?.topVinos) {
      analitica.topVinos.forEach(v => { popularidad[String(v.id)] = v.veces })
    }
    const calculados = conCoste.map(v => ({
      id: v.id, nombre: v.nombre, bodega: v.bodega, tipo: v.tipo,
      margenPct: Math.round(((Number(v.precio_pvp) - Number(v.precio_coste)) / Number(v.precio_pvp)) * 100),
      ventas: popularidad[String(v.id)] || 0,
    }))
    const margenMedio = calculados.reduce((s, v) => s + v.margenPct, 0) / calculados.length
    const totalVentas = calculados.reduce((s, v) => s + v.ventas, 0)
    if (totalVentas < 20) return { clasificados: [], margenMedio: Math.round(margenMedio), recomMedio: 0, sinCoste: vinos.filter(v => v.activo && v.precio_pvp && !v.precio_coste).length, coldStart: true, usandoVentas: hayVentasSquare }
    const ventasMedio = totalVentas / calculados.length
    const clasificados = calculados.map(v => ({
      ...v,
      categoria: v.margenPct >= margenMedio && v.ventas >= ventasMedio ? 'estrella'
        : v.margenPct <  margenMedio && v.ventas >= ventasMedio ? 'caballo'
        : v.margenPct >= margenMedio && v.ventas <  ventasMedio ? 'joya'
        : 'revisar',
    }))
    return { clasificados, margenMedio: Math.round(margenMedio), ventasMedio: Math.round(ventasMedio), sinCoste: vinos.filter(v => v.activo && v.precio_pvp && !v.precio_coste).length, coldStart: false, usandoVentas: hayVentasSquare }
  }, [vinos, analitica])

  const alertasStock = useMemo(() => {
    // Incluye vinos bajo su mínimo aunque no aparezcan en topVinos (Square)
    const vistos = new Set()
    const alertas = []

    // 1. Vinos con mínimo configurado que están por debajo
    vinos.forEach(v => {
      if (!v.activo) return
      const stock = Number(v.stock ?? 0)
      const minimo = Number(v.stock_minimo ?? 0)
      if (minimo > 0 && stock <= minimo) {
        vistos.add(String(v.id))
        alertas.push({ id: v.id, nombre: v.nombre, bodega: v.bodega, stock, minimo, recomendaciones: 0, critico: stock === 0, diasRestantes: null, porMinimo: true })
      }
    })

    // 2. Vinos de topVinos con stock bajo (lógica anterior)
    if (analitica?.topVinos?.length) {
      analitica.topVinos.forEach(tv => {
        if (vistos.has(String(tv.id))) return
        const v = vinos.find(w => String(w.id) === String(tv.id))
        if (!v || !v.activo) return
        const stock = Number(v.stock ?? 0)
        if (stock > 5 && (tv.diasRestantes === null || tv.diasRestantes > 14)) return
        alertas.push({ id: v.id, nombre: v.nombre, bodega: v.bodega, stock, minimo: Number(v.stock_minimo ?? 0), recomendaciones: tv.veces, critico: stock === 0, diasRestantes: tv.diasRestantes, porMinimo: false })
      })
    }

    return alertas.sort((a, b) => (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999) || b.recomendaciones - a.recomendaciones)
  }, [vinos, analitica])

  const accionesAnalitica = useMemo(() => {
    if (!analitica || analitica.vacio) return []
    const acciones = []
    const usados = new Set()
    const add = accion => {
      if (!accion?.key || usados.has(accion.key)) return
      usados.add(accion.key)
      acciones.push(accion)
    }

    const topVinos = (analitica.topVinos || [])
      .map(tv => ({ ...tv, vino: vinosPorId.get(String(tv.id)) }))
      .filter(tv => tv.vino)

    alertasStock.slice(0, 2).forEach(a => add({
      key: `stock-${a.id}`,
      tone: a.critico ? 'danger' : 'warn',
      badge: a.critico ? 'Stock crítico' : 'Stock bajo',
      title: `Reponer ${a.nombre}`,
      desc: `${a.recomendaciones} recomendaciones en 30 días${a.stock === 0 ? ' y sin stock disponible.' : ` y solo ${a.stock} ud. en tienda.`}`,
      cta: 'Actualizar stock',
      kind: 'edit',
      vinoId: a.id,
    }))

    const demandadoSinDestacar = topVinos.find(tv => tv.vino.activo && !tv.vino.destacado)
    if (demandadoSinDestacar) add({
      key: `destacar-${demandadoSinDestacar.vino.id}`,
      tone: 'opportunity',
      badge: 'Demanda',
      title: `Destacar ${demandadoSinDestacar.vino.nombre}`,
      desc: `Sale en ${demandadoSinDestacar.veces} recomendaciones y aún no aparece como destacado.`,
      cta: 'Destacar ahora',
      kind: 'destacar',
      vinoId: demandadoSinDestacar.vino.id,
    })

    const demandadoSinFoto = topVinos.find(tv => tv.vino.activo && !hasText(tv.vino.foto_url))
    if (demandadoSinFoto) add({
      key: `foto-${demandadoSinFoto.vino.id}`,
      tone: 'warn',
      badge: 'Ficha incompleta',
      title: `Añadir foto a ${demandadoSinFoto.vino.nombre}`,
      desc: 'Es un vino que el asistente propone; una tarjeta sin foto pierde confianza en el kiosko.',
      cta: 'Abrir ficha',
      kind: 'edit',
      vinoId: demandadoSinFoto.vino.id,
    })

    const movilSinUbicacion = (analitica.movil?.topVinos || [])
      .map(tv => ({ ...tv, vino: vinosPorId.get(String(tv.id)) }))
      .find(tv => tv.vino && tv.vino.activo && !hasText(tv.vino.ubicacion_estanteria))
    if (movilSinUbicacion) add({
      key: `ubicacion-${movilSinUbicacion.vino.id}`,
      tone: 'opportunity',
      badge: 'Caja / sala',
      title: `Ubicar ${movilSinUbicacion.vino.nombre}`,
      desc: `Los clientes se lo llevan al móvil, pero no tiene estantería para encontrarlo rápido.`,
      cta: 'Añadir ubicación',
      kind: 'edit',
      vinoId: movilSinUbicacion.vino.id,
    })

    const joya = rentabilidad?.clasificados?.find(v => v.categoria === 'joya' && !vinosPorId.get(String(v.id))?.destacado)
    if (joya) add({
      key: `joya-${joya.id}`,
      tone: 'opportunity',
      badge: 'Margen alto',
      title: `Dar visibilidad a ${joya.nombre}`,
      desc: `${joya.margenPct}% de margen y pocas recomendaciones: buen candidato para destacar.`,
      cta: 'Destacar',
      kind: 'destacar',
      vinoId: joya.id,
    })

    const caballo = rentabilidad?.clasificados?.find(v => v.categoria === 'caballo')
    if (caballo) add({
      key: `margen-${caballo.id}`,
      tone: 'warn',
      badge: 'Margen bajo',
      title: `Revisar precio de ${caballo.nombre}`,
      desc: `${caballo.recomendaciones} recomendaciones y ${caballo.margenPct}% de margen: vende interes, pero cuida rentabilidad.`,
      cta: 'Editar precio',
      kind: 'edit',
      vinoId: caballo.id,
    })

    return acciones.slice(0, 5)
  }, [alertasStock, analitica, rentabilidad, vinosPorId])

  function toggleSeleccion(id) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSeleccionTodos() {
    if (vinosPaginados.every(v => seleccionados.has(v.id))) {
      setSeleccionados(prev => { const n = new Set(prev); vinosPaginados.forEach(v => n.delete(v.id)); return n })
    } else {
      setSeleccionados(prev => { const n = new Set(prev); vinosPaginados.forEach(v => n.add(v.id)); return n })
    }
  }

  async function accionMasiva(campo, valor) {
    const ids = [...seleccionados]
    await Promise.all(ids.map(id =>
      fetch(`/api/kiosko/${slug}/admin/vinos/${id}`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ [campo]: valor }),
      })
    ))
    setSeleccionados(new Set())
    await cargar()
  }

  async function eliminarMasivo() {
    if (!confirm(`¿Eliminar ${seleccionados.size} vinos? Esta acción no se puede deshacer.`)) return
    await Promise.all([...seleccionados].map(id =>
      fetch(`/api/kiosko/${slug}/admin/vinos/${id}`, { method: 'DELETE', headers: authHeaders })
    ))
    setSeleccionados(new Set())
    await cargar()
  }

  async function exportarCSV() {
    try {
      const res = await fetch(`/api/kiosko/${slug}/admin/exportar`, { headers: authHeaders })
      if (!res.ok) throw new Error('No se pudo exportar el catalogo')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kiosko-${slug}-vinos.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(e.message)
    }
  }

  function formatPVP(v) { return v != null ? `${Number(v).toFixed(2)} €` : null }

  function formatSyncDate(iso) {
    if (!iso) return null
    const d = new Date(iso)
    const hoy = new Date()
    const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    if (d.toDateString() === hoy.toDateString()) return `Hoy, ${hora}`
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1)
    if (d.toDateString() === ayer.toDateString()) return `Ayer, ${hora}`
    return `${d.getDate()} ${d.toLocaleString('es-ES', { month: 'short' })}, ${hora}`
  }

  function renderQualityBadges(v, max = 3) {
    const issues = qualityIssuesForVino(v)
    if (!issues.length) return null
    return (
      <span className={styles.qualityBadges}>
        {issues.slice(0, max).map(issue => (
          <span key={issue.id}>{issue.label}</span>
        ))}
        {issues.length > max && <span>+{issues.length - max}</span>}
      </span>
    )
  }

  function startInlineFromKeyboard(e, id, campo, valorActual) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    startInline(id, campo, valorActual, e)
  }

  function renderMobileInlineField(v, campo, label, valorActual, opts = {}) {
    const activo = inlineEdit?.id === v.id && inlineEdit.campo === campo
    const display = opts.display ? opts.display(v) : (valorActual || <em className={styles.dash}>-</em>)
    const className = `${styles.mobileWineFact} ${opts.wide ? styles.mobileWineFactWide : ''}`

    if (activo) {
      return (
        <label className={`${className} ${styles.mobileWineFactEditing}`}>
          <span>{label}</span>
          <input
            className={styles.inlineInput}
            type={opts.type || 'text'}
            min={opts.min}
            step={opts.step}
            value={inlineEdit.valor}
            onChange={e => setInlineEdit(p => ({ ...p, valor: e.target.value }))}
            onBlur={guardarInline}
            onKeyDown={e => { if (e.key === 'Enter') guardarInline(); if (e.key === 'Escape') setInlineEdit(null) }}
            autoFocus
            onClick={e => e.stopPropagation()}
          />
        </label>
      )
    }

    return (
      <div
        className={className}
        role="button"
        tabIndex={0}
        onClick={e => startInline(v.id, campo, valorActual, e)}
        onKeyDown={e => startInlineFromKeyboard(e, v.id, campo, valorActual)}
      >
        <span>{label}</span>
        <strong>{display}</strong>
        <small>Editar</small>
      </div>
    )
  }

  function renderMobileStockField(v) {
    if (stockPending?.id === v.id) {
      return (
        <div className={`${styles.mobileWineFact} ${styles.mobileWineFactConfirm}`}>
          <span>Stock</span>
          <strong>{stockPending.anterior} → {stockPending.nuevo}</strong>
          {(() => { const v = vinos.find(w => w.id === stockPending?.id); return v?.square_catalog_id ? <span className={styles.stockConfirmWarn} style={{fontSize:'.7rem',display:'block',marginTop:'.2rem'}}>⚠ Sincronizado con Square · la próxima venta sobreescribirá este valor</span> : null })()}
          <div className={styles.mobileStockConfirmActions}>
            <button type="button" className={styles.stockConfirmOk} onClick={confirmarStock}>OK</button>
            <button type="button" className={styles.stockConfirmNo} onClick={cancelarStock}>No</button>
          </div>
        </div>
      )
    }

    return renderMobileInlineField(v, 'stock', 'Stock', v.stock, {
      type: 'number',
      min: '0',
      display: wine => Number(wine.stock || 0),
    })
  }

  async function ejecutarAccionAnalitica(accion) {
    const vino = accion?.vinoId ? vinosPorId.get(String(accion.vinoId)) : null
    if (accion?.kind === 'destacar' && vino) {
      await toggleCampo(vino.id, 'destacado', vino.destacado)
      return
    }
    if (accion?.kind === 'edit' && vino) {
      abrirEditar(vino)
      return
    }
    if (accion?.kind === 'catalogo') {
      setTab('catalogo')
      limpiarFiltros()
      if (accion.filtroCalidad) setFiltroCalidad(accion.filtroCalidad)
      if (vino?.nombre) setBusqueda(vino.nombre)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (cargando) return <div className={styles.loading}>Cargando...</div>
  if (accesoDenegado) return (
    <div className={styles.error}>
      Acceso no autorizado.{' '}
      <a href="/login" style={{ color: '#c9a96e', textDecoration: 'underline' }}>Iniciar sesión →</a>
    </div>
  )
  if (error) return <div className={styles.error}>{error}</div>

  // Gate de pago: si el pago está pendiente y no es admin, mostrar pantalla de activación
  // Plan trial nunca pasa por el gate de pago aunque tenga subscription_status='pending' de un intento anterior
  const pendienteDePago = !esAdminUsuario && tienda?.subscription_status === 'pending' && tienda?.plan !== 'trial'
  if (pendienteDePago) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f3f0', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '48px 40px', maxWidth: 460, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,.08)', textAlign: 'center' }}>
        {esperandoWebhook ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', margin: '0 0 12px' }}>Activando tu kiosko...</h2>
            <p style={{ fontSize: 15, color: '#666', lineHeight: 1.6, margin: 0 }}>
              Pago recibido. Estamos activando tu acceso, tardará solo unos segundos.
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', margin: '0 0 12px' }}>Activa tu kiosko</h2>
            <p style={{ fontSize: 15, color: '#666', lineHeight: 1.6, margin: '0 0 32px' }}>
              Tu cuenta está lista. Para empezar a usar el kiosko de vinos necesitas activar la suscripción.
            </p>
            <button
              onClick={irACheckout}
              disabled={generandoCheckout}
              style={{ background: '#1a1a2e', color: '#c9a96e', border: 'none', borderRadius: 10, padding: '14px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer', width: '100%' }}
            >
              {generandoCheckout ? 'Preparando pago...' : 'Activar suscripción →'}
            </button>
            <p style={{ fontSize: 12, color: '#aaa', marginTop: 16 }}>
              Pago seguro con Stripe · Cancela cuando quieras
            </p>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className={styles.admin}>
      {/* Inputs ocultos */}
      <input
        ref={fotoInputFilaRef} type="file" accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }} onChange={onFileFotoFila}
      />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerBrand}>
          <Link href="/kiosko-admin" className={styles.headerBack} title="Todas las tiendas">‹</Link>
          {tienda?.logo_url
            ? <img src={tienda.logo_url} alt={tienda.nombre} className={styles.headerLogo} />
            : <span className={styles.headerLogoPlaceholder}>🍷</span>
          }
          <div>
            <p className={styles.titulo}>{tienda?.nombre || 'Kiosko Admin'}</p>
            {tienda?.ciudad && <p className={styles.subtitulo}>{tienda.ciudad}</p>}
          </div>
          {tienda?.plan === 'trial'
            ? <span className={styles.planBadgeTrial}>★ TRIAL</span>
            : esPremium
              ? <span className={styles.planBadgePremium}>★ PREMIUM</span>
              : null}
        </div>
        <div className={styles.headerActions}>
          <a href={`/kiosko/${slug}`} target="_blank" rel="noreferrer" className={styles.btnSecundario}>
            Ver kiosko →
          </a>
          {tab === 'catalogo' && <>
            {squareSyncResult && (
              <span className={styles.syncResultPill} title={squareSyncResult.error || `${squareSyncResult.insertados} nuevos · ${squareSyncResult.actualizados} actualizados · ${squareSyncResult.stockSincronizados ?? 0} con stock real`}>
                {squareSyncResult.error
                  ? '✗ Error sync'
                  : `✓ ${squareSyncResult.insertados} nuevos · ${squareSyncResult.actualizados} act. · ${squareSyncResult.stockSincronizados ?? 0} stock`}
              </span>
            )}
            <div className={styles.moreMenuWrap} ref={moreMenuRef}>
              <button
                type="button"
                className={styles.btnSecundario}
                onClick={() => setMoreMenuOpen(o => !o)}
                aria-label="Más acciones"
              >···</button>
              {moreMenuOpen && (
                <div className={styles.moreMenu}>
                  <button type="button" className={styles.moreMenuItem} onClick={() => { exportarCSV(); setMoreMenuOpen(false) }}>
                    Exportar CSV
                  </button>
                  <button type="button" className={styles.moreMenuItem} onClick={() => { setModalImport(true); setResultImport(null); setMoreMenuOpen(false) }}>
                    Importar CSV
                  </button>
                  {(tienda?.has_square_token || usaSquare) && (
                    <button type="button" className={styles.moreMenuItem} onClick={() => { syncSquareFull(); setMoreMenuOpen(false) }}
                      disabled={squareSyncing || squareStockSyncing}>
                      {(squareSyncing || squareStockSyncing) ? 'Sincronizando con Square…' : '⟳ Sincronizar con Square'}
                    </button>
                  )}
                </div>
              )}
            </div>
            {!usaSquare && (
              <button onClick={abrirNuevo} type="button" className={styles.btnPrimario}>
                + Añadir vino
              </button>
            )}
          </>}
        </div>
        {tienda?.plan === 'trial' && trialSegsRestantes !== null && (
          <span className={`${styles.trialPill} ${trialSegsRestantes < 600 ? styles.trialPillRed : trialSegsRestantes < 1800 ? styles.trialPillAmber : ''}`}>
            ⏳ Prueba: {String(Math.floor(trialSegsRestantes / 3600)).padStart(2,'0')}:{String(Math.floor((trialSegsRestantes % 3600) / 60)).padStart(2,'0')}:{String(trialSegsRestantes % 60).padStart(2,'0')}
          </span>
        )}
      </header>

      {/* Pantalla de conversión al expirar el trial (o en preview) */}
      {tienda?.plan === 'trial' && (previewTrial || trialSegsRestantes === 0) && (
        <TrialGate tienda={tienda} onCheckout={irACheckout} generandoCheckout={generandoCheckout} />
      )}

      {/* Tab nav */}
      <nav className={styles.tabNav}>
        <button type="button" className={`${styles.tabBtn} ${tab === 'catalogo' ? styles.tabBtnActive : ''}`} onClick={() => setTab('catalogo')}>
          Vinos
        </button>
        <button type="button" className={`${styles.tabBtn} ${tab === 'otros' ? styles.tabBtnActive : ''}`} onClick={() => setTab('otros')}>
          Otros{vinosOtro.length > 0 && <span className={styles.tabBadge}>{vinosOtro.length}</span>}
        </button>
        {pedidosMostradorActivos && (
          <button type="button" className={`${styles.tabBtn} ${tab === 'pedidos' ? styles.tabBtnActive : ''}`}
            onClick={() => { setTab('pedidos'); if (!pedidos && !pedidosLoad) cargarPedidos() }}>
            Pedidos
          </button>
        )}
        <button type="button" className={`${styles.tabBtn} ${tab === 'analitica' ? styles.tabBtnActive : ''}`}
          onClick={() => { if (!esPremium && !esAdminUsuario) { setUpgradeModal('analitica'); return } setTab('analitica'); if (!analitica && !analiticaLoad) cargarAnalitica(); if (!embudo && !embudoLoad) cargarEmbudo() }}>
          Analítica{!esPremium && !esAdminUsuario && <span className={styles.tabPremiumBadge}>★</span>}
        </button>
        <button type="button" className={`${styles.tabBtn} ${tab === 'leads' ? styles.tabBtnActive : ''}`}
          onClick={() => { if (!esPremium && !esAdminUsuario) { setUpgradeModal('leads'); return } setTab('leads'); if (!leads && !leadsLoad) cargarLeads() }}>
          Leads{!esPremium && !esAdminUsuario && <span className={styles.tabPremiumBadge}>★</span>}
        </button>
        <button type="button" className={`${styles.tabBtn} ${tab === 'ajustes' ? styles.tabBtnActive : ''}`} onClick={() => setTab('ajustes')}>
          Ajustes
        </button>
      </nav>

      {/* Ajustes */}
      {tab === 'ajustes' && tienda && (
        <AjustesTab slug={slug} tienda={tienda} onSaved={cargar} esAdmin={esAdminUsuario} />
      )}

      {/* Pedidos de mostrador */}
      {tab === 'pedidos' && pedidosMostradorActivos && (
        <div className={styles.pedidosWrap}>
          <div className={styles.pedidosHeader}>
            <div>
              <p className={styles.pedidosKicker}>Mostrador</p>
              <h2>Pedidos para preparar ahora</h2>
              <p>Comandas creadas desde el carrito móvil del kiosko. El cliente paga y recoge en tienda.</p>
            </div>
            <button type="button" className={styles.btnSecundario} onClick={cargarPedidos} disabled={pedidosLoad}>
              {pedidosLoad ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>

          {pedidos?.pendiente && (
            <div className={styles.analiticaBanner}>
              <span className={styles.analiticaBannerIcon}>SQL</span>
              <span>La cola de pedidos aún no está disponible en Supabase. Aplica la migración de pedidos de mostrador.</span>
            </div>
          )}

          {pedidoMsg && <p className={styles.pedidosError}>{pedidoMsg}</p>}
          {pedidosLoad && <p className={styles.analiticaLoading}>Cargando pedidos...</p>}

          {!pedidosLoad && pedidos && !pedidos.pendiente && (
            <>
              <div className={styles.pedidosStats}>
                <div className={styles.pedidoStat}>
                  <span>{pedidos.resumen?.abiertos ?? 0}</span>
                  <small>Abiertos</small>
                </div>
                <div className={styles.pedidoStat}>
                  <span>{pedidos.resumen?.pendientesPago ?? pedidos.resumen?.nuevos ?? 0}</span>
                  <small>Pendiente pago</small>
                </div>
                <div className={styles.pedidoStat}>
                  <span>{pedidos.resumen?.total ?? 0}</span>
                  <small>Últimos pedidos</small>
                </div>
                <div className={styles.pedidoStat}>
                  <span>{formatPVP(pedidos.resumen?.totalImporte || 0)}</span>
                  <small>Total orientativo</small>
                </div>
              </div>

              {(pedidos.pedidos || []).length ? (
                <div className={styles.pedidosList}>
                  {pedidos.pedidos.map(pedido => {
                    const lines = Array.isArray(pedido.lines) ? pedido.lines : []
                    const visualStatus = pedidoVisualStatus(pedido.status)
                    const statusLabel = PEDIDO_STATUS.find(s => s.id === visualStatus)?.label || pedido.status
                    return (
                      <article key={pedido.id} className={`${styles.pedidoCard} ${styles[`pedido_${visualStatus}`] || ''}`}>
                        <div className={styles.pedidoCardTop}>
                          <div>
                            <span className={styles.pedidoStatus}>{statusLabel}</span>
                            <h3>{pedido.order_code}</h3>
                            <p>
                              {new Date(pedido.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              {pedido.customer_label ? ` · ${pedido.customer_label}` : ''}
                            </p>
                          </div>
                          <div className={styles.pedidoTotalBox}>
                            <strong>{formatPVP(pedido.total || 0)}</strong>
                            <span>{pedido.item_count} ref.</span>
                          </div>
                        </div>

                        {pedido.customer_note && <p className={styles.pedidoNote}>{pedido.customer_note}</p>}

                        <div className={styles.pedidoLines}>
                          {lines.map((line, i) => (
                            <div key={`${pedido.id}-${line.vino_id || i}`} className={styles.pedidoLine}>
                              <span>{i + 1}</span>
                              <strong>{line.nombre}</strong>
                              <small>
                                {[line.bodega, line.ubicacion_estanteria].filter(Boolean).join(' · ') || 'Sin ubicación'}
                              </small>
                              <em>{Number(line.precio || 0) > 0 ? formatPVP(line.precio) : '-'}</em>
                            </div>
                          ))}
                        </div>

                        <div className={styles.pedidoActions}>
                          {PEDIDO_STATUS.map(status => (
                            <button
                              key={status.id}
                              type="button"
                              className={visualStatus === status.id ? styles.pedidoActionActive : ''}
                              onClick={() => cambiarEstadoPedido(pedido.id, status.id)}
                            >
                              {status.label}
                            </button>
                          ))}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className={styles.pedidosEmpty}>
                  <p>Sin pedidos de mostrador todavía.</p>
                  <span>Cuando un cliente cree un pedido desde su carrito móvil aparecerá aquí.</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Analítica — bloqueada en plan Básico (salvo superadmin) */}
      {tab === 'analitica' && !esPremium && !esAdminUsuario && (
        <div className={styles.premiumGateWrap}>
          <div className={styles.premiumGateBox}>
            <span className={styles.premiumGateIcon}>📊</span>
            <p className={styles.premiumGateTitle}>Analítica — Plan Premium</p>
            <p className={styles.premiumGateDesc}>Accede a búsquedas, vinos más recomendados, tendencias semanales, predicción de agotamiento y alertas de stock.</p>
            <button onClick={() => setUpgradeModal('analitica')} className={styles.premiumGateCta}>
              Ver qué incluye Premium →
            </button>
          </div>
        </div>
      )}

      {tab === 'analitica' && (esPremium || esAdminUsuario) && (
        <div className={styles.analiticaWrap}>
          {/* Sub-tabs */}
          <nav className={styles.subTabNav}>
            {[
              { id: 'resumen',       label: 'Resumen' },
              { id: 'busquedas',     label: 'Búsquedas' },
              { id: 'embudo',        label: 'Embudo' },
              { id: 'conversion',    label: 'Conversión' },
              { id: 'precios',       label: 'Precios' },
              { id: 'ventas',        label: 'Ventas TPV' },
              { id: 'rentabilidad',  label: 'Rentabilidad' },
            ].map(st => (
              <button key={st.id} type="button"
                className={`${styles.subTabBtn} ${subTabAnalitica === st.id ? styles.subTabBtnActive : ''}`}
                onClick={() => setSubTabAnalitica(st.id)}>
                {st.label}
              </button>
            ))}
          </nav>

          {analiticaLoad && <p className={styles.analiticaLoading}>Cargando datos…</p>}
          {!analiticaLoad && analitica && (() => {
            const vacio = analitica.vacio
            const SKELETON = [88, 72, 60, 48, 36]
            return (
              <>
                {/* ── Resumen ── */}
                {subTabAnalitica === 'resumen' && <>
                {analitica.ultimoSyncAt && (
                  <div className={styles.syncChip}>
                    <span className={styles.syncDot} />
                    TPV sincronizado · Última sincronización: {formatSyncDate(analitica.ultimoSyncAt)}
                  </div>
                )}

                {vacio && (
                  <div className={styles.analiticaBanner}>
                    <span className={styles.analiticaBannerIcon}>📊</span>
                    <span>Todavía sin búsquedas — los datos aparecen aquí automáticamente cuando los clientes usen el kiosko</span>
                  </div>
                )}
                {analitica.movil?.pendiente && (
                  <div className={styles.analiticaBanner}>
                    <span className={styles.analiticaBannerIcon}>QR</span>
                    <span>La métrica Llevar al móvil todavía no está disponible en Supabase. Aplica la migración para activarla.</span>
                  </div>
                )}

                {!vacio && accionesAnalitica.length > 0 && (
                  <section className={styles.accionesAnalitica}>
                    <div className={styles.accionesAnaliticaHeader}>
                      <div>
                        <p className={styles.accionesAnaliticaKicker}>Acciones recomendadas</p>
                        <h3>Qué haría ahora</h3>
                      </div>
                      <span>{accionesAnalitica.length} prioridad{accionesAnalitica.length > 1 ? 'es' : ''}</span>
                    </div>
                    <div className={styles.accionesAnaliticaGrid}>
                      {accionesAnalitica.map(accion => (
                        <article key={accion.key} className={`${styles.accionAnaliticaCard} ${styles[`accionAnalitica_${accion.tone}`] || ''}`}>
                          <span className={styles.accionAnaliticaBadge}>{accion.badge}</span>
                          <h4>{accion.title}</h4>
                          <p>{accion.desc}</p>
                          <button type="button" onClick={() => ejecutarAccionAnalitica(accion)}>
                            {accion.cta}
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {/* Alertas de reposición */}
                {alertasStock.length > 0 ? (
                  <div className={styles.alertasBloque}>
                    <p className={styles.alertasTitulo}>⚠️ Alertas de reposición</p>
                    <p className={styles.alertasDesc}>Stock bajo — por mínimo configurado o por alta demanda en el asistente</p>
                    <div className={styles.alertasList}>
                      {alertasStock.map(a => (
                        <div key={a.id} className={`${styles.alertaItem} ${a.critico ? styles.alertaCritico : styles.alertaBajo}`}>
                          <span className={styles.alertaIcon}>{a.critico ? '🔴' : '🟡'}</span>
                          <span className={styles.alertaNombre}>{a.nombre}{a.bodega ? ` · ${a.bodega}` : ''}</span>
                          <span className={styles.alertaStats}>{a.recomendaciones}× recomendado · {a.stock === 0 ? 'Sin stock' : `${a.stock} ud.`}{a.diasRestantes !== null && a.diasRestantes !== undefined ? ` · ~${a.diasRestantes}d` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : analitica?.topVinos?.length > 0 ? (
                  <div className={styles.alertasBloqueOk}>
                    <span>✅ Stock OK — ningún vino frecuentemente recomendado tiene stock bajo</span>
                  </div>
                ) : null}

                {/* KPIs en Resumen */}
                <div className={styles.analiticaKpis}>
                  <div className={styles.analiticaKpi}>
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{analitica.total ?? 0}</span>
                    <span className={styles.analiticaKpiLabel}>Búsquedas (30 días)</span>
                  </div>
                  <div className={styles.analiticaKpi}>
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{analitica.semanaActual ?? 0}</span>
                    <span className={styles.analiticaKpiLabel}>
                      Esta semana
                      {!vacio && analitica.semanaAnterior > 0 && (
                        <em className={analitica.semanaActual >= analitica.semanaAnterior ? styles.kpiUp : styles.kpiDown}>
                          {analitica.semanaActual >= analitica.semanaAnterior ? ' ↑' : ' ↓'} vs ant. ({analitica.semanaAnterior})
                        </em>
                      )}
                    </span>
                  </div>
                  <div className={styles.analiticaKpi}>
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{(() => { const ids = new Set(vinosVino.map(v => String(v.id))); return Object.keys(analitica.ventasPorVino || {}).filter(id => ids.has(id)).length })()}</span>
                    <span className={styles.analiticaKpiLabel}>Vinos vendidos (TPV)</span>
                  </div>
                  <div className={styles.analiticaKpi}>
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{alertasStock.length}</span>
                    <span className={styles.analiticaKpiLabel}>Alertas de stock</span>
                  </div>
                  <div className={styles.analiticaKpi}>
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{analitica.movil?.total ?? 0}</span>
                    <span className={styles.analiticaKpiLabel}>Llevados al móvil</span>
                  </div>
                </div>

                </>}

                {/* ── Búsquedas ── */}
                {subTabAnalitica === 'busquedas' && <>
                <div className={styles.analiticaKpis}>
                  <div className={styles.analiticaKpi}>
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{analitica.total ?? 0}</span>
                    <span className={styles.analiticaKpiLabel}>Búsquedas (30 días)</span>
                  </div>
                  <div className={styles.analiticaKpi}>
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{analitica.semanaActual ?? 0}</span>
                    <span className={styles.analiticaKpiLabel}>
                      Esta semana
                      {!vacio && analitica.semanaAnterior > 0 && (
                        <em className={analitica.semanaActual >= analitica.semanaAnterior ? styles.kpiUp : styles.kpiDown}>
                          {analitica.semanaActual >= analitica.semanaAnterior ? ' ↑' : ' ↓'} vs semana anterior ({analitica.semanaAnterior})
                        </em>
                      )}
                    </span>
                  </div>
                  <div className={styles.analiticaKpi}>
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{analitica.movil?.total ?? 0}</span>
                    <span className={styles.analiticaKpiLabel}>Llevados al móvil</span>
                  </div>
                  <div className={styles.analiticaKpi}>
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{analitica.modos?.maridaje ?? 0}</span>
                    <span className={styles.analiticaKpiLabel}>¿Con qué lo tomo? (plato)</span>
                  </div>
                  <div className={styles.analiticaKpi}>
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{analitica.modos?.wizard ?? 0}</span>
                    <span className={styles.analiticaKpiLabel}>Ayúdame a elegir (ocasión)</span>
                  </div>
                  <div className={styles.analiticaKpi}>
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{analitica.modos?.regalo ?? 0}</span>
                    <span className={styles.analiticaKpiLabel}>Cesta regalo</span>
                  </div>
                  <div className={styles.analiticaKpi}>
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{analitica.modos?.explorar ?? 0}</span>
                    <span className={styles.analiticaKpiLabel}>Explorar vinos</span>
                  </div>
                </div>

                <div className={styles.analiticaGrid}>
                  {/* Top búsquedas */}
                  <div className={styles.analiticaBloque}>
                    <h3 className={styles.analiticaBloqueTitle}>Qué buscan los clientes</h3>
                    <p className={styles.analiticaBloqueDesc}>Las consultas más frecuentes al asistente en los últimos 30 días</p>
                    <div className={styles.analiticaList}>
                      {vacio
                        ? SKELETON.map((w, i) => <div key={i} className={styles.analiticaSkeleton} style={{ width: `${w}%` }} />)
                        : analitica.topConsultas.map((c, i) => (
                            <div key={i} className={styles.analiticaListRow}>
                              <span className={styles.analiticaRank}>{i + 1}</span>
                              <span className={styles.analiticaConsulta}>{c.consulta}</span>
                              <span className={styles.analiticaVeces}>{c.veces}×</span>
                            </div>
                          ))
                      }
                    </div>
                  </div>

                  {/* Vinos más recomendados */}
                  <div className={styles.analiticaBloque}>
                    <h3 className={styles.analiticaBloqueTitle}>Vinos más recomendados</h3>
                    <p className={styles.analiticaBloqueDesc}>Los que el asistente propone con más frecuencia — si no se venden, revisa precio o visibilidad</p>
                    <div className={styles.analiticaList}>
                      {vacio
                        ? SKELETON.map((w, i) => <div key={i} className={styles.analiticaSkeleton} style={{ width: `${w}%` }} />)
                        : analitica.topVinos.map((v, i) => (
                            <div key={v.id} className={styles.analiticaListRow}>
                              <span className={styles.analiticaRank}>{i + 1}</span>
                              <span className={styles.analiticaConsulta}>{v.nombre}</span>
                              <span className={styles.analiticaVeces}>{v.veces}×</span>
                            </div>
                          ))
                      }
                    </div>
                  </div>

                  {/* Vinos llevados al móvil */}
                  <div className={styles.analiticaBloque}>
                    <h3 className={styles.analiticaBloqueTitle}>Vinos llevados al móvil</h3>
                    <p className={styles.analiticaBloqueDesc}>Referencias que el cliente quiso guardar o enseñar al equipo en tienda</p>
                    <div className={styles.analiticaList}>
                      {vacio
                        ? SKELETON.map((w, i) => <div key={i} className={styles.analiticaSkeleton} style={{ width: `${w}%` }} />)
                        : analitica.movil?.topVinos?.length
                          ? analitica.movil.topVinos.map((v, i) => (
                              <div key={v.id} className={styles.analiticaListRow}>
                                <span className={styles.analiticaRank}>{i + 1}</span>
                                <span className={styles.analiticaConsulta}>{v.nombre}{v.bodega ? ` · ${v.bodega}` : ''}</span>
                                <span className={styles.analiticaVeces}>{v.veces}×</span>
                              </div>
                            ))
                          : <p className={styles.analiticaEmptyLine}>Sin vinos llevados al móvil todavía.</p>
                      }
                    </div>
                  </div>
                </div>

                {/* Tendencias semanales */}
                {!vacio && analitica.tendencias?.length > 0 && (() => {
                  const maxT = Math.max(...analitica.tendencias.map(t => t.total), 1)
                  return (
                    <div className={styles.analiticaBloque} style={{ marginTop: '1.5rem' }}>
                      <h3 className={styles.analiticaBloqueTitle}>Actividad semanal</h3>
                      <p className={styles.analiticaBloqueDesc}>Actividad por semana — azul: ocasión · ámbar: maridaje · verde: cesta regalo · morado: explorar</p>
                      <div className={styles.tendenciasChart}>
                        {analitica.tendencias.map((t, i) => (
                          <div key={i} className={styles.tendenciaCol}>
                            <div className={styles.tendenciaBarWrap} style={{ height: 80 }}>
                              <div className={styles.tendenciaBarFill} style={{ height: `${(t.total / maxT) * 100}%` }}>
                                <div className={styles.tendenciaSegWizard}   style={{ flex: t.wizard   || 0 }} />
                                <div className={styles.tendenciaSegMaridaje} style={{ flex: t.maridaje || 0 }} />
                                <div className={styles.tendenciaSegRegalo}   style={{ flex: t.regalo   || 0 }} />
                                <div className={styles.tendenciaSegExplorar} style={{ flex: t.explorar || 0 }} />
                              </div>
                            </div>
                            <span className={styles.tendenciaLabel}>{t.label}</span>
                            {t.total > 0 && <span className={styles.tendenciaNum}>{t.total}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* Búsquedas recientes */}
                <div className={styles.analiticaBloque} style={{ marginTop: '1.5rem' }}>
                  <div className={styles.analiticaBloqueHeader}>
                    <h3 className={styles.analiticaBloqueTitle}>Últimas búsquedas</h3>
                    {!vacio && (
                      <button type="button" className={styles.btnSecundario} onClick={cargarAnalitica} style={{ background: '#f0ede8', color: '#1a1a2e', border: '1px solid #d0cdc8' }}>
                        Actualizar
                      </button>
                    )}
                  </div>
                  <div className={styles.analiticaRecientes}>
                    {vacio
                      ? SKELETON.map((w, i) => (
                          <div key={i} className={styles.analiticaRecienteRow}>
                            <div className={styles.analiticaSkeleton} style={{ width: 52, height: 20, borderRadius: 20 }} />
                            <div className={styles.analiticaSkeleton} style={{ width: `${w}%` }} />
                            <div className={styles.analiticaSkeleton} style={{ width: 60 }} />
                            <div className={styles.analiticaSkeleton} style={{ width: 44 }} />
                          </div>
                        ))
                      : analitica.recientes.map((r, i) => (
                          <div key={i} className={styles.analiticaRecienteRow}>
                            <span className={`${styles.analiticaMode} ${
                              r.mode === 'wizard'   ? styles.analiticaModeWizard   :
                              r.mode === 'regalo'   ? styles.analiticaModeRegalo   :
                              r.mode === 'explorar' ? styles.analiticaModeExplorar :
                              styles.analiticaModeMaridaje
                            }`}>
                              {r.mode === 'wizard'   ? 'Ocasión' :
                               r.mode === 'regalo'   ? 'Regalo'  :
                               r.mode === 'explorar' ? 'Explorar':
                               'Plato'}
                            </span>
                            <span className={styles.analiticaRecienteConsulta}>{r.consulta}</span>
                            <span className={styles.analiticaRecienteVinos}>{r.vinos.join(', ')}</span>
                            <span className={styles.analiticaRecienteFecha}>{new Date(r.fecha).toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        ))
                    }
                  </div>
                </div>
                </>}
              </>
            )
          })()}
        </div>
      )}

      {/* Embudo de conversión */}
      {tab === 'analitica' && (esPremium || esAdminUsuario) && subTabAnalitica === 'embudo' && (() => {
        const FLOW_LABELS = { wizard: 'Asistente', cesta: 'Cesta Regalo', pairing: 'Maridaje' }
        const STEP_LABELS = {
          start: 'Inicio', ocasion: 'Ocasión', estilo: 'Estilo', presupuesto: 'Presupuesto',
          prefs: 'Preferencias', resultado: 'Resultado', consulta: 'Consulta', carrito: 'Carrito ✓',
        }
        const FLOW_STEPS = {
          wizard:  ['start', 'ocasion', 'estilo', 'presupuesto', 'resultado', 'carrito'],
          cesta:   ['start', 'ocasion', 'presupuesto', 'resultado', 'carrito'],
          pairing: ['start', 'consulta', 'resultado', 'carrito'],
        }
        return (
          <div style={{ padding: '0 1.5rem 1.5rem' }}>
            {embudoLoad && <p className={styles.analiticaLoading}>Cargando embudo…</p>}
            {!embudoLoad && embudo?.pendiente && (
              <div className={styles.analiticaBanner}>
                <span className={styles.analiticaBannerIcon}>📊</span>
                <span>Aplica la migración <code>supabase/kiosko_funnel_events.sql</code> para activar el embudo de conversión.</span>
              </div>
            )}
            {!embudoLoad && embudo && !embudo.pendiente && (
              <>
                <p className={styles.analiticaBloqueDesc} style={{ marginBottom: '1.25rem' }}>
                  Embudo de conversión · últimos {embudo.dias} días · intentos únicos por paso
                </p>
                {Object.entries(FLOW_STEPS).map(([flow, steps]) => {
                  const fd = embudo.funnel?.[flow]
                  if (!fd) return null
                  const total = fd.steps.start || 0
                  const carrito = fd.steps.carrito || 0
                  const convRate = total > 0 ? Math.round((carrito / total) * 100) : 0
                  return (
                    <div key={flow} className={styles.analiticaBloque} style={{ marginBottom: '1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <h3 className={styles.analiticaBloqueTitle} style={{ margin: 0 }}>{FLOW_LABELS[flow]}</h3>
                        <span style={{ fontSize: '0.78rem', color: '#888' }}>{total} iniciados · {convRate}% al carrito</span>
                      </div>
                      {total === 0 ? (
                        <p style={{ fontSize: '0.82rem', color: '#aaa', margin: 0 }}>Sin datos aún — los intentos aparecen aquí cuando los clientes usen este flujo.</p>
                      ) : (
                        <>
                          {steps.map(step => {
                            const n = fd.steps[step] || 0
                            const pct = total > 0 ? Math.round((n / total) * 100) : 0
                            const isCarrito = step === 'carrito'
                            return (
                              <div key={step} style={{ marginBottom: '0.45rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.2rem' }}>
                                  <span style={{ color: isCarrito ? '#22c55e' : '#ccc' }}>{STEP_LABELS[step] ?? step}</span>
                                  <span style={{ color: '#aaa' }}>{n} ({pct}%)</span>
                                </div>
                                <div style={{ height: 8, borderRadius: 4, background: '#1a1a1a', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: isCarrito ? '#22c55e' : '#555', transition: 'width 0.4s' }} />
                                </div>
                              </div>
                            )
                          })}
                          {fd.abandon.total > 0 && (
                            <div style={{ marginTop: '0.65rem', fontSize: '0.78rem', color: '#888', display: 'flex', gap: '1.5rem' }}>
                              <span>Abandono: {fd.abandon.total}</span>
                              {fd.abandon.idle_timeout > 0 && <span>⏱ por inactividad: {fd.abandon.idle_timeout}</span>}
                              {fd.abandon.user_exit > 0 && <span>← por back: {fd.abandon.user_exit}</span>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </>
            )}
            {!embudoLoad && !embudo && (
              <div className={styles.analiticaBanner}>
                <span className={styles.analiticaBannerIcon}>⚠️</span>
                <span>No se pudieron cargar los datos del embudo.</span>
              </div>
            )}
          </div>
        )
      })()}

      {/* Vinos sin movimiento */}
      {tab === 'analitica' && (esPremium || esAdminUsuario) && subTabAnalitica === 'ventas' && analitica && (() => {
        const vp = analitica.ventasPorVino || {}
        const sinMovimiento = vinosVino.filter(v =>
          v.activo && Number(v.precio_pvp) > 0 && Number(v.stock ?? 0) > 0 && !vp[v.id]
        ).sort((a, b) => Number(b.stock) - Number(a.stock))
        if (!sinMovimiento.length) return null
        const valorParado = sinMovimiento.reduce((s, v) => s + Number(v.stock) * Number(v.precio_pvp), 0)
        return (
          <div style={{ padding: '0 1.75rem 1.75rem' }}>
            <div className={styles.analiticaBloque}>
              <div className={styles.analiticaBloqueHeader}>
                <div>
                  <h3 className={styles.analiticaBloqueTitle}>Vinos sin movimiento</h3>
                  <p className={styles.analiticaBloqueDesc}>
                    Activos con stock pero sin ventas Square registradas · {sinMovimiento.length} vinos · {valorParado.toFixed(0)} € parados en lineal
                  </p>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.rendTable}>
                  <thead>
                    <tr>
                      <th className={styles.rendThNombre}>Vino</th>
                      <th className={styles.rendThNum}>Stock</th>
                      <th className={styles.rendThNum}>PVP</th>
                      <th className={styles.rendThNum}>Valor parado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sinMovimiento.slice(0, 15).map(v => (
                      <tr key={v.id} className={styles.rendRow}>
                        <td className={styles.rendTdNombre}>
                          <span className={styles.rendVinoNombre}>{v.nombre}</span>
                          {v.bodega && <span className={styles.rendBodega}> · {v.bodega}</span>}
                        </td>
                        <td className={styles.rendTdNum}>{v.stock}</td>
                        <td className={styles.rendTdNum}>{Number(v.precio_pvp).toFixed(2)} €</td>
                        <td className={styles.rendTdNum}>{(Number(v.stock) * Number(v.precio_pvp)).toFixed(0)} €</td>
                      </tr>
                    ))}
                  </tbody>
                  {sinMovimiento.length > 15 && (
                    <tfoot>
                      <tr><td colSpan={4} className={styles.rendTdNombre} style={{ color: '#aaa', fontStyle: 'italic' }}>
                        +{sinMovimiento.length - 15} más no mostrados
                      </td></tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Rentabilidad — solo en Premium */}
      {tab === 'analitica' && (esPremium || esAdminUsuario) && subTabAnalitica === 'rentabilidad' && (
        <div style={{ padding: '0 1.75rem 1.75rem' }}>
          <div className={styles.analiticaBloque}>
            <div className={styles.analiticaBloqueHeader}>
              <div>
                <h3 className={styles.analiticaBloqueTitle}>Análisis de rentabilidad</h3>
                <p className={styles.analiticaBloqueDesc}>
                  {!rentabilidad
                    ? 'Introduce el precio de coste en la columna "Coste €" del Catálogo para activar este análisis. Necesitas al menos 2 vinos con coste.'
                    : rentabilidad.coldStart
                    ? 'El cuadrante se activará cuando se registren al menos 20 unidades vendidas vía TPV. Los datos de margen ya están listos.'
                    : <>Cruce entre margen bruto y unidades vendidas (TPV Square){!rentabilidad.usandoVentas && ' · usando recomendaciones del kiosko como aproximación'} — umbral margen {rentabilidad.margenMedio}%, umbral ventas {rentabilidad.ventasMedio} ud{rentabilidad.sinCoste > 0 && ` · ${rentabilidad.sinCoste} vino${rentabilidad.sinCoste > 1 ? 's' : ''} sin precio de coste`}</>
                  }
                </p>
              </div>
            </div>
            <div className={styles.bcgGrid}>
              {[
                { id:'estrella', icon:'⭐', label:'Estrella',          desc:'Alto margen · Alta demanda', color:'#7a5a1a', borde:'#d4a636', fondo:'#fdf8ee' },
                { id:'joya',     icon:'💎', label:'Joya oculta',       desc:'Alto margen · Baja demanda', color:'#2e6b47', borde:'#4a9c69', fondo:'#eef7f2' },
                { id:'caballo',  icon:'🐎', label:'Caballo de batalla',desc:'Bajo margen · Alta demanda', color:'#1a4f7a', borde:'#2e7ab8', fondo:'#eef4fb' },
                { id:'revisar',  icon:'⚠️', label:'Revisar',           desc:'Bajo margen · Baja demanda', color:'#7a2020', borde:'#c03030', fondo:'#fdf0f0' },
              ].map(cat => {
                const lista = rentabilidad ? rentabilidad.clasificados.filter(v => v.categoria === cat.id) : []
                return (
                  <div key={cat.id} className={styles.bcgCuadrante} style={{ borderColor: cat.borde, background: cat.fondo }}>
                    <p className={styles.bcgCuadranteTitle} style={{ color: cat.color }}>{cat.icon} {cat.label} {rentabilidad && <span className={styles.bcgCount}>{lista.length}</span>}</p>
                    <p className={styles.bcgCuadranteDesc}>{cat.desc}</p>
                    <div className={styles.bcgVinoList}>
                      {!rentabilidad && <p className={styles.bcgVacio}>Añade precios de coste para ver qué vinos aparecen aquí</p>}
                      {rentabilidad && lista.slice(0,8).map(v => (
                        <div key={v.id} className={styles.bcgVinoItem}>
                          <span className={styles.bcgVinoNombre}>{v.nombre}</span>
                          <span className={styles.bcgVinoStats}>{v.margenPct}% · {v.ventas} ud</span>
                        </div>
                      ))}
                      {rentabilidad && lista.length > 8 && <p className={styles.bcgMas}>+{lista.length - 8} más</p>}
                      {rentabilidad && lista.length === 0 && <p className={styles.bcgVacio}>Ninguno</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Rendimiento por vino — Square TPV */}
      {tab === 'analitica' && (esPremium || esAdminUsuario) && subTabAnalitica === 'ventas' && analitica && (() => {
        const vp = analitica.ventasPorVino
        const tp = analitica.tendenciaPorVino || {}
        const catColor = { estrella: '#d4a636', joya: '#4a9c69', caballo: '#2e7ab8', revisar: '#c03030' }
        const filas = vinosVino
          .filter(v => vp[v.id])
          .map(v => {
            const uds      = vp[v.id] || 0
            const pvp      = Number(v.precio_pvp || 0)
            const coste    = Number(v.precio_coste || 0)
            const ingresos = uds * pvp
            const margen   = pvp > 0 && coste > 0 ? Math.round(((pvp - coste) / pvp) * 100) : null
            const categoria  = rentabilidad?.clasificados?.find(c => c.id === v.id)?.categoria || null
            const tendencia  = tp[v.id] || null
            const agotado    = !v.activo
            const beneficio  = pvp > 0 && coste > 0 ? Math.round((pvp - coste) * uds) : null
            const ultimaSemana = (() => {
              if (!tendencia) return null
              let lastIdx = -1
              for (let i = tendencia.length - 1; i >= 0; i--) { if (tendencia[i] > 0) { lastIdx = i; break } }
              if (lastIdx < 0) return null
              const s = 7 - lastIdx
              return s === 0 ? 'esta sem.' : `hace ${s} sem.`
            })()
            return { id: v.id, nombre: v.nombre, bodega: v.bodega, uds, ingresos, margen, categoria, tendencia, agotado, stock: v.stock ?? null, pvpVal: pvp > 0 ? pvp : null, beneficio, ultimaSemana }
          })
          .sort((a, b) => b.ingresos - a.ingresos)
        if (!filas.length) return (
          <div style={{ padding: '0 1.75rem 1.75rem' }}>
            <div className={styles.analiticaBloque}>
              <div className={styles.analiticaBloqueHeader}><div>
                <h3 className={styles.analiticaBloqueTitle}>Rendimiento por vino</h3>
                <p className={styles.analiticaBloqueDesc}>Sin ventas registradas vía TPV Square todavía. Los datos aparecerán aquí automáticamente con cada venta sincronizada.</p>
              </div></div>
            </div>
          </div>
        )
        const totalUds      = filas.reduce((s, f) => s + f.uds, 0)
        const totalIngresos = filas.reduce((s, f) => s + f.ingresos, 0)
        const weeklyTotals  = Array(8).fill(0)
        Object.values(tp).forEach(weeks => { weeks.forEach((u, i) => { weeklyTotals[i] += u }) })
        const maxW = Math.max(...weeklyTotals, 1)
        const hoy  = new Date()
        const weekLabels = Array.from({ length: 8 }, (_, i) => {
          const d = new Date(hoy.getTime() - (7 - i) * 7 * 24 * 60 * 60 * 1000)
          return `${d.getDate()}/${d.getMonth() + 1}`
        })
        return (
          <div style={{ padding: '0 1.75rem 1.75rem' }}>
            {weeklyTotals.some(v => v > 0) && (
              <div className={styles.analiticaBloque} style={{ marginBottom: '1rem' }}>
                <p className={styles.analiticaBloqueDesc} style={{ marginBottom: '.85rem' }}>
                  Ventas semanales (TPV) · últimas 8 semanas · <strong>{totalUds} ud. totales</strong>
                </p>
                <div className={styles.ventasChartBars}>
                  {weeklyTotals.map((v, i) => (
                    <div key={i} className={styles.ventasChartCol}>
                      <span className={styles.ventasChartVal}>{v > 0 ? v : ''}</span>
                      <div className={styles.ventasChartBar} style={{ height: `${Math.round((v / maxW) * 100)}%`, opacity: i === 7 ? 1 : 0.6 + (i / 7) * 0.4 }} />
                      <span className={styles.ventasChartLabel}>{weekLabels[i]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.analiticaBloque}>
              <div className={styles.analiticaBloqueHeader}>
                <div>
                  <h3 className={styles.analiticaBloqueTitle}>Rendimiento por vino</h3>
                  <p className={styles.analiticaBloqueDesc}>
                    Ventas registradas vía TPV Square · {filas.length} vino{filas.length !== 1 ? 's' : ''} vendido{filas.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.rendTable}>
                  <thead>
                    <tr>
                      <th className={styles.rendThNombre}>Vino</th>
                      <th className={styles.rendThNum}>Vendidas (uds.)</th>
                      <th className={styles.rendThNum}>Ingresos</th>
                      <th className={styles.rendThNum}>Beneficio €</th>
                      <th className={styles.rendThNum}>Margen bruto</th>
                      <th className={styles.rendThNum}>PVP</th>
                      <th className={styles.rendThNum}>Stock</th>
                      <th className={styles.rendThNum}>Última venta</th>
                      <th className={styles.rendThNum}>Tendencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(f => (
                      <tr key={f.id} className={styles.rendRow}>
                        <td className={styles.rendTdNombre}>
                          {f.categoria && (
                            <span className={styles.rendDot} style={{ background: catColor[f.categoria] }} title={f.categoria} />
                          )}
                          <span className={styles.rendVinoNombre}>{f.nombre}</span>
                          {f.bodega && <span className={styles.rendBodega}> · {f.bodega}</span>}
                          {f.agotado && <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: '#999', fontWeight: 400, letterSpacing: '0.02em' }}>agotado</span>}
                        </td>
                        <td className={styles.rendTdNum}>{f.uds}</td>
                        <td className={styles.rendTdNum}>{f.ingresos > 0 ? `${f.ingresos.toFixed(0)} €` : '—'}</td>
                        <td className={styles.rendTdNum}>{f.beneficio !== null ? `${f.beneficio} €` : '—'}</td>
                        <td className={styles.rendTdNum}>
                          {f.margen !== null
                            ? <span className={`${styles.margenBadge} ${f.margen >= 40 ? styles.margenHigh : f.margen >= 25 ? styles.margenMid : styles.margenLow}`}>{f.margen}%</span>
                            : <em className={styles.dash}>—</em>}
                        </td>
                        <td className={styles.rendTdNum}>{f.pvpVal ? `${f.pvpVal.toFixed(2)} €` : '—'}</td>
                        <td className={styles.rendTdNum}>
                          <span style={{ color: f.stock === 0 ? '#c03030' : f.stock !== null && f.stock <= 3 ? '#d4a636' : '#2e6b47', fontWeight: 600 }}>
                            {f.stock ?? '—'}
                          </span>
                        </td>
                        <td className={styles.rendTdNum} style={{ fontSize: '0.78rem', color: '#888' }}>{f.ultimaSemana || '—'}</td>
                        <td className={styles.rendTdSparkline}>
                          {f.tendencia ? <Sparkline data={f.tendencia} /> : <em className={styles.dash}>—</em>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className={styles.rendTotalRow}>
                      <td className={styles.rendTdNombre}>Total</td>
                      <td className={styles.rendTdNum}>{totalUds} ud.</td>
                      <td className={styles.rendTdNum}>{totalIngresos.toFixed(0)} €</td>
                      <td /><td /><td /><td /><td /><td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Motor de conversión */}
      {tab === 'analitica' && (esPremium || esAdminUsuario) && subTabAnalitica === 'conversion' && analitica && (() => {
        const conv = analitica.conversion
        if (!conv) return (
          <div style={{ padding: '0 1.75rem 1.75rem' }}>
            <div className={styles.analiticaBloque}>
              <p className={styles.analiticaBloqueDesc}>Los datos de conversión se calcularán con más búsquedas.</p>
            </div>
          </div>
        )
        const { porVino, resumen } = conv
        const { totalEurosPerdidos, fugasCount, avgConvPct, hayDatosTPV } = resumen
        const causaLabel = { sin_foto: 'Sin foto', sin_pvp: 'Sin PVP', sin_ubicacion: 'Sin ubicación', sin_stock: 'Sin stock' }
        return (
          <div style={{ padding: '0 1.75rem 1.75rem' }}>
            {/* KPIs */}
            <div className={styles.analiticaKpis} style={{ marginBottom: '1.25rem' }}>
              <div className={styles.analiticaKpi}>
                <span className={styles.analiticaKpiNum} style={{ color: fugasCount > 0 ? '#c03030' : '#2e6b47' }}>
                  {fugasCount}
                </span>
                <span className={styles.analiticaKpiLabel}>Fugas detectadas</span>
                <span className={styles.analiticaKpiSub}>Recomendados ≥5 veces sin venta</span>
              </div>
              <div className={styles.analiticaKpi}>
                <span className={styles.analiticaKpiNum}>
                  {hayDatosTPV ? `${totalEurosPerdidos.toFixed(0)} €` : '—'}
                </span>
                <span className={styles.analiticaKpiLabel}>Euros no capturados</span>
                <span className={styles.analiticaKpiSub}>{hayDatosTPV ? 'Estimación basada en PVP' : 'Conecta Square para ver'}</span>
              </div>
              <div className={styles.analiticaKpi}>
                <span className={styles.analiticaKpiNum}>
                  {hayDatosTPV ? `${avgConvPct}%` : '—'}
                </span>
                <span className={styles.analiticaKpiLabel}>Tasa de conversión media</span>
                <span className={styles.analiticaKpiSub}>Recomendaciones que acaban en venta</span>
              </div>
            </div>

            {!hayDatosTPV && (
              <div className={styles.analiticaBanner} style={{ marginBottom: '1rem' }}>
                <span className={styles.analiticaBannerIcon}>💡</span>
                <span>Conecta Square TPV para ver qué porcentaje de recomendaciones acaban en venta real. Sin TPV, las columnas de venta aparecen como —.</span>
              </div>
            )}

            {/* Tabla de conversión */}
            <div className={styles.analiticaBloque}>
              <div className={styles.analiticaBloqueHeader}>
                <div>
                  <h3 className={styles.analiticaBloqueTitle}>Embudo por vino</h3>
                  <p className={styles.analiticaBloqueDesc}>
                    {porVino.length} vino{porVino.length !== 1 ? 's' : ''} recomendado{porVino.length !== 1 ? 's' : ''} en los últimos 30 días · ordenados por euros no capturados
                  </p>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.rendTable}>
                  <thead>
                    <tr>
                      <th className={styles.rendThNombre}>Vino</th>
                      <th className={styles.rendThNum}>Recomendado</th>
                      <th className={styles.rendThNum}>Al móvil</th>
                      <th className={styles.rendThNum}>Vendido</th>
                      <th className={styles.rendThNum}>Conversión</th>
                      <th className={styles.rendThNum}>No capturado</th>
                      <th className={styles.rendThNum}>Causas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porVino.map(v => (
                      <tr key={v.id} className={`${styles.rendRow} ${v.fuga ? styles.rendRowFuga : ''}`}>
                        <td className={styles.rendTdNombre}>
                          {v.fuga && <span className={styles.rendDot} style={{ background: '#c03030' }} title="Fuga: recomendado sin venta" />}
                          <span className={styles.rendVinoNombre}>{v.nombre}</span>
                        </td>
                        <td className={styles.rendTdNum}>{v.recomendado_n}</td>
                        <td className={styles.rendTdNum}>{v.movil_n > 0 ? v.movil_n : <em className={styles.dash}>—</em>}</td>
                        <td className={styles.rendTdNum}>{hayDatosTPV ? v.vendido_n : <em className={styles.dash}>—</em>}</td>
                        <td className={styles.rendTdNum}>
                          {hayDatosTPV
                            ? <span className={`${styles.margenBadge} ${v.tasa_conv >= 0.3 ? styles.margenHigh : v.tasa_conv >= 0.1 ? styles.margenMid : styles.margenLow}`}>
                                {Math.round(v.tasa_conv * 100)}%
                              </span>
                            : <em className={styles.dash}>—</em>}
                        </td>
                        <td className={styles.rendTdNum}>
                          {v.euros_perdidos !== null && v.euros_perdidos > 0
                            ? <span style={{ color: '#c03030', fontWeight: 600 }}>{v.euros_perdidos.toFixed(0)} €</span>
                            : <em className={styles.dash}>—</em>}
                        </td>
                        <td className={styles.rendTdNum}>
                          {v.causas.length > 0
                            ? <span style={{ color: '#b06000', fontSize: '.75rem' }}>{v.causas.map(c => causaLabel[c] || c).join(', ')}</span>
                            : <em className={styles.dash}>—</em>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Optimización de precios */}
      {tab === 'analitica' && (esPremium || esAdminUsuario) && subTabAnalitica === 'precios' && (() => {
        const vinosPorId = new Map(vinosVino.map(v => [String(v.id), v]))

        if (!rentabilidad || rentabilidad.coldStart || !rentabilidad.clasificados.length) return (
          <div style={{ padding: '0 1.75rem 1.75rem' }}>
            <div className={styles.analiticaBloque}>
              <p className={styles.analiticaBloqueDesc}>
                {!rentabilidad
                  ? 'Añade precio de coste en al menos 2 vinos para activar las sugerencias de precio.'
                  : 'Necesitas más datos de ventas (mínimo 20 unidades) para generar sugerencias de precio fiables.'}
              </p>
            </div>
          </div>
        )

        const FACTOR_ANUAL = 12
        const SUBIDA_PCT   = 0.07 // +7% sugerido para caballos

        function pvpSugerido(pvpActual) {
          const raw = pvpActual * (1 + SUBIDA_PCT)
          return Math.round(raw * 2) / 2 // redondea a 0,50€ más próximo
        }

        const sugerencias = rentabilidad.clasificados.map(c => {
          const v = vinosPorId.get(String(c.id))
          if (!v) return null
          const pvp   = Number(v.precio_pvp)
          const coste = Number(v.precio_coste)

          if (c.categoria === 'caballo') {
            const pvpNew    = pvpSugerido(pvp)
            const delta     = pvpNew - pvp
            const impacto   = Math.round(delta * c.ventas * FACTOR_ANUAL)
            const margenNew = Math.round(((pvpNew - coste) / pvpNew) * 100)
            return { ...c, pvp, pvpNew, delta, impacto, margenNew, accion: 'subir_precio', prioridad: impacto }
          }
          if (c.categoria === 'joya') {
            const impactoEst = Math.round(c.margenPct / 100 * pvp * rentabilidad.ventasMedio * FACTOR_ANUAL)
            return { ...c, pvp, accion: 'destacar', impacto: impactoEst, prioridad: impactoEst }
          }
          if (c.categoria === 'revisar') {
            return { ...c, pvp, accion: 'revisar', impacto: 0, prioridad: -1 }
          }
          return null
        }).filter(Boolean).sort((a, b) => b.prioridad - a.prioridad)

        const caballos  = sugerencias.filter(s => s.accion === 'subir_precio')
        const joyas     = sugerencias.filter(s => s.accion === 'destacar')
        const revisar   = sugerencias.filter(s => s.accion === 'revisar')
        const totalOportunidad = caballos.reduce((s, c) => s + c.impacto, 0)
          + joyas.reduce((s, j) => s + j.impacto, 0)

        return (
          <div style={{ padding: '0 1.75rem 1.75rem' }}>
            {/* KPIs */}
            <div className={styles.analiticaKpis} style={{ marginBottom: '1.25rem' }}>
              <div className={styles.analiticaKpi}>
                <span className={styles.analiticaKpiNum} style={{ color: caballos.length > 0 ? '#b06000' : '#2e6b47' }}>
                  {caballos.length}
                </span>
                <span className={styles.analiticaKpiLabel}>Caballos de batalla</span>
                <span className={styles.analiticaKpiSub}>Alta demanda, margen por debajo de la media</span>
              </div>
              <div className={styles.analiticaKpi}>
                <span className={styles.analiticaKpiNum}>{joyas.length}</span>
                <span className={styles.analiticaKpiLabel}>Joyas ocultas</span>
                <span className={styles.analiticaKpiSub}>Alto margen, poca visibilidad</span>
              </div>
              <div className={styles.analiticaKpi}>
                <span className={styles.analiticaKpiNum} style={{ color: totalOportunidad > 0 ? '#2e6b47' : '#aaa' }}>
                  {totalOportunidad > 0 ? `${totalOportunidad.toLocaleString('es-ES')} €` : '—'}
                </span>
                <span className={styles.analiticaKpiLabel}>Oportunidad estimada/año</span>
                <span className={styles.analiticaKpiSub}>Si aplicas las sugerencias</span>
              </div>
            </div>

            {/* Caballos — subir precio */}
            {caballos.length > 0 && (
              <div className={styles.analiticaBloque} style={{ marginBottom: '1rem' }}>
                <div className={styles.analiticaBloqueHeader}>
                  <div>
                    <h3 className={styles.analiticaBloqueTitle}>🐎 Caballos de batalla — sube el precio</h3>
                    <p className={styles.analiticaBloqueDesc}>
                      Alta demanda pero margen bajo. Una subida acotada (+7%) apenas nota el cliente y mejora la rentabilidad.
                    </p>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.rendTable}>
                    <thead>
                      <tr>
                        <th className={styles.rendThNombre}>Vino</th>
                        <th className={styles.rendThNum}>Margen actual</th>
                        <th className={styles.rendThNum}>PVP actual</th>
                        <th className={styles.rendThNum}>PVP sugerido</th>
                        <th className={styles.rendThNum}>Margen nuevo</th>
                        <th className={styles.rendThNum}>Impacto /año</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caballos.map(c => (
                        <tr key={c.id} className={styles.rendRow}>
                          <td className={styles.rendTdNombre}>
                            <span className={styles.rendVinoNombre}>{c.nombre}</span>
                            {c.bodega && <span className={styles.rendBodega}> · {c.bodega}</span>}
                          </td>
                          <td className={styles.rendTdNum}>
                            <span className={`${styles.margenBadge} ${styles.margenLow}`}>{c.margenPct}%</span>
                          </td>
                          <td className={styles.rendTdNum}>{c.pvp.toFixed(2)} €</td>
                          <td className={styles.rendTdNum} style={{ fontWeight: 700, color: '#2e6b47' }}>
                            {c.pvpNew.toFixed(2)} €
                            <span style={{ fontSize: '.68rem', color: '#aaa', marginLeft: 3 }}>+{c.delta.toFixed(2)} €</span>
                          </td>
                          <td className={styles.rendTdNum}>
                            <span className={`${styles.margenBadge} ${c.margenNew >= 40 ? styles.margenHigh : styles.margenMid}`}>{c.margenNew}%</span>
                          </td>
                          <td className={styles.rendTdNum} style={{ fontWeight: 600, color: '#2e6b47' }}>
                            ~{c.impacto.toLocaleString('es-ES')} €
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ margin: '.6rem 0 0', fontSize: '.72rem', color: '#bbb', padding: '0 .5rem' }}>
                  Sugerencia: +7% redondeado a 0,50 € · impacto anualizado basado en el ritmo de ventas actual · solo una sugerencia, tú decides.
                </p>
              </div>
            )}

            {/* Joyas — destacar */}
            {joyas.length > 0 && (
              <div className={styles.analiticaBloque} style={{ marginBottom: '1rem' }}>
                <div className={styles.analiticaBloqueHeader}>
                  <div>
                    <h3 className={styles.analiticaBloqueTitle}>💎 Joyas ocultas — dales visibilidad</h3>
                    <p className={styles.analiticaBloqueDesc}>
                      Buen margen pero poca demanda. Destacarlos en el kiosko o bajar el precio puede activarlos.
                    </p>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.rendTable}>
                    <thead>
                      <tr>
                        <th className={styles.rendThNombre}>Vino</th>
                        <th className={styles.rendThNum}>Margen</th>
                        <th className={styles.rendThNum}>PVP</th>
                        <th className={styles.rendThNum}>¿Destacado?</th>
                        <th className={styles.rendThNum}>Potencial /año</th>
                      </tr>
                    </thead>
                    <tbody>
                      {joyas.map(j => {
                        const v = vinosPorId.get(String(j.id))
                        return (
                          <tr key={j.id} className={styles.rendRow}>
                            <td className={styles.rendTdNombre}>
                              <span className={styles.rendVinoNombre}>{j.nombre}</span>
                              {j.bodega && <span className={styles.rendBodega}> · {j.bodega}</span>}
                            </td>
                            <td className={styles.rendTdNum}>
                              <span className={`${styles.margenBadge} ${j.margenPct >= 40 ? styles.margenHigh : styles.margenMid}`}>{j.margenPct}%</span>
                            </td>
                            <td className={styles.rendTdNum}>{j.pvp.toFixed(2)} €</td>
                            <td className={styles.rendTdNum}>
                              {v?.destacado
                                ? <span style={{ color: '#2e6b47', fontSize: '.8rem' }}>✓ Sí</span>
                                : <span style={{ color: '#c03030', fontSize: '.8rem' }}>✗ No — destácalo</span>}
                            </td>
                            <td className={styles.rendTdNum} style={{ fontWeight: 600, color: '#666' }}>
                              {j.impacto > 0 ? `~${j.impacto.toLocaleString('es-ES')} €` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* A revisar */}
            {revisar.length > 0 && (
              <div className={styles.analiticaBloque}>
                <div className={styles.analiticaBloqueHeader}>
                  <div>
                    <h3 className={styles.analiticaBloqueTitle}>⚠️ A revisar — bajo margen y baja demanda</h3>
                    <p className={styles.analiticaBloqueDesc}>
                      Poco margen y poca salida. Considera bajar el precio para activar demanda, o retirar la referencia.
                    </p>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.rendTable}>
                    <thead>
                      <tr>
                        <th className={styles.rendThNombre}>Vino</th>
                        <th className={styles.rendThNum}>Margen</th>
                        <th className={styles.rendThNum}>PVP actual</th>
                        <th className={styles.rendThNum}>Ventas</th>
                        <th className={styles.rendThNum}>Sugerencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revisar.map(r => (
                        <tr key={r.id} className={styles.rendRow}>
                          <td className={styles.rendTdNombre}>
                            <span className={styles.rendVinoNombre}>{r.nombre}</span>
                            {r.bodega && <span className={styles.rendBodega}> · {r.bodega}</span>}
                          </td>
                          <td className={styles.rendTdNum}>
                            <span className={`${styles.margenBadge} ${styles.margenLow}`}>{r.margenPct}%</span>
                          </td>
                          <td className={styles.rendTdNum}>{r.pvp.toFixed(2)} €</td>
                          <td className={styles.rendTdNum}>{r.ventas} ud.</td>
                          <td className={styles.rendTdNum} style={{ fontSize: '.75rem', color: '#b06000' }}>
                            Baja precio o retira
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {sugerencias.length === 0 && (
              <div className={styles.analiticaBanner}>
                <span className={styles.analiticaBannerIcon}>✓</span>
                <span>No hay sugerencias de precio por ahora. Los precios parecen bien calibrados para la demanda actual.</span>
              </div>
            )}
          </div>
        )
      })()}

      {/* Leads CRM */}
      {tab === 'leads' && (esPremium || esAdminUsuario) && (
        <div style={{ padding: '0 1.75rem 1.75rem' }}>
          <div className={styles.analiticaBloque}>
            <div className={styles.analiticaBloqueHeader}>
              <div>
                <h3 className={styles.analiticaBloqueTitle}>Leads captados</h3>
                <p className={styles.analiticaBloqueDesc}>
                  Clientes que dieron su email tras una recomendación, con consentimiento explícito.
                </p>
              </div>
              {leads?.length > 0 && (
                <button
                  type="button"
                  className={styles.btnSecundario}
                  style={{ padding: '.45rem .9rem', fontSize: '.78rem' }}
                  onClick={async () => {
                    const res = await fetch(`/api/kiosko/${slug}/admin/leads?formato=csv`, { headers: authHeaders })
                    const blob = await res.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = `leads-${slug}.csv`; a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  Exportar CSV
                </button>
              )}
            </div>

            {leadsLoad && <p className={styles.analiticaLoading}>Cargando leads…</p>}
            {!leadsLoad && leads !== null && leads.length === 0 && (
              <div className={styles.analiticaBanner} style={{ margin: '1rem 0 0' }}>
                <span className={styles.analiticaBannerIcon}>✉️</span>
                <span>Todavía sin leads. Aparecerán aquí cuando un cliente deje su email al final de una recomendación.</span>
              </div>
            )}
            {!leadsLoad && leads?.length > 0 && (
              <div style={{ overflowX: 'auto', marginTop: '.75rem' }}>
                <table className={styles.rendTable}>
                  <thead>
                    <tr>
                      <th className={styles.rendThNombre}>Email</th>
                      <th className={styles.rendThNum}>Fuente</th>
                      <th className={styles.rendThNum}>Preferencias</th>
                      <th className={styles.rendThNum}>Vinos</th>
                      <th className={styles.rendThNum}>Fecha</th>
                      <th className={styles.rendThNum}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map(l => {
                      const p = l.preferencias || {}
                      const vinos = (l.vinos_recomendados || []).map(v => v.nombre).join(', ')
                      const prefStr = [p.ocasion, p.estilo, p.presupuesto ? `${p.presupuesto}€` : '', p.consulta].filter(Boolean).join(' · ')
                      return (
                        <tr key={l.id} className={styles.rendRow}>
                          <td className={styles.rendTdNombre}><span className={styles.rendVinoNombre}>{l.email}</span></td>
                          <td className={styles.rendTdNum} style={{ fontSize: '.73rem' }}>{l.source}</td>
                          <td className={styles.rendTdNum} style={{ fontSize: '.73rem', maxWidth: 160 }}>{prefStr || '—'}</td>
                          <td className={styles.rendTdNum} style={{ fontSize: '.73rem', maxWidth: 180 }}>{vinos || '—'}</td>
                          <td className={styles.rendTdNum} style={{ fontSize: '.73rem', whiteSpace: 'nowrap' }}>
                            {new Date(l.created_at).toLocaleDateString('es-ES')}
                          </td>
                          <td className={styles.rendTdNum}>
                            <button
                              type="button"
                              onClick={() => borrarLead(l.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c44', fontSize: '.72rem', padding: '2px 6px' }}
                              title="Eliminar (RGPD)"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p style={{ margin: '.75rem 0 0', fontSize: '.72rem', color: '#bbb' }}>
                  Los emails se eliminan permanentemente al hacer clic en × (derecho de supresión RGPD).
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'leads' && !esPremium && !esAdminUsuario && (
        <div className={styles.premiumGateWrap}>
          <div className={styles.premiumGateBox}>
            <span className={styles.premiumGateIcon}>📧</span>
            <p className={styles.premiumGateTitle}>Captación de clientes — Plan Premium</p>
            <p className={styles.premiumGateDesc}>Recoge emails con consentimiento RGPD, envía la selección de vino al instante y construye tu base de clientes fieles.</p>
            <button onClick={() => setUpgradeModal('leads')} className={styles.premiumGateCta}>
              Ver qué incluye Premium →
            </button>
          </div>
        </div>
      )}

      {/* Otros productos (Square) */}
      {tab === 'otros' && <>
        <p style={{ padding: '.85rem 1.75rem 0', color: '#999', fontSize: '.8rem' }}>
          Productos importados de Square que no son vinos. Configura qué aparece en la cesta regalo y sus atributos.
        </p>

        <div className={styles.toolbar}>
          <input
            className={styles.busqueda}
            type="search"
            value={busquedaOtros}
            onChange={e => setBusquedaOtros(e.target.value)}
            placeholder="Buscar producto…"
          />
          <div className={styles.filtrosBtnWrap} ref={filtrosPanelOtrosRef}>
            <button
              type="button"
              className={`${styles.filtrosBtn} ${filtroOtrosCat !== 'todas' ? styles.filtrosBtnActivo : ''}`}
              onClick={() => setFiltrosPanelOtrosOpen(o => !o)}
            >
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true" style={{ opacity: .7 }}>
                <rect x="0" y="0" width="14" height="1.5" rx=".75" fill="currentColor"/>
                <rect x="2" y="4" width="10" height="1.5" rx=".75" fill="currentColor"/>
                <rect x="4" y="8" width="6" height="1.5" rx=".75" fill="currentColor"/>
              </svg>
              Filtros
              {filtroOtrosCat !== 'todas' && <span className={styles.filtrosBadge}>1</span>}
            </button>
            {filtrosPanelOtrosOpen && (
              <div className={styles.filtrosPanel}>
                <div className={styles.filtrosPanelRow}>
                  <select className={styles.filtroSelect} value={filtroOtrosCat} onChange={e => setFiltroOtrosCat(e.target.value)}>
                    <option value="todas">Categoría</option>
                    {categoriasOtros.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                {filtroOtrosCat !== 'todas' && (
                  <div className={styles.filtrosPanelRow}>
                    <button onClick={() => { setFiltroOtrosCat('todas'); setFiltrosPanelOtrosOpen(false) }} type="button" className={styles.btnLimpiar}>
                      × Limpiar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {nInactivosOtros > 0 && (
            <button type="button"
              className={`${styles.filtrosBtn} ${verInactivosOtros ? styles.filtrosBtnActivo : ''}`}
              onClick={() => setVerInactivosOtros(v => !v)}>
              {verInactivosOtros ? 'Ocultar inactivos' : `Inactivos (${nInactivosOtros})`}
            </button>
          )}
          <span className={styles.total}>{otrosFiltrados.length} / {vinosOtro.length} productos</span>
        </div>

        <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thFoto}>Foto</th>
                  <th>Nombre</th>
                  <th>PVP</th>
                  <th title="Categoría detectada automáticamente por el nombre. Selecciona '→ Vinos' para mover al catálogo principal.">Categoría</th>
                  <th title="¿Aparece en la cesta regalo? Auto = detectado por nombre">En cesta</th>
                  <th title="¿Es apto para veganos?">Vegano</th>
                  <th title="¿Contiene alcohol?">Alcohol</th>
                  <th title="¿Es sin gluten?">Sin gluten</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {otrosPaginados.map(v => {
                  async function patchOtro(campoOObj, valor) {
                    const body = typeof campoOObj === 'object' ? campoOObj : { [campoOObj]: valor }
                    const res = await fetch(`/api/kiosko/${slug}/admin/vinos/${v.id}`, {
                      method: 'PATCH',
                      headers: { ...authHeaders, 'Content-Type': 'application/json' },
                      body: JSON.stringify(body),
                    })
                    if (res.ok) {
                      const data = await res.json()
                      if (data.vino) setVinos(prev => prev.map(w => w.id === v.id ? { ...w, ...data.vino } : w))
                    }
                  }

                  return (
                    <tr key={v.id} className={!v.activo ? styles.rowInactivo : ''}>
                      <td className={styles.tdFoto}>
                        <AdminThumbImage src={v.foto_url} className={styles.thumb} fallback={<div className={styles.thumbPlaceholder}>—</div>} />
                      </td>
                      <td>
                        <strong className={styles.tdTrunc} style={{ maxWidth: 200 }}>{v.nombre}</strong>
                        {v.categoria === 'carta' && <span style={{ marginLeft: 6, fontSize: '.65rem', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#c9a96e', border: '1px solid #c9a96e55', borderRadius: 4, padding: '1px 5px' }}>Carta</span>}
                      </td>
                      <td>{v.precio_pvp ? `${Number(v.precio_pvp).toFixed(2)} €` : <span className={styles.dash}>—</span>}</td>
                      <td>
                        <select
                          className={styles.otrosCatSelect}
                          value={v.cat_gourmet || ''}
                          onChange={e => {
                            const val = e.target.value
                            if (val === '__vino__') {
                              if (window.confirm(`¿Mover "${v.nombre}" a la pestaña Vinos? Aparecerá en el catálogo principal.`))
                                patchOtro({ categoria: 'vino', activo: (v.stock ?? 0) > 0 })
                            } else {
                              patchOtro('cat_gourmet', val || null)
                            }
                          }}
                        >
                          <option value="">{v.cat_gourmet ? '— quitar' : '— sin categoría'}</option>
                          {categoriasOtros.map(c => <option key={c} value={c}>{c}</option>)}
                          <option value="__vino__">→ Mover a Vinos</option>
                        </select>
                      </td>

                      <td>
                        <select
                          className={`${styles.otrosBoolSelect} ${v.apto_cesta === true ? styles.otrosBoolSi : v.apto_cesta === false ? styles.otrosBoolNo : ''}`}
                          value={v.apto_cesta === true ? 'si' : v.apto_cesta === false ? 'no' : ''}
                          onChange={e => patchOtro('apto_cesta', e.target.value === 'si' ? true : e.target.value === 'no' ? false : null)}
                        >
                          <option value="">Auto</option>
                          <option value="si">Sí</option>
                          <option value="no">No</option>
                        </select>
                      </td>

                      <td>
                        <select
                          className={`${styles.otrosBoolSelect} ${v.es_vegano === true ? styles.otrosBoolSi : v.es_vegano === false ? styles.otrosBoolNo : ''}`}
                          value={v.es_vegano === true ? 'si' : v.es_vegano === false ? 'no' : ''}
                          onChange={e => patchOtro('es_vegano', e.target.value === 'si' ? true : e.target.value === 'no' ? false : null)}
                        >
                          <option value="">—</option>
                          <option value="si">Sí</option>
                          <option value="no">No</option>
                        </select>
                      </td>

                      <td>
                        <select
                          className={`${styles.otrosBoolSelect} ${v.con_alcohol === true ? styles.otrosBoolAlerta : v.con_alcohol === false ? styles.otrosBoolSi : ''}`}
                          value={v.con_alcohol === true ? 'si' : v.con_alcohol === false ? 'no' : ''}
                          onChange={e => patchOtro('con_alcohol', e.target.value === 'si' ? true : e.target.value === 'no' ? false : null)}
                        >
                          <option value="">—</option>
                          <option value="si">Sí</option>
                          <option value="no">No</option>
                        </select>
                      </td>

                      <td>
                        <select
                          className={`${styles.otrosBoolSelect} ${v.sin_gluten === true ? styles.otrosBoolSi : v.sin_gluten === false ? styles.otrosBoolNo : ''}`}
                          value={v.sin_gluten === true ? 'si' : v.sin_gluten === false ? 'no' : ''}
                          onChange={e => patchOtro('sin_gluten', e.target.value === 'si' ? true : e.target.value === 'no' ? false : null)}
                        >
                          <option value="">—</option>
                          <option value="si">Sí</option>
                          <option value="no">No</option>
                        </select>
                      </td>

                      <td>{v.stock ?? <span className={styles.dash}>—</span>}</td>
                    </tr>
                  )
                })}
                {otrosFiltrados.length === 0 && (
                  <tr><td colSpan={9} className={styles.empty}>{vinosOtro.length === 0 ? 'Sin otros productos' : 'Sin productos en esta categoría'}</td></tr>
                )}
              </tbody>
            </table>
          </div>

      {/* Paginación */}
      {totalPaginasOtros > 1 && (
        <div className={styles.paginacionBar}>
          <div className={styles.paginacionInfo}>
            {((paginaOtros - 1) * porPaginaOtros) + 1}–{Math.min(paginaOtros * porPaginaOtros, otrosFiltrados.length)} de {otrosFiltrados.length} productos
          </div>
          <div className={styles.paginacionControls}>
            <button type="button" className={styles.paginacionBtn} onClick={() => setPaginaOtros(p => Math.max(1, p - 1))} disabled={paginaOtros === 1}>‹</button>
            {Array.from({ length: totalPaginasOtros }, (_, i) => i + 1).filter(p => p === 1 || p === totalPaginasOtros || Math.abs(p - paginaOtros) <= 1).reduce((acc, p, idx, arr) => {
              if (idx > 0 && p - arr[idx - 1] > 1) acc.push(<span key={`dots-${p}`} className={styles.paginacionDots}>…</span>)
              acc.push(<button key={p} type="button" className={`${styles.paginacionBtn} ${p === paginaOtros ? styles.paginacionBtnActivo : ''}`} onClick={() => setPaginaOtros(p)}>{p}</button>)
              return acc
            }, [])}
            <button type="button" className={styles.paginacionBtn} onClick={() => setPaginaOtros(p => Math.min(totalPaginasOtros, p + 1))} disabled={paginaOtros === totalPaginasOtros}>›</button>
          </div>
          <div className={styles.paginacionPorPagina}>
            <span>Ver</span>
            {[10, 20, 30].map(n => (
              <button key={n} type="button" className={`${styles.paginacionBtn} ${porPaginaOtros === n ? styles.paginacionBtnActivo : ''}`} onClick={() => setPorPaginaOtros(n)}>{n}</button>
            ))}
          </div>
        </div>
      )}
      </> }

      {/* Catálogo: toolbar + tabla */}
      {tab === 'catalogo' && <>

      {/* Stats strip */}
      <div className={styles.statsStrip}>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{vinosVino.length}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{nActivos}</span>
          <span className={styles.statLabel}>Activos</span>
        </div>
        <button
          type="button"
          className={`${styles.statCard} ${styles.statCardClickable} ${sinFoto ? styles.statWarn : styles.statResolved}`}
          onClick={() => sinFoto ? aplicarFiltroCalidad('sin_foto') : undefined}
          disabled={!sinFoto}
          title={sinFoto ? `${sinFoto} vinos activos sin foto — clic para filtrar` : 'Todas las fotos están al día'}
        >
          <span className={styles.statNum}>{sinFoto}</span>
          <span className={styles.statLabel}>Sin foto</span>
        </button>
        <button
          type="button"
          className={`${styles.statCard} ${styles.statCardClickable} ${sinPrecio ? styles.statWarn : styles.statResolved}`}
          onClick={() => sinPrecio ? aplicarFiltroCalidad('sin_pvp') : undefined}
          disabled={!sinPrecio}
          title={sinPrecio ? `${sinPrecio} vinos activos sin precio — clic para filtrar` : 'Todos los precios están definidos'}
        >
          <span className={styles.statNum}>{sinPrecio}</span>
          <span className={styles.statLabel}>Sin PVP</span>
        </button>
        <div className={`${styles.statCard} ${sinCoste ? styles.statWarn : ''}`}>
          <span className={styles.statNum}>{sinCoste}</span>
          <span className={styles.statLabel}>Sin coste</span>
        </div>
        <button
          type="button"
          className={`${styles.statCard} ${styles.statCardClickable} ${sinStock ? styles.statWarn : styles.statResolved}`}
          onClick={() => sinStock ? aplicarFiltroCalidad('sin_stock') : undefined}
          disabled={!sinStock}
          title={sinStock ? `${sinStock} vinos activos sin stock — clic para filtrar` : 'Todos los stocks están cubiertos'}
        >
          <span className={styles.statNum}>{sinStock}</span>
          <span className={styles.statLabel}>Sin stock</span>
        </button>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{nDestacados}</span>
          <span className={styles.statLabel}>Destacados</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{conFichaIA}</span>
          <span className={styles.statLabel}>Fichas IA</span>
        </div>
      </div>

      {lastSync && (lastSync.ultimoPagoAt || lastSync.ultimoCatalogoAt) && (
        <div style={{ padding: '.55rem 1.75rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '.78rem', color: '#999', borderBottom: '1px solid rgba(0,0,0,.06)' }}>
          {lastSync.ultimoCatalogoAt && (
            <span>Catálogo Square sincronizado: <strong style={{ color: '#555' }}>{formatSyncDate(lastSync.ultimoCatalogoAt)}</strong></span>
          )}
          {lastSync.ultimoPagoAt && (
            <span>Último pago TPV registrado: <strong style={{ color: '#555' }}>{formatSyncDate(lastSync.ultimoPagoAt)}</strong></span>
          )}
        </div>
      )}

      <section className={styles.catalogChecklist}>
        <div className={styles.catalogChecklistHeader}>
          <div>
            <p className={styles.catalogChecklistKicker}>Checklist de catálogo</p>
            <h2>Preparado para el kiosko</h2>
            <p>Revisa los campos que más influyen en que el cliente encuentre, entienda y compre el vino sin preguntar.</p>
          </div>
          <div className={styles.checkProgressWrap}>
            <span className={styles.checkProgressScore}>{catalogoChecklist.score}%</span>
            <div className={styles.checkProgressBar}>
              <div
                className={styles.checkProgressBarFill}
                style={{
                  width: `${catalogoChecklist.score}%`,
                  background: catalogoChecklist.score >= 80 ? '#2a8a4a' : catalogoChecklist.score >= 50 ? '#c9a96e' : '#c44',
                }}
              />
            </div>
            <small className={styles.checkProgressLabel}>
              {catalogoChecklist.pendientes ? `${catalogoChecklist.pendientes} por revisar` : 'Todo listo'}
            </small>
          </div>
        </div>

        <div className={styles.catalogChecklistGrid}>
          {catalogoChecklist.checks.map(check => (
            <button
              key={check.id}
              type="button"
              className={`${styles.catalogCheckCard} ${check.count ? styles.catalogCheckWarn : styles.catalogCheckOk} ${filtroCalidad === check.id ? styles.catalogCheckActive : ''}`}
              onClick={() => check.count ? aplicarFiltroCalidad(check.id) : undefined}
              disabled={!check.count}
            >
              <span className={styles.catalogCheckBody}>
                <strong>{check.label}</strong>
                <small>{check.desc}</small>
              </span>
              {check.count > 0 && <span className={styles.catalogCheckCount}>{check.count}</span>}
            </button>
          ))}
        </div>

        {filtroCalidad && (
          <div className={styles.catalogChecklistFilter}>
            <span>
              Mostrando: {filtroCalidad === 'pendientes'
                ? 'todos los vinos con alguna incidencia'
                : QUALITY_CHECKS.find(check => check.id === filtroCalidad)?.label}
            </span>
            <button type="button" onClick={() => setFiltroCalidad('')}>Quitar filtro</button>
          </div>
        )}
      </section>

      <div className={styles.toolbar}>
        <input
          className={styles.busqueda}
          type="search"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar nombre, bodega, uva, D.O., país…"
        />
        <div className={styles.filtrosBtnWrap} ref={filtrosPanelRef}>
          <button
            type="button"
            className={`${styles.filtrosBtn} ${filtrosActivosCount > 0 ? styles.filtrosBtnActivo : ''}`}
            onClick={() => setFiltrosPanelOpen(o => !o)}
          >
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true" style={{ opacity: .7 }}>
              <rect x="0" y="0" width="14" height="1.5" rx=".75" fill="currentColor"/>
              <rect x="2" y="4" width="10" height="1.5" rx=".75" fill="currentColor"/>
              <rect x="4" y="8" width="6" height="1.5" rx=".75" fill="currentColor"/>
            </svg>
            Filtros
            {filtrosActivosCount > 0 && <span className={styles.filtrosBadge}>{filtrosActivosCount}</span>}
          </button>
          {filtrosPanelOpen && (
            <div className={styles.filtrosPanel}>
              <div className={styles.filtrosPanelRow}>
                <select className={styles.filtroSelect} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                  <option value="">Tipo</option>
                  {TIPOS.map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace('_',' ')}</option>
                  ))}
                </select>
                {regiones.length > 0 && (
                  <select className={styles.filtroSelect} value={filtroRegion} onChange={e => setFiltroRegion(e.target.value)}>
                    <option value="">D.O. / Región</option>
                    {regiones.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
                {paises.length > 1 && (
                  <select className={styles.filtroSelect} value={filtroPais} onChange={e => setFiltroPais(e.target.value)}>
                    <option value="">País</option>
                    {paises.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
              </div>
              <div className={styles.filtrosPanelRow}>
                <select className={styles.filtroSelect} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                  <option value="todos">Estado</option>
                  <option value="activo">Activos</option>
                  <option value="inactivo">Inactivos</option>
                </select>
                <select className={styles.filtroSelect} value={filtroStock} onChange={e => setFiltroStock(e.target.value)}>
                  <option value="todos">Stock</option>
                  <option value="con">Con stock</option>
                  <option value="sin">Sin stock</option>
                </select>
                <select className={styles.filtroSelect} value={filtroDestacado} onChange={e => setFiltroDestacado(e.target.value)}>
                  <option value="todos">Ver</option>
                  <option value="destacado">Destacados</option>
                  <option value="sin_foto">Sin foto</option>
                  <option value="sin_ia">Sin ficha IA</option>
                </select>
              </div>
              <div className={styles.filtrosPanelRow}>
                <div className={styles.precioRange}>
                  <input type="number" className={styles.precioInput} placeholder="€ min" value={precioMin}
                    onChange={e => setPrecioMin(e.target.value)} min="0" />
                  <span className={styles.precioSep}>–</span>
                  <input type="number" className={styles.precioInput} placeholder="€ max" value={precioMax}
                    onChange={e => setPrecioMax(e.target.value)} min="0" />
                </div>
                {hayFiltrosActivos && (
                  <button onClick={() => { limpiarFiltros(); setFiltrosPanelOpen(false) }} type="button" className={styles.btnLimpiar}>
                    × Limpiar todo
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {nInactivos > 0 && (
          <button type="button"
            className={`${styles.filtrosBtn} ${verInactivos ? styles.filtrosBtnActivo : ''}`}
            onClick={() => setVerInactivos(v => !v)}>
            {verInactivos ? 'Ocultar inactivos' : `Inactivos (${nInactivos})`}
          </button>
        )}
        <span className={styles.total}>{vinosFiltrados.length} / {vinosVino.length} vinos</span>
      </div>

      {/* Tabla */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thCheck}>
                <input type="checkbox"
                  checked={vinosPaginados.length > 0 && vinosPaginados.every(v => seleccionados.has(v.id))}
                  onChange={toggleSeleccionTodos}
                />
              </th>
              <th className={styles.thFoto}>Foto</th>
              <th className={styles.thSortable} onClick={() => sortHead('nombre')}>Nombre{sortArrow('nombre')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('bodega')}>Bodega{sortArrow('bodega')}</th>
              <th>Tipo</th>
              <th className={styles.thSortable} onClick={() => sortHead('region')}>D.O.{sortArrow('region')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('uva')}>Uva{sortArrow('uva')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('anada')}>Añada{sortArrow('anada')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('precio_pvp')}>PVP €{sortArrow('precio_pvp')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('precio_coste')}>Coste €{sortArrow('precio_coste')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('margen')}>Margen{sortArrow('margen')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('precio_oferta')}>Oferta €{sortArrow('precio_oferta')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('stock')}>Stock{sortArrow('stock')}</th>
              <th title="Stock mínimo — alerta si stock ≤ este valor">Mín.</th>
              <th>Estantería</th>
              <th className={styles.thCenter}>★</th>
              <th className={styles.thCenter}>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vinosPaginados.map(v => (
              <tr key={v.id} className={`${!v.activo ? styles.rowInactivo : ''} ${seleccionados.has(v.id) ? styles.rowSeleccionado : ''}`}>
                <td className={styles.tdCheck} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={seleccionados.has(v.id)} onChange={() => toggleSeleccion(v.id)} />
                </td>

                {/* Foto */}
                <td className={styles.tdFoto} onClick={() => abrirFotoFila(v.id)} title="Clic para cambiar foto">
                  {subiendoFoto === v.id ? (
                    <div className={styles.thumbSpinner} />
                  ) : (
                    <AdminThumbImage
                      src={v.foto_url}
                      className={styles.thumb}
                      fallback={<div className={styles.thumbPlaceholder}>+</div>}
                    />
                  )}
                </td>

                {/* Nombre clicable → abre modal edición */}
                <td
                  className={`${styles.tdNombre} ${styles.tdLink}`}
                  onClick={() => abrirEditar(v)}
                  title="Clic para editar"
                >
                  {v.nombre}
                  {renderQualityBadges(v)}
                </td>

                <td className={styles.tdTrunc}>{v.bodega || <em className={styles.dash}>—</em>}</td>

                <td>
                  {v.tipo
                    ? <span className={`${styles.tipoBadge} ${styles['tipo_' + v.tipo]}`}>
                        {v.tipo.replace('_',' ')}
                      </span>
                    : <em className={styles.dash}>—</em>
                  }
                </td>

                <td className={styles.tdTrunc}>{v.region || <em className={styles.dash}>—</em>}</td>
                <td className={styles.tdTrunc}>{v.uva    || <em className={styles.dash}>—</em>}</td>

                {/* Añada inline */}
                <td
                  className={styles.tdEditable}
                  onClick={e => startInline(v.id, 'anada', v.anada, e)}
                >
                  {inlineEdit?.id === v.id && inlineEdit.campo === 'anada' ? (
                    <input
                      className={styles.inlineInput}
                      type="text"
                      value={inlineEdit.valor}
                      onChange={e => setInlineEdit(p => ({ ...p, valor: e.target.value }))}
                      onBlur={guardarInline}
                      onKeyDown={e => { if (e.key === 'Enter') guardarInline(); if (e.key === 'Escape') setInlineEdit(null) }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                      style={{ width: 60 }}
                    />
                  ) : (
                    <span className={styles.inlineValue}>
                      {v.anada || <em className={styles.dash}>—</em>}
                      <span className={styles.editIcon}>✎</span>
                    </span>
                  )}
                </td>

                {/* PVP inline */}
                <td
                  className={styles.tdEditable}
                  onClick={e => startInline(v.id, 'precio_pvp', v.precio_pvp, e)}
                >
                  {inlineEdit?.id === v.id && inlineEdit.campo === 'precio_pvp' ? (
                    <input
                      className={styles.inlineInput}
                      type="number" min="0" step="0.01"
                      value={inlineEdit.valor}
                      onChange={e => setInlineEdit(p => ({ ...p, valor: e.target.value }))}
                      onBlur={guardarInline}
                      onKeyDown={e => { if (e.key === 'Enter') guardarInline(); if (e.key === 'Escape') setInlineEdit(null) }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className={styles.inlineValue}>
                      {formatPVP(v.precio_pvp) ?? <em className={styles.dash}>—</em>}
                      <span className={styles.editIcon}>✎</span>
                    </span>
                  )}
                </td>

                {/* Coste inline */}
                <td className={styles.tdEditable} onClick={e => startInline(v.id, 'precio_coste', v.precio_coste, e)}>
                  {inlineEdit?.id === v.id && inlineEdit.campo === 'precio_coste' ? (
                    <input
                      className={styles.inlineInput}
                      type="number" min="0" step="0.01"
                      value={inlineEdit.valor}
                      onChange={e => setInlineEdit(p => ({ ...p, valor: e.target.value }))}
                      onBlur={guardarInline}
                      onKeyDown={e => { if (e.key === 'Enter') guardarInline(); if (e.key === 'Escape') setInlineEdit(null) }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className={styles.inlineValue}>
                      {v.precio_coste ? `${Number(v.precio_coste).toFixed(2)} €` : <em className={styles.dash}>—</em>}
                      <span className={styles.editIcon}>✎</span>
                    </span>
                  )}
                </td>

                {/* Margen */}
                <td>
                  {Number(v.precio_pvp) > 0 && Number(v.precio_coste) > 0
                    ? (() => { const m = Math.round(((Number(v.precio_pvp) - Number(v.precio_coste)) / Number(v.precio_pvp)) * 100); return <span className={`${styles.margenBadge} ${m >= 40 ? styles.margenHigh : m >= 25 ? styles.margenMid : styles.margenLow}`}>{m}%</span> })()
                    : <em className={styles.dash}>—</em>}
                </td>

                {/* Oferta inline */}
                <td
                  className={styles.tdEditable}
                  onClick={e => startInline(v.id, 'precio_oferta', v.precio_oferta, e)}
                >
                  {inlineEdit?.id === v.id && inlineEdit.campo === 'precio_oferta' ? (
                    <input
                      className={styles.inlineInput}
                      type="number" min="0" step="0.01"
                      value={inlineEdit.valor}
                      onChange={e => setInlineEdit(p => ({ ...p, valor: e.target.value }))}
                      onBlur={guardarInline}
                      onKeyDown={e => { if (e.key === 'Enter') guardarInline(); if (e.key === 'Escape') setInlineEdit(null) }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className={styles.inlineValue}>
                      {v.precio_oferta
                        ? <span className={styles.ofertaCeldaBadge}>{Number(v.precio_oferta).toFixed(2)} €</span>
                        : <em className={styles.dash}>—</em>}
                      <span className={styles.editIcon}>✎</span>
                    </span>
                  )}
                </td>

                {/* Stock inline */}
                <td
                  className={`${styles.tdEditable} ${v.stock === 0 ? styles.stockCero : ''}`}
                  onClick={stockPending?.id === v.id ? undefined : e => startInline(v.id, 'stock', v.stock, e)}
                >
                  {stockPending?.id === v.id ? (
                    <span className={styles.stockConfirm}>
                      <span className={styles.stockConfirmText}>
                        {stockPending.anterior} → {stockPending.nuevo}
                        {stockPending.nuevo === 0 && <span className={styles.stockConfirmWarn}> · inactivo</span>}
                        {stockPending.nuevo > 0 && stockPending.anterior === 0 && (() => { const v = vinos.find(w => w.id === stockPending.id); return !v?.activo ? <span className={styles.stockConfirmOkText}> · se activa</span> : null })()}
                        {(() => { const v = vinos.find(w => w.id === stockPending.id); return v?.square_catalog_id ? <span className={styles.stockConfirmWarn}> · sincronizado con Square, la próxima venta sobreescribirá este valor</span> : null })()}
                      </span>
                      <button className={styles.stockConfirmOk} onClick={e => { e.stopPropagation(); confirmarStock() }}>✓</button>
                      <button className={styles.stockConfirmNo} onClick={e => { e.stopPropagation(); cancelarStock() }}>✗</button>
                    </span>
                  ) : inlineEdit?.id === v.id && inlineEdit.campo === 'stock' ? (
                    <input
                      className={styles.inlineInput}
                      type="number" min="0"
                      value={inlineEdit.valor}
                      onChange={e => setInlineEdit(p => ({ ...p, valor: e.target.value }))}
                      onBlur={guardarInline}
                      onKeyDown={e => { if (e.key === 'Enter') guardarInline(); if (e.key === 'Escape') setInlineEdit(null) }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className={styles.inlineValue}>
                      {v.stock ?? 0}
                      <span className={styles.editIcon}>✎</span>
                    </span>
                  )}
                </td>

                {/* Stock mínimo inline */}
                <td
                  className={`${styles.tdEditable} ${Number(v.stock ?? 0) <= Number(v.stock_minimo ?? 0) && Number(v.stock_minimo ?? 0) > 0 ? styles.stockBajoMinimo : ''}`}
                  onClick={e => startInline(v.id, 'stock_minimo', v.stock_minimo ?? 0, e)}
                >
                  {inlineEdit?.id === v.id && inlineEdit.campo === 'stock_minimo' ? (
                    <input
                      className={styles.inlineInput}
                      type="number" min="0"
                      value={inlineEdit.valor}
                      onChange={e => setInlineEdit(p => ({ ...p, valor: e.target.value }))}
                      onBlur={guardarInline}
                      onKeyDown={e => { if (e.key === 'Enter') guardarInline(); if (e.key === 'Escape') setInlineEdit(null) }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                      style={{ width: 48 }}
                    />
                  ) : (
                    <span className={styles.inlineValue}>
                      {v.stock_minimo ?? 0}
                      <span className={styles.editIcon}>✎</span>
                    </span>
                  )}
                </td>

                {/* Estantería inline */}
                <td
                  className={styles.tdEditable}
                  onClick={e => startInline(v.id, 'ubicacion_estanteria', v.ubicacion_estanteria, e)}
                >
                  {inlineEdit?.id === v.id && inlineEdit.campo === 'ubicacion_estanteria' ? (
                    <input
                      className={styles.inlineInput}
                      type="text"
                      value={inlineEdit.valor}
                      onChange={e => setInlineEdit(p => ({ ...p, valor: e.target.value }))}
                      onBlur={guardarInline}
                      onKeyDown={e => { if (e.key === 'Enter') guardarInline(); if (e.key === 'Escape') setInlineEdit(null) }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className={styles.inlineValue}>
                      {v.ubicacion_estanteria ?? <em className={styles.dash}>—</em>}
                      <span className={styles.editIcon}>✎</span>
                    </span>
                  )}
                </td>

                {/* Destacado toggle */}
                <td className={styles.tdCenter}>
                  <button
                    className={`${styles.toggleStar} ${v.destacado ? styles.toggleStarOn : ''}`}
                    onClick={() => toggleCampo(v.id, 'destacado', v.destacado)}
                    title={v.destacado ? 'Quitar destacado' : 'Marcar como destacado'}
                  >
                    {v.destacado ? '★' : '☆'}
                  </button>
                </td>

                {/* Activo toggle */}
                <td className={styles.tdCenter}>
                  <button
                    className={`${styles.toggleEstado} ${v.activo ? styles.estadoActivo : styles.estadoInactivo}`}
                    onClick={() => toggleCampo(v.id, 'activo', v.activo)}
                  >
                    {v.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </td>

                {/* Acciones */}
                <td className={styles.acciones}>
                  <button onClick={() => abrirEditar(v)} type="button" className={styles.btnEdit}>Editar</button>
                  <button
                    onClick={async () => {
                      if (!window.confirm(`¿Mover "${v.nombre}" a Otros productos? Dejará de aparecer en el catálogo de vinos.`)) return
                      await fetch(`/api/kiosko/${slug}/admin/vinos/${v.id}`, {
                        method: 'PATCH',
                        headers: { ...authHeaders, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ categoria: 'otro' }),
                      })
                      await cargar()
                    }}
                    type="button"
                    className={styles.btnEdit}
                    title="Mover a Otros productos"
                  >→ Otros</button>
                  <button onClick={() => eliminar(v.id)} type="button" className={styles.btnDelete}>✕</button>
                </td>
              </tr>
            ))}
            {vinosFiltrados.length === 0 && (
              <tr>
                <td colSpan={18} className={styles.empty}>
                  No hay vinos{busqueda ? ' con esa búsqueda' : filtroCalidad ? ' con ese filtro de checklist' : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.mobileCatalogList} aria-label="Listado movil de catalogo">
        {vinosPaginados.map(v => (
          <article key={v.id} className={`${styles.mobileWineCard} ${!v.activo ? styles.mobileWineCardInactive : ''}`}>
            <button
              type="button"
              className={styles.mobileWinePhoto}
              onClick={() => abrirFotoFila(v.id)}
              title="Cambiar foto"
            >
              {subiendoFoto === v.id ? (
                <span className={styles.thumbSpinner} />
              ) : (
                <AdminThumbImage
                  src={v.foto_url}
                  fallback={<span className={styles.mobileWinePhotoPlaceholder}>+</span>}
                />
              )}
            </button>

            <div className={styles.mobileWineMain}>
              <div className={styles.mobileWineTop}>
                {v.tipo
                  ? <span className={`${styles.tipoBadge} ${styles['tipo_' + v.tipo]}`}>{v.tipo.replace('_',' ')}</span>
                  : <span className={styles.mobileWineMuted}>Sin tipo</span>}
                {v.destacado && <span className={styles.mobileWineFeatured}>Destacado</span>}
                <span className={`${styles.mobileWineState} ${v.activo ? styles.mobileWineStateOn : styles.mobileWineStateOff}`}>
                  {v.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <button type="button" className={styles.mobileWineName} onClick={() => abrirEditar(v)}>
                {v.nombre}
              </button>
              <p className={styles.mobileWineMeta}>
                {[v.bodega, v.region, v.uva, v.anada].filter(Boolean).join(' - ') || 'Sin datos de origen'}
              </p>
              {renderQualityBadges(v)}
            </div>

            <div className={styles.mobileWineFacts}>
              {renderMobileInlineField(v, 'precio_pvp', 'PVP', v.precio_pvp, {
                type: 'number',
                min: '0',
                step: '0.01',
                display: wine => Number(wine.precio_pvp) > 0 ? formatPVP(wine.precio_pvp) : <em className={styles.dash}>-</em>,
              })}
              {renderMobileStockField(v)}
              {renderMobileInlineField(v, 'ubicacion_estanteria', 'Ubicacion', v.ubicacion_estanteria, {
                wide: true,
                display: wine => wine.ubicacion_estanteria || <em className={styles.dash}>Sin ubicar</em>,
              })}
            </div>

            <div className={styles.mobileWineActions}>
              <button type="button" className={styles.btnEdit} onClick={() => abrirEditar(v)}>Editar</button>
              <button type="button" className={styles.mobileWineSoftBtn} onClick={() => toggleCampo(v.id, 'destacado', v.destacado)}>
                {v.destacado ? 'Quitar destacado' : 'Destacar'}
              </button>
              <button type="button" className={styles.mobileWineSoftBtn} onClick={() => toggleCampo(v.id, 'activo', v.activo)}>
                {v.activo ? 'Desactivar' : 'Activar'}
              </button>
              <button type="button" className={styles.btnDelete} onClick={() => eliminar(v.id)}>Eliminar</button>
            </div>
          </article>
        ))}
        {vinosFiltrados.length === 0 && (
          <div className={styles.mobileCatalogEmpty}>
            No hay vinos{busqueda ? ' con esa busqueda' : filtroCalidad ? ' con ese filtro de checklist' : ''}.
          </div>
        )}
      </div>

      {/* Barra de acción masiva */}
      {seleccionados.size > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>{seleccionados.size} seleccionado{seleccionados.size > 1 ? 's' : ''}</span>
          <button type="button" className={styles.bulkBtn} onClick={() => accionMasiva('activo', true)}>Activar</button>
          <button type="button" className={styles.bulkBtn} onClick={() => accionMasiva('activo', false)}>Desactivar</button>
          <button type="button" className={styles.bulkBtn} onClick={() => accionMasiva('destacado', true)}>★ Destacar</button>
          <button type="button" className={styles.bulkBtn} onClick={() => accionMasiva('destacado', false)}>Quitar destacado</button>
          <button type="button" className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`} onClick={eliminarMasivo}>Eliminar</button>
          <button type="button" className={styles.bulkBtnClose} onClick={() => setSeleccionados(new Set())}>✕</button>
        </div>
      )}

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className={styles.paginacionBar}>
          <div className={styles.paginacionInfo}>
            {((paginaActual - 1) * porPagina) + 1}–{Math.min(paginaActual * porPagina, vinosFiltrados.length)} de {vinosFiltrados.length} vinos
          </div>
          <div className={styles.paginacionControls}>
            <button type="button" className={styles.paginacionBtn} onClick={() => setPaginaActual(p => Math.max(1, p - 1))} disabled={paginaActual === 1}>‹</button>
            {Array.from({ length: totalPaginas }, (_, i) => i + 1).filter(p => p === 1 || p === totalPaginas || Math.abs(p - paginaActual) <= 1).reduce((acc, p, idx, arr) => {
              if (idx > 0 && p - arr[idx - 1] > 1) acc.push(<span key={`dots-${p}`} className={styles.paginacionDots}>…</span>)
              acc.push(<button key={p} type="button" className={`${styles.paginacionBtn} ${p === paginaActual ? styles.paginacionBtnActivo : ''}`} onClick={() => setPaginaActual(p)}>{p}</button>)
              return acc
            }, [])}
            <button type="button" className={styles.paginacionBtn} onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}>›</button>
          </div>
          <div className={styles.paginacionPorPagina}>
            <span>Ver</span>
            {[10, 20, 30].map(n => (
              <button key={n} type="button" className={`${styles.paginacionBtn} ${porPagina === n ? styles.paginacionBtnActivo : ''}`} onClick={() => setPorPagina(n)}>{n}</button>
            ))}
          </div>
        </div>
      )}
      </>}

      {/* ── Modal importar ──────────────────────────────────────────────────── */}
      {modalImport && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) cerrarImport() }}>
          <div className={styles.modal} style={{ maxWidth: 560 }}>
            <div className={styles.modalHeader}>
              <h2>Importar catálogo</h2>
              <button onClick={cerrarImport} type="button" className={styles.modalClose}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {!resultImport ? (
                <>
                  <div
                    className={`${styles.dropZone} ${draggingImport ? styles.dropZoneActive : ''} ${archivoImport ? styles.dropZoneDone : ''}`}
                    onDrop={onDropImport}
                    onDragOver={e => { e.preventDefault(); setDraggingImport(true) }}
                    onDragLeave={() => setDraggingImport(false)}
                    onClick={() => document.getElementById('__importInput').click()}
                  >
                    {archivoImport ? (
                      <div className={styles.fileBadge}>
                        <span className={styles.fileBadgeName}>{archivoImport.name}</span>
                        <span className={styles.fileBadgeSize}>
                          {(archivoImport.size / 1024).toFixed(0)} KB
                        </span>
                        <button
                          className={styles.fileBadgeClear}
                          onClick={e => { e.stopPropagation(); setArchivoImport(null) }}
                        >✕</button>
                      </div>
                    ) : (
                      <>
                        <div className={styles.dropZoneIcon}>📂</div>
                        <div className={styles.dropZoneText}>Arrastra tu archivo aquí o haz clic</div>
                        <div className={styles.dropZoneHint}>CSV · Excel (.xlsx) · PDF</div>
                      </>
                    )}
                  </div>
                  <input
                    id="__importInput"
                    type="file"
                    accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    style={{ display: 'none' }}
                    onChange={e => { setArchivoImport(e.target.files?.[0] || null); e.target.value = '' }}
                  />

                  <div className={styles.importModo}>
                    <label>
                      <input type="radio" name="modo" value="añadir"
                        checked={modoImport === 'añadir'} onChange={() => setModoImport('añadir')} />
                      <span>Añadir al catálogo existente</span>
                    </label>
                    <label>
                      <input type="radio" name="modo" value="solo_precios"
                        checked={modoImport === 'solo_precios'} onChange={() => setModoImport('solo_precios')} />
                      <span>Actualizar solo precios (PVP / coste) — por nombre + bodega</span>
                    </label>
                    <label>
                      <input type="radio" name="modo" value="solo_stock"
                        checked={modoImport === 'solo_stock'} onChange={() => setModoImport('solo_stock')} />
                      <span>Actualizar solo stock — por nombre + bodega</span>
                    </label>
                    <label>
                      <input type="radio" name="modo" value="reemplazar"
                        checked={modoImport === 'reemplazar'} onChange={() => setModoImport('reemplazar')} />
                      <span className={styles.modoReemplazar}>Reemplazar todo el catálogo</span>
                    </label>
                    {modoImport === 'reemplazar' && (
                      <p className={styles.importWarning}>
                        ⚠ Esto borrará los {vinosVino.length} vinos del catálogo y los reemplazará con el archivo. Los productos de &ldquo;Otros&rdquo; (gourmet, Square) no se borran.
                      </p>
                    )}
                  </div>
                </>
              ) : resultImport.error ? (
                <p className={styles.msgError}>{resultImport.error}</p>
              ) : (
                <div className={styles.importResultado}>
                  <p className={styles.importOk}>✓ Importación completada</p>
                  {resultImport.insertados > 0 && <p>{resultImport.insertados} vinos importados correctamente</p>}
                  {resultImport.actualizados > 0 && <p>{resultImport.actualizados} vinos actualizados</p>}
                  {resultImport.sinCambios > 0 && <p style={{ color: '#aaa' }}>{resultImport.sinCambios} vinos no encontrados (omitidos)</p>}
                  {resultImport.omitidos > 0 && (
                    <p className={styles.importWarn}>{resultImport.omitidos} filas sin nombre omitidas</p>
                  )}
                  {resultImport.errores?.length > 0 && (
                    <ul className={styles.importErrores}>
                      {resultImport.errores.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button onClick={cerrarImport} type="button" className={styles.btnSecundario}>
                {resultImport ? 'Cerrar' : 'Cancelar'}
              </button>
              {!resultImport && (
                <button
                  onClick={importar}
                  disabled={!archivoImport || importando}
                  type="button"
                  className={styles.btnPrimario}
                >
                  {importando ? 'Importando…' : 'Importar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal añadir / editar ────────────────────────────────────────────── */}
      {modal !== null && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) cerrarModal() }}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{modal === 'nuevo' ? 'Añadir vino' : 'Editar vino'}</h2>
              <button onClick={cerrarModal} type="button" className={styles.modalClose}>✕</button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalLayout}>

                {/* Columna izquierda: foto */}
                <div className={styles.fotoSection}>
                  <span className={styles.fotoLabel}>FOTO</span>
                  <div
                    className={`${styles.fotoZone} ${form.foto_url ? styles.fotoZoneHasFoto : ''} ${draggingFoto ? styles.fotoZoneDragging : ''}`}
                    onDrop={onDropFotoModal}
                    onDragOver={e => { e.preventDefault(); setDraggingFoto(true) }}
                    onDragLeave={() => setDraggingFoto(false)}
                    onClick={() => fotoInputModalRef.current?.click()}
                  >
                    {subiendoFoto === modal?.id ? (
                      <div className={styles.fotoUploadSpinner} />
                    ) : form.foto_url ? (
                      <img src={form.foto_url} alt="" className={styles.fotoPreviewImg} />
                    ) : (
                      <>
                        <span className={styles.fotoZoneIcon}>🖼</span>
                        <span className={styles.fotoZoneText}>Subir foto</span>
                        <span className={styles.fotoZoneHint}>JPG · PNG · WebP · 5 MB</span>
                      </>
                    )}
                  </div>
                  {form.foto_url && (
                    <div className={styles.fotoActions}>
                      <button type="button" onClick={() => fotoInputModalRef.current?.click()} className={styles.btnFotoSmall}>
                        Cambiar
                      </button>
                      <button type="button" onClick={eliminarFotoModal} className={`${styles.btnFotoSmall} ${styles.btnFotoSmallDanger}`}>
                        Quitar
                      </button>
                    </div>
                  )}
                  <input
                    type="text"
                    className={styles.urlInput}
                    value={form.foto_url?.startsWith('blob:') ? '' : (form.foto_url || '')}
                    onChange={e => cambiar('foto_url', e.target.value)}
                    placeholder="O pega una URL…"
                  />
                  <input
                    ref={fotoInputModalRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={onFileFotoModal}
                  />
                </div>

                {/* Columna derecha: formulario */}
                <div className={styles.formGrid}>
                  <div className={styles.formField}>
                    <label>Nombre *</label>
                    <input value={form.nombre} onChange={e => cambiar('nombre', e.target.value)} placeholder="Nombre del vino" />
                  </div>
                  <div className={styles.formField}>
                    <label>Bodega</label>
                    <input value={form.bodega} onChange={e => cambiar('bodega', e.target.value)} placeholder="Bodega" />
                  </div>
                  <div className={styles.formField}>
                    <label>Tipo</label>
                    <select value={form.tipo} onChange={e => cambiar('tipo', e.target.value)}>
                      <option value="">— Seleccionar —</option>
                      {TIPOS.map(t => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace('_',' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formField}>
                    <label>Uva</label>
                    <input value={form.uva} onChange={e => cambiar('uva', e.target.value)} placeholder="Tempranillo, Albariño…" />
                  </div>
                  <div className={styles.formField}>
                    <label>Añada</label>
                    <input value={form.anada} onChange={e => cambiar('anada', e.target.value)} placeholder="2021" />
                  </div>
                  <div className={styles.formField}>
                    <label>D.O. / Región</label>
                    <input value={form.region} onChange={e => cambiar('region', e.target.value)} placeholder="Rioja, Ribera del Duero…" />
                  </div>
                  <div className={styles.formField}>
                    <label>País</label>
                    <input value={form.pais} onChange={e => cambiar('pais', e.target.value)} placeholder="España" />
                  </div>
                  <div className={styles.formField}>
                    <label>PVP (€)</label>
                    <input type="number" min="0" step="0.01" value={form.precio_pvp} onChange={e => cambiar('precio_pvp', e.target.value)} placeholder="0.00" />
                  </div>
                  <div className={styles.formField}>
                    <label>Coste (€)</label>
                    <input type="number" min="0" step="0.01" value={form.precio_coste} onChange={e => cambiar('precio_coste', e.target.value)} placeholder="0.00" />
                  </div>
                  <div className={styles.formField}>
                    <label>Precio oferta (€)</label>
                    <input type="number" min="0" step="0.01" value={form.precio_oferta} onChange={e => cambiar('precio_oferta', e.target.value)} placeholder="0.00" />
                  </div>
                  <div className={styles.formField}>
                    <label>Stock</label>
                    <input type="number" min="0" value={form.stock} onChange={e => cambiar('stock', e.target.value)} placeholder="0" />
                  </div>
                  <div className={styles.formField}>
                    <label>Stock mínimo</label>
                    <input type="number" min="0" value={form.stock_minimo ?? 0} onChange={e => cambiar('stock_minimo', e.target.value)} placeholder="0" />
                  </div>
                  <div className={styles.formField}>
                    <label>Estantería</label>
                    <input value={form.ubicacion_estanteria} onChange={e => cambiar('ubicacion_estanteria', e.target.value)} placeholder="Pasillo B3…" />
                  </div>
                  <div className={styles.formField}>
                    <label>Puntuación</label>
                    <input type="number" min="0" max="100" value={form.puntuacion} onChange={e => cambiar('puntuacion', e.target.value)} placeholder="92" />
                  </div>
                  <div className={`${styles.formField} ${styles.formFieldFull}`}>
                    <label>Notas de cata</label>
                    <textarea rows={2} value={form.notas_cata} onChange={e => cambiar('notas_cata', e.target.value)} placeholder="Frutos rojos, especias, tanino suave…" />
                  </div>
                  <div className={`${styles.formField} ${styles.formFieldFull}`}>
                    <label>Descripción</label>
                    <textarea rows={2} value={form.descripcion} onChange={e => cambiar('descripcion', e.target.value)} placeholder="Descripción del vino…" />
                  </div>
                  <div className={`${styles.formToggles} ${styles.formFieldFull}`}>
                    <label>
                      <input type="checkbox" checked={form.destacado} onChange={e => cambiar('destacado', e.target.checked)} />
                      Destacado
                    </label>
                    <label>
                      <input type="checkbox" checked={form.activo} onChange={e => cambiar('activo', e.target.checked)} />
                      Activo (visible en kiosko)
                    </label>
                  </div>
                  {modal !== 'nuevo' && form.ficha_ia && (
                    <div className={`${styles.formField} ${styles.formFieldFull}`}>
                      <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Ficha IA</span>
                        <span style={{ fontSize: '.72rem', color: '#aaa', fontWeight: 400 }}>Solo lectura</span>
                      </label>
                      <textarea
                        readOnly
                        rows={4}
                        value={typeof form.ficha_ia === 'string' ? form.ficha_ia : JSON.stringify(form.ficha_ia, null, 2)}
                        style={{ resize: 'vertical', background: 'rgba(255,255,255,.04)', color: '#bbb', cursor: 'default', fontSize: '.8rem' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              {msg && <span className={msg.startsWith('✓') ? styles.msgOk : styles.msgError}>{msg}</span>}
              <button onClick={cerrarModal} type="button" className={styles.btnSecundario}>Cancelar</button>
              {modal !== 'nuevo' && (
                <button onClick={duplicar} disabled={guardando} type="button" className={styles.btnSecundario}>
                  Duplicar
                </button>
              )}
              <button onClick={guardar} disabled={guardando} type="button" className={styles.btnPrimario}>
                {guardando ? 'Guardando…' : modal === 'nuevo' ? 'Añadir vino' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal upgrade Premium */}
      {upgradeModal && <UpgradeModal feature={upgradeModal} onClose={() => setUpgradeModal(null)} />}
    </div>
  )
}
