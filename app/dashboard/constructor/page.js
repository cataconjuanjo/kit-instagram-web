'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { cargarDemoDashboard } from '../../lib/demoDashboardClient'
import {
  SELECT_CLIENT_RESTAURANTE_DASHBOARD,
  SELECT_CLIENT_VINO_DASHBOARD,
} from '../../lib/clientSupabaseSelects'
import { esPerfilBodega } from '../../lib/plans'
import { downloadElementAsPdf, downloadElementAsPng } from '../../lib/visualExportClient'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

const SECCIONES = [
  'Espumosos',
  'Blancos',
  'Rosados',
  'Tintos',
  'Generosos',
  'Dulces',
  'Por copa',
  'Especiales',
]

function seccionPorTipo(vino = {}) {
  if (Number(vino.precio_copa) > 0) return 'Por copa'
  const tipo = String(vino.tipo || '').toLowerCase()
  if (tipo.includes('espum')) return 'Espumosos'
  if (tipo.includes('blanco')) return 'Blancos'
  if (tipo.includes('ros')) return 'Rosados'
  if (tipo.includes('generoso') || tipo.includes('fino') || tipo.includes('oloroso')) return 'Generosos'
  if (tipo.includes('dulce')) return 'Dulces'
  if (tipo.includes('tinto')) return 'Tintos'
  return 'Especiales'
}

function eur(valor) {
  const n = Number(valor) || 0
  return n ? `${n.toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR` : ''
}

function lineaCarta(vino) {
  return [
    vino.nombre,
    vino.bodega,
    vino.anada,
    vino.region,
    vino.uva,
  ].filter(Boolean).join(' - ')
}

function parseLine(linea) {
  const limpia = String(linea || '').replace(/^\s*[-*]\s*/, '').trim()
  if (!limpia) return null
  const partes = limpia.includes('|')
    ? limpia.split('|').map(p => p.trim())
    : limpia.split(/\s+-\s+/).map(p => p.trim())
  return {
    tempId: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    nombre: partes[0] || limpia,
    bodega: partes[1] || '',
    region: partes[2] || '',
    uva: '',
    anada: '',
    tipo: '',
    precio_botella: '',
    precio_copa: '',
    proveedor: '',
    seccion: 'Especiales',
    origen: 'manual',
  }
}

export default function ConstructorCarta() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [draft, setDraft] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [textoImportar, setTextoImportar] = useState('')
  const [plantilla, setPlantilla] = useState('gastronomica')
  const [modoSalida, setModoSalida] = useState('cliente')
  const [mensaje, setMensaje] = useState('')
  const [exportando, setExportando] = useState('')
  const [loading, setLoading] = useState(true)
  const exportRef = useRef(null)

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId, isDemo } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) { window.location.href = '/login'; return }

      if (isDemo) {
        const demo = await cargarDemoDashboard(email)
        if (demo?.restaurante) {
          setRestaurante(demo.restaurante)
          const base = (demo.vinos || []).filter(v => v.activo).map(vino => ({ ...vino, tempId: vino.id, seccion: seccionPorTipo(vino), origen: 'bodega' }))
          setVinos(base)
          setDraft(base)
        }
        setLoading(false)
        return
      }

      const queryRestaurante = supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_DASHBOARD)
      const { data: rest } = restauranteId
        ? await queryRestaurante.eq('id', restauranteId).single()
        : await queryRestaurante.eq('email', email).single()
      setRestaurante(rest || null)
      if (rest?.id) {
        const [{ data: vinosData }, { data: sessionData }] = await Promise.all([
          supabase.from('vinos').select(SELECT_CLIENT_VINO_DASHBOARD).eq('restaurante_id', rest.id).eq('activo', true).order('tipo').order('nombre'),
          supabase.auth.getSession(),
        ])
        const base = (vinosData || []).map(vino => ({ ...vino, tempId: vino.id, seccion: seccionPorTipo(vino), origen: 'bodega' }))
        setVinos(base)
        setDraft(base)

        const token = sessionData.session?.access_token || ''
        try {
          const res = await fetch(`/api/proveedores-catalogo?${new URLSearchParams({ restaurante_id: rest.id, limit: '20' })}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          const payload = await res.json()
          if (res.ok) setProveedores(payload.proveedores || [])
        } catch {}

        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search)
          const catalogo = params.get('catalogo')
          const proveedor = params.get('proveedor')
          if (catalogo) {
            setDraft(actual => [
              {
                tempId: `catalogo-${Date.now()}`,
                nombre: catalogo,
                bodega: params.get('bodega') || '',
                region: params.get('region') || '',
                uva: params.get('uva') || '',
                anada: params.get('anada') || '',
                tipo: '',
                precio_botella: params.get('pvp') || '',
                precio_copa: '',
                coste_compra: params.get('coste') || '',
                stock: '',
                stock_minimo: '',
                proveedor: proveedor || '',
                seccion: 'Especiales',
                origen: 'catalogo',
              },
              ...actual,
            ])
          }
        }
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const agrupado = useMemo(() => {
    return SECCIONES.map(seccion => ({
      seccion,
      vinos: draft.filter(vino => vino.seccion === seccion),
    })).filter(grupo => grupo.vinos.length)
  }, [draft])

  const textoSalida = useMemo(() => {
    const titulo = modoSalida === 'interna'
      ? `Borrador interno de bodega - ${restaurante?.nombre || 'Carta Viva Sumiller'}`
      : restaurante?.nombre ? `Carta de vinos - ${restaurante.nombre}` : 'Carta de vinos'
    const lineas = [
      titulo,
      modoSalida === 'interna'
        ? 'Versión interna: proveedor, coste, stock y notas de control'
        : plantilla === 'minimalista' ? 'Formato minimalista' : plantilla === 'clasica' ? 'Formato clásico' : 'Formato gastronómico',
      '',
      ...agrupado.flatMap(grupo => [
        grupo.seccion.toUpperCase(),
        ...grupo.vinos.map(vino => {
          const precio = [vino.precio_copa ? `Copa ${eur(vino.precio_copa)}` : '', vino.precio_botella ? `Botella ${eur(vino.precio_botella)}` : ''].filter(Boolean).join(' / ')
          if (modoSalida === 'interna') {
            const control = [
              vino.proveedor ? `Proveedor: ${vino.proveedor}` : 'Proveedor pendiente',
              vino.coste_compra ? `Coste: ${eur(vino.coste_compra)}` : 'Coste pendiente',
              vino.stock !== '' && vino.stock != null ? `Stock: ${vino.stock}` : '',
              vino.stock_minimo ? `Mínimo: ${vino.stock_minimo}` : '',
            ].filter(Boolean).join(' | ')
            return `${lineaCarta(vino)}${precio ? ` | ${precio}` : ''} | ${control}`
          }
          return `${lineaCarta(vino)}${precio ? ` | ${precio}` : ''}`
        }),
        '',
      ]),
    ]
    return lineas.join('\n')
  }, [agrupado, modoSalida, plantilla, restaurante])

  if (loading) return <LoadingState />
  if (!restaurante) return null

  function importarTexto() {
    const nuevos = textoImportar.split(/\r?\n/).map(parseLine).filter(Boolean)
    if (!nuevos.length) return
    setDraft(actual => [...nuevos, ...actual])
    setTextoImportar('')
    setMensaje(`${nuevos.length} referencias añadidas al borrador`)
    setTimeout(() => setMensaje(''), 1800)
  }

  function actualizar(id, cambios) {
    setDraft(actual => actual.map(vino => vino.tempId === id ? { ...vino, ...cambios } : vino))
  }

  function quitar(id) {
    setDraft(actual => actual.filter(vino => vino.tempId !== id))
  }

  async function copiarSalida() {
    await navigator.clipboard?.writeText(textoSalida)
    setMensaje('Carta estructurada copiada')
    setTimeout(() => setMensaje(''), 1800)
  }

  function descargarTxt() {
    const blob = new Blob([textoSalida], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${modoSalida === 'interna' ? 'borrador-interno-bodega' : 'carta-vinos'}-${restaurante?.slug || 'sumiller'}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  function nombreArchivoBase() {
    const tipo = modoSalida === 'interna' ? 'borrador-interno-bodega' : 'carta-vinos'
    return `${tipo}-${restaurante?.slug || 'sumiller'}`
  }

  async function descargarImagen() {
    if (!exportRef.current || exportando) return
    setExportando('png')
    setMensaje('')
    try {
      await downloadElementAsPng(exportRef.current, nombreArchivoBase(), { backgroundColor: '#fffaf3' })
      setMensaje('Imagen exportada')
      setTimeout(() => setMensaje(''), 1800)
    } catch {
      setMensaje('No se pudo exportar la imagen.')
    } finally {
      setExportando('')
    }
  }

  async function descargarPdf() {
    if (!exportRef.current || exportando) return
    setExportando('pdf')
    setMensaje('')
    try {
      await downloadElementAsPdf(exportRef.current, nombreArchivoBase(), { backgroundColor: '#fffaf3' })
      setMensaje('PDF exportado')
      setTimeout(() => setMensaje(''), 1800)
    } catch {
      setMensaje('No se pudo exportar el PDF.')
    } finally {
      setExportando('')
    }
  }

  return (
    <FeatureGate restaurante={restaurante} feature="bodega" title="Constructor no incluido">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Carta de bodega"
        title="Constructor de carta"
        subtitle={esPerfilBodega(restaurante)
          ? 'Crea una carta desde cero o desde tu bodega, ordena secciones, asigna proveedores y exporta una salida limpia para maquetar en Word.'
          : 'Constructor interno para preparar una carta estructurada antes de publicarla o maquetarla.'}
        actions={<Link className={styles.secondary} href="/dashboard/catalogo">Buscar en catálogo</Link>}
        help={{
          title: 'Flujo recomendado',
          intro: 'Primero estructura contenido y datos. La decoración final puede hacerse después en Word o una plantilla propia.',
          items: [
            { title: 'Desde bodega', text: 'Parte de tus referencias activas y reordena secciones.' },
            { title: 'Desde cero', text: 'Pega una lista de vinos y completa proveedor, precio o sección.' },
            { title: 'Exportar', text: 'Copia una salida limpia para Word, PDF o maquetación externa.' },
          ],
        }}
      >
        {mensaje && <div className={styles.inlineToast} style={{ marginBottom: 16 }}><span>{mensaje}</span><button type="button" onClick={() => setMensaje('')}>Cerrar</button></div>}

        <section className={styles.statsGrid}>
          <div className={styles.stat}><p className={styles.statValue}>{draft.length}</p><p className={styles.statLabel}>Referencias en borrador</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{agrupado.length}</p><p className={styles.statLabel}>Secciones con vinos</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{draft.filter(vino => vino.proveedor).length}</p><p className={styles.statLabel}>Con proveedor</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{draft.filter(vino => Number(vino.precio_copa) > 0).length}</p><p className={styles.statLabel}>Por copa</p></div>
        </section>

        <section className={styles.gridTwo}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Importar o empezar desde cero</h2>
                <p className={styles.panelSub}>Pega una referencia por línea. Usa &quot;Nombre - Bodega - Región&quot; o separa por barras.</p>
              </div>
            </div>
            <div className={styles.panelBody}>
              <textarea
                className={styles.textarea}
                value={textoImportar}
                onChange={event => setTextoImportar(event.target.value)}
                rows={8}
                placeholder={'Veronica Ortega Quite - Bierzo\nZarate Albarino | Zarate | Rias Baixas'}
              />
              <div className={styles.actionRow} style={{ marginTop: 12 }}>
                <button className={styles.primary} type="button" onClick={importarTexto}>Añadir al borrador</button>
                <button className={styles.ghost} type="button" onClick={() => setDraft(vinos)}>Reiniciar desde bodega</button>
              </div>
            </div>
          </div>

          <div className={styles.panelDark}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Salida estructurada</h2>
                <p className={styles.panelSub}>Contenido limpio para pasarlo a Word y rematar formato, decoración o portada.</p>
              </div>
            </div>
            <div className={styles.panelBody}>
              <label className={styles.label}>Plantilla</label>
              <select className={styles.select} value={plantilla} onChange={event => setPlantilla(event.target.value)}>
                <option value="gastronomica">Gastronómica</option>
                <option value="clasica">Clásica</option>
                <option value="minimalista">Minimalista</option>
              </select>
              <div className={styles.actionRow} style={{ marginTop: 10 }}>
                <button className={modoSalida === 'cliente' ? styles.primary : styles.secondary} type="button" onClick={() => setModoSalida('cliente')}>Carta cliente</button>
                <button className={modoSalida === 'interna' ? styles.primary : styles.secondary} type="button" onClick={() => setModoSalida('interna')}>Versión interna</button>
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto', marginTop: 14, color: '#fffaf3', fontSize: 12, lineHeight: 1.55 }}>{textoSalida}</pre>
              <div className={styles.actionRow} style={{ marginTop: 12 }}>
                <button className={styles.primary} type="button" onClick={copiarSalida}>Copiar</button>
                <button className={styles.secondary} type="button" onClick={descargarTxt}>Descargar TXT</button>
                <button className={styles.secondary} type="button" onClick={descargarImagen} disabled={Boolean(exportando)}>PNG</button>
                <button className={styles.secondary} type="button" onClick={descargarPdf} disabled={Boolean(exportando)}>PDF</button>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel} style={{ marginTop: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Vista exportable</h2>
              <p className={styles.panelSub}>Previsualiza una version limpia para enviar, imprimir o seguir maquetando fuera de Carta Viva.</p>
            </div>
            <div className={styles.actionRow}>
              <button className={styles.secondary} type="button" onClick={descargarImagen} disabled={Boolean(exportando)}>{exportando === 'png' ? 'Exportando...' : 'Descargar PNG'}</button>
              <button className={styles.primary} type="button" onClick={descargarPdf} disabled={Boolean(exportando)}>{exportando === 'pdf' ? 'Exportando...' : 'Descargar PDF'}</button>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.exportPreviewShell}>
              <article
                ref={exportRef}
                className={`${styles.exportDocument} ${styles[`exportDocument_${plantilla}`] || ''} ${modoSalida === 'interna' ? styles.exportDocumentInternal : ''}`}
              >
                <header className={styles.exportDocumentHeader}>
                  <p>{modoSalida === 'interna' ? 'Borrador interno de bodega' : 'Carta de vinos'}</p>
                  <h2>{restaurante?.nombre || 'Carta Viva'}</h2>
                  <span>{plantilla === 'minimalista' ? 'Formato minimalista' : plantilla === 'clasica' ? 'Formato clasico' : 'Formato gastronomico'}</span>
                </header>

                <div className={styles.exportDocumentBody}>
                  {agrupado.length ? agrupado.map(grupo => (
                    <section key={grupo.seccion} className={styles.exportSection}>
                      <h3>{grupo.seccion}</h3>
                      <div className={styles.exportWineList}>
                        {grupo.vinos.map(vino => {
                          const precio = [vino.precio_copa ? `Copa ${eur(vino.precio_copa)}` : '', vino.precio_botella ? `Botella ${eur(vino.precio_botella)}` : ''].filter(Boolean).join(' / ')
                          const detalle = [vino.bodega, vino.region, vino.uva, vino.anada].filter(Boolean).join(' - ')
                          const control = modoSalida === 'interna'
                            ? [vino.proveedor && `Proveedor ${vino.proveedor}`, vino.coste_compra && `Coste ${eur(vino.coste_compra)}`, vino.stock !== '' && vino.stock != null && `Stock ${vino.stock}`, vino.stock_minimo && `Min ${vino.stock_minimo}`].filter(Boolean).join(' | ')
                            : ''
                          return (
                            <article key={vino.tempId} className={styles.exportWineRow}>
                              <div>
                                <strong>{vino.nombre}</strong>
                                {detalle && <small>{detalle}</small>}
                                {control && <em>{control}</em>}
                              </div>
                              {precio && <span>{precio}</span>}
                            </article>
                          )
                        })}
                      </div>
                    </section>
                  )) : (
                    <p className={styles.exportEmpty}>Anade referencias al borrador para generar una carta exportable.</p>
                  )}
                </div>

                <footer className={styles.exportDocumentFooter}>
                  <span>{draft.length} referencias</span>
                  <span>{new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())}</span>
                </footer>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.panel} style={{ marginTop: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Borrador de carta</h2>
              <p className={styles.panelSub}>Ajusta sección, proveedor y precio antes de exportar.</p>
            </div>
            <span className={styles.badge}>{draft.length} refs.</span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.itemStack}>
              {draft.map(vino => (
                <article key={vino.tempId} className={styles.itemCard}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <p className={styles.eyebrow}>{vino.origen === 'catalogo' ? 'Catálogo' : vino.origen === 'manual' ? 'Manual' : 'Bodega'}</p>
                      <h3 className={styles.sectionTitle}>{vino.nombre}</h3>
                      <p className={styles.sectionText}>{[vino.bodega, vino.region, vino.uva, vino.anada].filter(Boolean).join(' - ') || 'Completa bodega, zona o añada si lo necesitas.'}</p>
                    </div>
                    <button className={styles.ghost} type="button" onClick={() => quitar(vino.tempId)}>Quitar</button>
                  </div>
                  <div className={styles.formGrid} style={{ marginTop: 12 }}>
                    <div>
                      <label className={styles.label}>Sección</label>
                      <select className={styles.select} value={vino.seccion} onChange={event => actualizar(vino.tempId, { seccion: event.target.value })}>
                        {SECCIONES.map(seccion => <option key={seccion} value={seccion}>{seccion}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={styles.label}>Proveedor</label>
                      <input className={styles.input} list="constructor-proveedores" value={vino.proveedor || ''} onChange={event => actualizar(vino.tempId, { proveedor: event.target.value })} />
                    </div>
                    <div>
                      <label className={styles.label}>Copa</label>
                      <input className={styles.input} value={vino.precio_copa || ''} onChange={event => actualizar(vino.tempId, { precio_copa: event.target.value })} />
                    </div>
                    <div>
                      <label className={styles.label}>Botella</label>
                      <input className={styles.input} value={vino.precio_botella || ''} onChange={event => actualizar(vino.tempId, { precio_botella: event.target.value })} />
                    </div>
                    <div>
                      <label className={styles.label}>Coste</label>
                      <input className={styles.input} value={vino.coste_compra || ''} onChange={event => actualizar(vino.tempId, { coste_compra: event.target.value })} />
                    </div>
                    <div>
                      <label className={styles.label}>Stock mínimo</label>
                      <input className={styles.input} value={vino.stock_minimo || ''} onChange={event => actualizar(vino.tempId, { stock_minimo: event.target.value })} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <datalist id="constructor-proveedores">
              {proveedores.map(proveedor => <option key={proveedor.nombre} value={proveedor.nombre} />)}
            </datalist>
          </div>
        </section>
      </ModuleShell>
    </FeatureGate>
  )
}
