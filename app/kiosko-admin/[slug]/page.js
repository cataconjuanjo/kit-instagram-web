'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import styles from './admin.module.css'
import { supabase } from '../../supabase'
import { isAdminEmail } from '../../demo'

const TIPOS = ['tinto','blanco','rosado','espumoso','generoso','dulce','naranja','sin_alcohol']

const WHATSAPP_VENTAS = '34601502868'

// ── Constantes de personalización ─────────────────────────────────────────────

const PALETAS = [
  { id: 'clasico',  label: 'Clásico',         primario: '#0d0d1a', acento: '#c9a96e' },
  { id: 'blanco',   label: 'Blanco elegante',  primario: '#FAFAF8', acento: '#1a1a2e' },
  { id: 'verde',    label: 'Verde vinoteca',   primario: '#122012', acento: '#7cb87c' },
  { id: 'burdeos',  label: 'Burdeos',          primario: '#1a0408', acento: '#c45069' },
  { id: 'azul',     label: 'Azul pizarra',     primario: '#0f1729', acento: '#7099cf' },
  { id: 'arena',    label: 'Arena cálida',     primario: '#f5f0e8', acento: '#8b6341' },
]

const FUENTES = [
  { id: 'clasica',  label: 'Clásica',   muestra: 'El arte del vino',  css: "'Playfair Display', Georgia, serif",    google: 'Playfair+Display:ital,wght@0,400;0,700;1,400' },
  { id: 'moderna',  label: 'Moderna',   muestra: 'El arte del vino',  css: "'Inter', system-ui, sans-serif",         google: null },
  { id: 'elegante', label: 'Elegante',  muestra: 'El arte del vino',  css: "'Cormorant Garamond', Palatino, serif",  google: 'Cormorant+Garamond:ital,wght@0,400;0,600;1,400' },
  { id: 'natural',  label: 'Natural',   muestra: 'El arte del vino',  css: "'Lato', Trebuchet MS, sans-serif",       google: 'Lato:wght@400;700' },
]

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

function AjustesTab({ slug, tienda, onSaved }) {
  const esPremium = !tienda?.plan || tienda.plan === 'premium'
  const [ajustes, setAjustes] = useState({
    nombre:         tienda?.nombre         || '',
    ciudad:         tienda?.ciudad         || '',
    descripcion:    tienda?.descripcion    || '',
    logo_url:       tienda?.logo_url       || '',
    color_primario: tienda?.color_primario || '#0d0d1a',
    color_acento:   tienda?.color_acento   || '#c9a96e',
    font_family:    tienda?.font_family    || 'clasica',
    informe_email:  tienda?.informe_email  || '',
  })
  const [logoFile,     setLogoFile]     = useState(null)
  const [logoPreview,  setLogoPreview]  = useState(tienda?.logo_url || '')
  const [draggingLogo, setDraggingLogo] = useState(false)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [guardando,    setGuardando]    = useState(false)
  const [msg,          setMsg]          = useState('')
  const logoInputRef = useRef(null)

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
        const r = await fetch(`/api/kiosko/${slug}/admin/upload-logo`, { method: 'POST', body: fd })
        const d = await r.json()
        setSubiendoLogo(false)
        if (!r.ok) throw new Error(d.error || 'Error subiendo logo')
        logoUrl = d.url
        setLogoPreview(logoUrl)
        setLogoFile(null)
      }

      const r = await fetch(`/api/kiosko/${slug}/admin/ajustes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
              Cada lunes a las 8:00 recibirás un resumen con las búsquedas de la semana, los vinos más recomendados y alertas de stock. Deja el campo vacío para no recibir el informe.
            </p>
          </div>
        ) : (
          <PremiumLock>
            <div className={styles.ajustesSec}>
              <p className={styles.ajustesSecTitulo}>Informe semanal por email</p>
              <div className={styles.ajustesFormGrid}>
                <div className={styles.ajustesFormField}>
                  <label>Email donde recibir el informe</label>
                  <input type="email" disabled placeholder="Disponible en plan Premium" />
                </div>
              </div>
            </div>
          </PremiumLock>
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
          <PremiumLock>
            <div className={styles.ajustesSec}>
              <p className={styles.ajustesSecTitulo}>Widget para tu web</p>
              <p style={{ fontSize: '.78rem', color: '#888', margin: '0 0 .75rem' }}>
                Añade el kiosko como botón flotante en tu web. Disponible en plan Premium.
              </p>
              <div className={styles.widgetEmbedBox} style={{ opacity: .45 }}>
                <code className={styles.widgetEmbedCode}>&lt;script src="..."&gt;&lt;/script&gt;</code>
              </div>
            </div>
          </PremiumLock>
        )}

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
            {[
              { icon: '🍾', label: 'Explorar vinos' },
              { icon: '🤔', label: 'Ayúdame\na elegir' },
              { icon: '🍽️', label: '¿Con qué\nlo tomo?' },
            ].map(a => (
              <div key={a.label} className={styles.previewActionCard}
                style={{ background: panelColor, border: `1px solid ${ajustes.color_acento}22` }}>
                <span className={styles.previewActionIcon}>{a.icon}</span>
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
  )
}

function TrialGate({ tienda }) {
  const precioBasico   = 49
  const setupFee       = tienda.setup_fee_incluido ? null : 100
  const precioPremium  = tienda.precio_especial || 129
  const esEspecial     = !!tienda.precio_especial

  function waMsg(plan) {
    const txt = encodeURIComponent(`Hola, acabo de probar el Kiosko Virtual de ${tienda.nombre || 'mi tienda'} y me interesa el plan ${plan}. ¿Cuándo podemos hablarlo?`)
    return `https://wa.me/${WHATSAPP_VENTAS}?text=${txt}`
  }

  return (
    <div className={styles.trialGate}>
      <p className={styles.trialGateTitle}>Tu prueba ha terminado 🍷</p>
      <p className={styles.trialGateDesc}>
        Has explorado el Kiosko Virtual al completo. Elige tu plan para seguir ofreciendo a tus clientes una experiencia premium.
      </p>
      <div className={styles.trialGatePlans}>

        {/* Básico */}
        <div className={styles.trialPlanCard}>
          <p className={styles.trialPlanNombre}>Plan Básico</p>
          <p className={styles.trialPlanPrecio}>{precioBasico} <span style={{ fontSize: '1rem' }}>€/mes</span></p>
          {setupFee && <p className={styles.trialPlanPrecioSub}>+ {setupFee} € puesta en marcha</p>}
          <ul className={styles.trialPlanFeatures}>
            <li>Kiosko táctil completo</li>
            <li>Catálogo y gestión de stock</li>
            <li>Precios oferta y multi-idioma</li>
            <li>Historial de movimientos</li>
          </ul>
          <a href={waMsg('Básico')} target="_blank" rel="noreferrer" className={`${styles.trialPlanCta} ${styles.trialPlanCtaSecundario}`}>
            Quiero el Básico
          </a>
        </div>

        {/* Premium */}
        <div className={`${styles.trialPlanCard} ${styles.trialPlanCardPremium}`}>
          <span className={styles.trialPlanBadge}>Recomendado</span>
          <p className={styles.trialPlanNombre}>Plan Premium</p>
          <p className={styles.trialPlanPrecio}>{precioPremium} <span style={{ fontSize: '1rem' }}>€/mes</span></p>
          {setupFee && <p className={styles.trialPlanPrecioSub}>+ {setupFee} € puesta en marcha</p>}
          {esEspecial && <span className={styles.trialPlanEspecial}>★ Precio fundador · Puesta en marcha incluida</span>}
          <ul className={styles.trialPlanFeatures}>
            <li>Todo lo del plan Básico</li>
            <li>Analítica completa de búsquedas</li>
            <li>Informe semanal por email</li>
            <li>Alertas de stock y predicción</li>
            <li>Widget embebible para tu web</li>
          </ul>
          <a href={waMsg('Premium')} target="_blank" rel="noreferrer" className={styles.trialPlanCta}>
            Quiero el Premium →
          </a>
        </div>
      </div>
    </div>
  )
}

const VINO_VACIO = {
  nombre:'', bodega:'', tipo:'', uva:'', anada:'', region:'', pais:'España',
  precio_pvp:'', precio_coste:'', stock:'', ubicacion_estanteria:'',
  foto_url:'', notas_cata:'', descripcion:'', puntuacion:'', destacado:false, activo:true,
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
  const [analitica, setAnalitica]   = useState(null)
  const [analiticaLoad, setAnaliticaLoad] = useState(false)

  const esPremium = !tienda?.plan || tienda.plan === 'premium' || tienda.plan === 'trial'

  // ── Trial ──────────────────────────────────────────────────────────────────
  const [trialSegsRestantes, setTrialSegsRestantes] = useState(null)

  useEffect(() => {
    if (tienda?.plan !== 'trial') return
    if (previewTrial) return   // modo preview: no arranca el reloj
    if (esAdminUsuario) return // admin nunca consume el trial
    let cleanup
    async function iniciarTrial() {
      let expiresAt = tienda.trial_expires_at
      if (!expiresAt) {
        const res = await fetch(`/api/kiosko/${slug}/admin/trial-start`, { method: 'POST' })
        const d = await res.json()
        expiresAt = d.trial_expires_at
      }
      if (!expiresAt) return
      function tick() {
        setTrialSegsRestantes(Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000)))
      }
      tick()
      const iv = setInterval(tick, 1000)
      cleanup = () => clearInterval(iv)
    }
    iniciarTrial()
    return () => cleanup?.()
  }, [tienda?.plan, tienda?.trial_expires_at, slug, previewTrial, esAdminUsuario])

  const [busqueda, setBusqueda]           = useState('')
  const [filtroTipo, setFiltroTipo]       = useState('')
  const [filtroEstado, setFiltroEstado]   = useState('todos')
  const [filtroRegion, setFiltroRegion]   = useState('')
  const [filtroPais, setFiltroPais]       = useState('')
  const [filtroStock, setFiltroStock]     = useState('todos')
  const [precioMin, setPrecioMin]         = useState('')
  const [precioMax, setPrecioMax]         = useState('')
  const [ordenPor, setOrdenPor]           = useState('nombre')
  const [ordenDir, setOrdenDir]           = useState('asc')

  const [filtroDestacado, setFiltroDestacado] = useState('todos')

  const [modalImport, setModalImport]     = useState(false)
  const [archivoImport, setArchivoImport] = useState(null)
  const [modoImport, setModoImport]       = useState('añadir')
  const [importando, setImportando]       = useState(false)
  const [resultImport, setResultImport]   = useState(null)
  const [draggingImport, setDraggingImport] = useState(false)

  useEffect(() => { if (slug) cargar() }, [slug])

  // Tras un pago exitoso, el webhook puede tardar unos segundos.
  // Si subscription_status sigue en 'pending', reintentamos cada 3s hasta 30s.
  useEffect(() => {
    if (!checkoutOk || !tienda) return
    if (tienda.subscription_status !== 'pending') return

    setEsperandoWebhook(true)
    let intentos = 0
    const intervalo = setInterval(async () => {
      intentos++
      const res = await fetch(`/api/kiosko/${slug}/meta`)
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
  }, [checkoutOk, tienda?.subscription_status])

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

      const [r1, r2] = await Promise.all([
        fetch(`/api/kiosko/${slug}/meta`),
        fetch(`/api/kiosko/${slug}/admin/vinos`),
      ])
      if (!r1.ok) throw new Error('Tienda no encontrada')
      const meta = await r1.json()
      const dv   = await r2.json()
      setTienda({ ...meta.tienda, _token: session.access_token })
      setVinos(dv.vinos || [])
    } catch (e) { setError(e.message) }
    finally     { setCargando(false)  }
  }

  async function irACheckout() {
    if (!tienda?._token) return
    setGenerandoCheckout(true)
    try {
      const res = await fetch(`/api/kiosko/${slug}/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tienda._token}` },
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {}
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
        headers: { 'Content-Type': 'application/json' },
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

  async function eliminar(id) {
    if (!confirm('¿Eliminar este vino?')) return
    await fetch(`/api/kiosko/${slug}/admin/vinos/${id}`, { method: 'DELETE' })
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      setVinos(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v))
      // Log historial
      fetch(`/api/kiosko/${slug}/admin/stock-log`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vino_id: id, vino_nombre: vino?.nombre, stock_anterior: anterior, stock_nuevo: nuevo }),
      }).catch(() => {})
      // Alerta instantánea si stock bajo
      if (nuevo <= 3) {
        fetch(`/api/kiosko/${slug}/admin/alerta-stock`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      const res  = await fetch(`/api/kiosko/${slug}/admin/upload-foto`, { method: 'POST', body: fd })
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vinoId: modal.id }),
      })
    }
    if (form.foto_url?.startsWith('blob:')) URL.revokeObjectURL(form.foto_url)
    cambiar('foto_url', '')
    setFotoFileModal(null)
  }

  // ── Importar ───────────────────────────────────────────────────────────────
  async function importar() {
    if (!archivoImport) return
    setImportando(true); setResultImport(null)
    const fd = new FormData()
    fd.append('file', archivoImport)
    fd.append('reemplazar', modoImport === 'reemplazar' ? '1' : '0')
    try {
      const res  = await fetch(`/api/kiosko/${slug}/admin/importar`, { method: 'POST', body: fd })
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

  // ── Filtros ────────────────────────────────────────────────────────────────
  const regiones = useMemo(() => [...new Set(vinos.map(v => v.region).filter(Boolean))].sort(), [vinos])
  const paises   = useMemo(() => [...new Set(vinos.map(v => v.pais).filter(Boolean))].sort(), [vinos])

  const vinosFiltrados = useMemo(() => {
    return vinos
      .filter(v => {
        if (filtroTipo      && v.tipo   !== filtroTipo)   return false
        if (filtroEstado === 'activo'   && !v.activo)     return false
        if (filtroEstado === 'inactivo' &&  v.activo)     return false
        if (filtroRegion    && v.region !== filtroRegion) return false
        if (filtroPais      && v.pais   !== filtroPais)   return false
        if (filtroStock === 'sin' && Number(v.stock) > 0) return false
        if (filtroStock === 'con' && !(Number(v.stock) > 0)) return false
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
        let va = a[ordenPor], vb = b[ordenPor]
        if (['precio_pvp', 'precio_coste', 'precio_oferta', 'stock', 'puntuacion'].includes(ordenPor)) {
          va = Number(va) || 0; vb = Number(vb) || 0
        } else {
          va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase()
        }
        if (va < vb) return ordenDir === 'asc' ? -1 : 1
        if (va > vb) return ordenDir === 'asc' ? 1 : -1
        return 0
      })
  }, [vinos, filtroTipo, filtroEstado, filtroRegion, filtroPais, filtroStock, filtroDestacado, precioMin, precioMax, busqueda, ordenPor, ordenDir])

  const hayFiltrosActivos = filtroTipo || filtroEstado !== 'todos' || filtroRegion || filtroPais ||
    filtroStock !== 'todos' || filtroDestacado !== 'todos' || precioMin !== '' || precioMax !== '' || busqueda

  function limpiarFiltros() {
    setBusqueda(''); setFiltroTipo(''); setFiltroEstado('todos')
    setFiltroRegion(''); setFiltroPais(''); setFiltroStock('todos')
    setFiltroDestacado('todos'); setPrecioMin(''); setPrecioMax('')
  }

  function sortHead(campo) {
    if (ordenPor === campo) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdenPor(campo); setOrdenDir('asc') }
  }

  function sortArrow(campo) {
    if (ordenPor !== campo) return ' ↕'
    return ordenDir === 'asc' ? ' ↑' : ' ↓'
  }

  // Stats (memoizadas — se recalculan solo cuando cambia el catálogo)
  const { sinFoto, sinPrecio, sinCoste, sinStock, nActivos, nDestacados, conFichaIA } = useMemo(() => ({
    sinFoto:     vinos.filter(v => !v.foto_url).length,
    sinPrecio:   vinos.filter(v => !v.precio_pvp).length,
    sinCoste:    vinos.filter(v => v.precio_pvp && !v.precio_coste).length,
    sinStock:    vinos.filter(v => !Number(v.stock)).length,
    nActivos:    vinos.filter(v => v.activo).length,
    nDestacados: vinos.filter(v => v.destacado).length,
    conFichaIA:  vinos.filter(v => v.has_ficha_ia).length,
  }), [vinos])

  async function cargarAnalitica() {
    setAnaliticaLoad(true)
    try {
      const res  = await fetch(`/api/kiosko/${slug}/admin/analitica`)
      const data = await res.json()
      setAnalitica(res.ok ? data : { vacio: true })
    } catch { setAnalitica({ vacio: true }) }
    finally { setAnaliticaLoad(false) }
  }

  const rentabilidad = useMemo(() => {
    const conCoste = vinos.filter(v => v.activo && Number(v.precio_pvp) > 0 && Number(v.precio_coste) > 0)
    if (conCoste.length < 2) return null
    const popularidad = {}
    if (analitica?.topVinos) analitica.topVinos.forEach(v => { popularidad[String(v.id)] = v.veces })
    const calculados = conCoste.map(v => ({
      id: v.id, nombre: v.nombre, bodega: v.bodega, tipo: v.tipo,
      margenPct: Math.round(((Number(v.precio_pvp) - Number(v.precio_coste)) / Number(v.precio_pvp)) * 100),
      recomendaciones: popularidad[String(v.id)] || 0,
    }))
    const margenMedio = calculados.reduce((s, v) => s + v.margenPct, 0) / calculados.length
    const recomMedio  = calculados.reduce((s, v) => s + v.recomendaciones, 0) / calculados.length
    const clasificados = calculados.map(v => ({
      ...v,
      categoria: v.margenPct >= margenMedio && v.recomendaciones >= recomMedio ? 'estrella'
        : v.margenPct <  margenMedio && v.recomendaciones >= recomMedio ? 'caballo'
        : v.margenPct >= margenMedio && v.recomendaciones <  recomMedio ? 'joya'
        : 'revisar',
    }))
    return { clasificados, margenMedio: Math.round(margenMedio), recomMedio: Math.round(recomMedio), sinCoste: vinos.filter(v => v.activo && v.precio_pvp && !v.precio_coste).length }
  }, [vinos, analitica])

  const alertasStock = useMemo(() => {
    if (!analitica?.topVinos?.length) return []
    return analitica.topVinos
      .map(tv => {
        const v = vinos.find(w => String(w.id) === String(tv.id))
        if (!v || !v.activo) return null
        const stock = Number(v.stock)
        if (stock > 5 && tv.diasRestantes === null) return null
        if (stock > 5 && (tv.diasRestantes === null || tv.diasRestantes > 14)) return null
        return { id: v.id, nombre: v.nombre, bodega: v.bodega, stock, recomendaciones: tv.veces, critico: stock === 0, diasRestantes: tv.diasRestantes }
      })
      .filter(Boolean)
      .sort((a, b) => (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999) || b.recomendaciones - a.recomendaciones)
  }, [vinos, analitica])

  function exportarCSV() {
    const a = document.createElement('a')
    a.href = `/api/kiosko/${slug}/admin/exportar`
    a.download = `kiosko-${slug}-vinos.csv`
    a.click()
  }

  function formatPVP(v) { return v != null ? `${Number(v).toFixed(2)} €` : null }

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
  const pendienteDePago = !esAdminUsuario && tienda?.subscription_status === 'pending'
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
          <a href="/kiosko-admin" className={styles.headerBack} title="Todas las tiendas">‹</a>
          {tienda?.logo_url
            ? <img src={tienda.logo_url} alt={tienda.nombre} className={styles.headerLogo} />
            : <span className={styles.headerLogoPlaceholder}>🍷</span>
          }
          <div>
            <p className={styles.titulo}>{tienda?.nombre || 'Kiosko Admin'}</p>
            {tienda?.ciudad && <p className={styles.subtitulo}>{tienda.ciudad}</p>}
          </div>
        </div>
        <div className={styles.headerActions}>
          <a href={`/kiosko/${slug}`} target="_blank" rel="noreferrer" className={styles.btnSecundario}>
            Ver kiosko →
          </a>
          {tab === 'catalogo' && <>
            <button onClick={exportarCSV} type="button" className={styles.btnSecundario}>
              Exportar CSV
            </button>
            <button onClick={() => { setModalImport(true); setResultImport(null) }} type="button" className={styles.btnSecundario}>
              Importar
            </button>
            <button onClick={abrirNuevo} type="button" className={styles.btnPrimario}>
              + Añadir vino
            </button>
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
        <TrialGate tienda={tienda} />
      )}

      {/* Tab nav */}
      <nav className={styles.tabNav}>
        <button type="button" className={`${styles.tabBtn} ${tab === 'catalogo' ? styles.tabBtnActive : ''}`} onClick={() => setTab('catalogo')}>
          Catálogo
        </button>
        <button type="button" className={`${styles.tabBtn} ${tab === 'analitica' ? styles.tabBtnActive : ''}`}
          onClick={() => { setTab('analitica'); if (esPremium && !analitica && !analiticaLoad) cargarAnalitica() }}>
          Analítica{!esPremium && <span className={styles.tabPremiumBadge}>★</span>}
        </button>
        <button type="button" className={`${styles.tabBtn} ${tab === 'ajustes' ? styles.tabBtnActive : ''}`} onClick={() => setTab('ajustes')}>
          Ajustes
        </button>
      </nav>

      {/* Ajustes */}
      {tab === 'ajustes' && tienda && (
        <AjustesTab slug={slug} tienda={tienda} onSaved={cargar} />
      )}

      {/* Analítica — bloqueada en plan Básico */}
      {tab === 'analitica' && !esPremium && (
        <div className={styles.premiumGateWrap}>
          <div className={styles.premiumGateBox}>
            <span className={styles.premiumGateIcon}>📊</span>
            <p className={styles.premiumGateTitle}>Analítica — Plan Premium</p>
            <p className={styles.premiumGateDesc}>Accede a búsquedas, vinos más recomendados, tendencias semanales, predicción de agotamiento y alertas de stock.</p>
            <span className={styles.premiumGateBadge}>Premium</span>
          </div>
        </div>
      )}

      {tab === 'analitica' && esPremium && (
        <div className={styles.analiticaWrap}>
          {analiticaLoad && <p className={styles.analiticaLoading}>Cargando datos…</p>}
          {!analiticaLoad && analitica && (() => {
            const vacio = analitica.vacio
            const SKELETON = [88, 72, 60, 48, 36]
            return (
              <>
                {vacio && (
                  <div className={styles.analiticaBanner}>
                    <span className={styles.analiticaBannerIcon}>📊</span>
                    <span>Todavía sin búsquedas — los datos aparecen aquí automáticamente cuando los clientes usen el kiosko</span>
                  </div>
                )}

                {/* Alertas de reposición */}
                {alertasStock.length > 0 ? (
                  <div className={styles.alertasBloque}>
                    <p className={styles.alertasTitulo}>⚠️ Alertas de reposición</p>
                    <p className={styles.alertasDesc}>Vinos que el asistente recomienda con frecuencia pero tienen stock bajo</p>
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

                {/* KPIs */}
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
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{analitica.modos?.maridaje ?? 0}</span>
                    <span className={styles.analiticaKpiLabel}>¿Con qué lo tomo? (plato)</span>
                  </div>
                  <div className={styles.analiticaKpi}>
                    <span className={`${styles.analiticaKpiNum} ${vacio ? styles.kpiEmpty : ''}`}>{analitica.modos?.wizard ?? 0}</span>
                    <span className={styles.analiticaKpiLabel}>Ayúdame a elegir (ocasión)</span>
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
                </div>

                {/* Tendencias semanales */}
                {!vacio && analitica.tendencias?.length > 0 && (() => {
                  const maxT = Math.max(...analitica.tendencias.map(t => t.total), 1)
                  return (
                    <div className={styles.analiticaBloque} style={{ marginTop: '1.5rem' }}>
                      <h3 className={styles.analiticaBloqueTitle}>Actividad semanal</h3>
                      <p className={styles.analiticaBloqueDesc}>Consultas al asistente por semana — azul: por ocasión · ámbar: por maridaje</p>
                      <div className={styles.tendenciasChart}>
                        {analitica.tendencias.map((t, i) => (
                          <div key={i} className={styles.tendenciaCol}>
                            <div className={styles.tendenciaBarWrap} style={{ height: 80 }}>
                              <div className={styles.tendenciaBarFill} style={{ height: `${(t.total / maxT) * 100}%` }}>
                                <div className={styles.tendenciaSegWizard} style={{ flex: t.wizard || 0 }} />
                                <div className={styles.tendenciaSegMaridaje} style={{ flex: t.maridaje || 0 }} />
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
                            <span className={`${styles.analiticaMode} ${r.mode === 'wizard' ? styles.analiticaModeWizard : styles.analiticaModeMaridaje}`}>
                              {r.mode === 'wizard' ? 'Ocasión' : 'Plato'}
                            </span>
                            <span className={styles.analiticaRecienteConsulta}>{r.consulta}</span>
                            <span className={styles.analiticaRecienteVinos}>{r.vinos.join(', ')}</span>
                            <span className={styles.analiticaRecienteFecha}>{new Date(r.fecha).toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        ))
                    }
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* Rentabilidad — solo en Premium */}
      {tab === 'analitica' && esPremium && (
        <div style={{ padding: '0 1.75rem 1.75rem' }}>
          <div className={styles.analiticaBloque}>
            <div className={styles.analiticaBloqueHeader}>
              <div>
                <h3 className={styles.analiticaBloqueTitle}>Análisis de rentabilidad</h3>
                <p className={styles.analiticaBloqueDesc}>
                  {rentabilidad
                    ? <>Cruce entre margen bruto y popularidad (veces recomendado por el asistente) — umbral margen {rentabilidad.margenMedio}%, umbral recomendaciones {rentabilidad.recomMedio}{rentabilidad.sinCoste > 0 && ` · ${rentabilidad.sinCoste} vino${rentabilidad.sinCoste > 1 ? 's' : ''} activo${rentabilidad.sinCoste > 1 ? 's' : ''} sin precio de coste (no aparecen)`}</>
                    : 'Introduce el precio de coste en la columna "Coste €" del Catálogo para activar este análisis. Necesitas al menos 2 vinos con coste.'}
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
                          <span className={styles.bcgVinoStats}>{v.margenPct}% · {v.recomendaciones}×</span>
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

      {/* Catálogo: toolbar + tabla */}
      {tab === 'catalogo' && <>

      {/* Stats strip */}
      <div className={styles.statsStrip}>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{vinos.length}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{nActivos}</span>
          <span className={styles.statLabel}>Activos</span>
        </div>
        <div className={`${styles.statCard} ${sinFoto ? styles.statWarn : ''}`}>
          <span className={styles.statNum}>{sinFoto}</span>
          <span className={styles.statLabel}>Sin foto</span>
        </div>
        <div className={`${styles.statCard} ${sinPrecio ? styles.statWarn : ''}`}>
          <span className={styles.statNum}>{sinPrecio}</span>
          <span className={styles.statLabel}>Sin PVP</span>
        </div>
        <div className={`${styles.statCard} ${sinCoste ? styles.statWarn : ''}`}>
          <span className={styles.statNum}>{sinCoste}</span>
          <span className={styles.statLabel}>Sin coste</span>
        </div>
        <div className={`${styles.statCard} ${sinStock ? styles.statWarn : ''}`}>
          <span className={styles.statNum}>{sinStock}</span>
          <span className={styles.statLabel}>Sin stock</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{nDestacados}</span>
          <span className={styles.statLabel}>Destacados</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{conFichaIA}</span>
          <span className={styles.statLabel}>Fichas IA</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.busqueda}
          type="search"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar nombre, bodega, uva, D.O., país…"
        />
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
        <div className={styles.precioRange}>
          <input type="number" className={styles.precioInput} placeholder="€ min" value={precioMin}
            onChange={e => setPrecioMin(e.target.value)} min="0" />
          <span className={styles.precioSep}>–</span>
          <input type="number" className={styles.precioInput} placeholder="€ max" value={precioMax}
            onChange={e => setPrecioMax(e.target.value)} min="0" />
        </div>
        {hayFiltrosActivos && (
          <button onClick={limpiarFiltros} type="button" className={styles.btnLimpiar}>× Limpiar</button>
        )}
        <span className={styles.total}>{vinosFiltrados.length} / {vinos.length} vinos</span>
      </div>

      {/* Tabla */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thFoto}>Foto</th>
              <th className={styles.thSortable} onClick={() => sortHead('nombre')}>Nombre{sortArrow('nombre')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('bodega')}>Bodega{sortArrow('bodega')}</th>
              <th>Tipo</th>
              <th className={styles.thSortable} onClick={() => sortHead('region')}>D.O.{sortArrow('region')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('uva')}>Uva{sortArrow('uva')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('anada')}>Añada{sortArrow('anada')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('precio_pvp')}>PVP €{sortArrow('precio_pvp')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('precio_coste')}>Coste €{sortArrow('precio_coste')}</th>
              <th>Margen</th>
              <th className={styles.thSortable} onClick={() => sortHead('precio_oferta')}>Oferta €{sortArrow('precio_oferta')}</th>
              <th className={styles.thSortable} onClick={() => sortHead('stock')}>Stock{sortArrow('stock')}</th>
              <th>Estantería</th>
              <th className={styles.thCenter}>★</th>
              <th className={styles.thCenter}>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vinosFiltrados.map(v => (
              <tr key={v.id} className={!v.activo ? styles.rowInactivo : ''}>

                {/* Foto */}
                <td className={styles.tdFoto} onClick={() => abrirFotoFila(v.id)} title="Clic para cambiar foto">
                  {subiendoFoto === v.id ? (
                    <div className={styles.thumbSpinner} />
                  ) : v.foto_url ? (
                    <img src={v.foto_url} alt="" className={styles.thumb} loading="lazy" />
                  ) : (
                    <div className={styles.thumbPlaceholder}>+</div>
                  )}
                </td>

                {/* Nombre clicable → abre modal edición */}
                <td
                  className={`${styles.tdNombre} ${styles.tdLink}`}
                  onClick={() => abrirEditar(v)}
                  title="Clic para editar"
                >
                  {v.nombre}
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
                    ? (() => { const m = Math.round(((Number(v.precio_pvp) - Number(v.precio_coste)) / Number(v.precio_pvp)) * 100); return <span className={`${styles.margenBadge} ${m >= 65 ? styles.margenHigh : m >= 50 ? styles.margenMid : styles.margenLow}`}>{m}%</span> })()
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
                  <button onClick={() => eliminar(v.id)} type="button" className={styles.btnDelete}>✕</button>
                </td>
              </tr>
            ))}
            {vinosFiltrados.length === 0 && (
              <tr>
                <td colSpan={13} className={styles.empty}>
                  No hay vinos{busqueda ? ' con esa búsqueda' : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
                      <input type="radio" name="modo" value="reemplazar"
                        checked={modoImport === 'reemplazar'} onChange={() => setModoImport('reemplazar')} />
                      <span className={styles.modoReemplazar}>Reemplazar todo el catálogo</span>
                    </label>
                    {modoImport === 'reemplazar' && (
                      <p className={styles.importWarning}>
                        ⚠ Esto borrará los {vinos.length} vinos actuales y los reemplazará con el contenido del archivo.
                      </p>
                    )}
                  </div>
                </>
              ) : resultImport.error ? (
                <p className={styles.msgError}>{resultImport.error}</p>
              ) : (
                <div className={styles.importResultado}>
                  <p className={styles.importOk}>✓ Importación completada</p>
                  <p>{resultImport.insertados} vinos importados correctamente</p>
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
                    <label>Stock</label>
                    <input type="number" min="0" value={form.stock} onChange={e => cambiar('stock', e.target.value)} placeholder="0" />
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
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              {msg && <span className={msg.startsWith('✓') ? styles.msgOk : styles.msgError}>{msg}</span>}
              <button onClick={cerrarModal} type="button" className={styles.btnSecundario}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} type="button" className={styles.btnPrimario}>
                {guardando ? 'Guardando…' : modal === 'nuevo' ? 'Añadir vino' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
