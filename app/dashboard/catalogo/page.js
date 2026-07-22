'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { SELECT_CLIENT_RESTAURANTE_DASHBOARD } from '../../lib/clientSupabaseSelects'
import { esPerfilBodega } from '../../lib/plans'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

const PAGE_SIZE = 20

function eur(valor) {
  return `${(Number(valor) || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR`
}

function crearFichaHref(item) {
  const params = new URLSearchParams({
    new: '1',
    catalogo: item.nombre || '',
  })
  if (item.proveedor) params.set('proveedor', item.proveedor)
  if (item.bodega) params.set('bodega', item.bodega)
  if (item.region) params.set('region', item.region)
  if (item.uva) params.set('uva', item.uva)
  if (item.anada) params.set('anada', item.anada)
  if (item.coste_estimado) params.set('coste', String(item.coste_estimado))
  if (item.pvp_recomendado) params.set('pvp', String(item.pvp_recomendado))
  return `/dashboard/vinos?${params.toString()}`
}

function llevarCartaHref(item) {
  const params = new URLSearchParams({ catalogo: item.nombre || '' })
  if (item.proveedor) params.set('proveedor', item.proveedor)
  if (item.bodega) params.set('bodega', item.bodega)
  if (item.region) params.set('region', item.region)
  if (item.uva) params.set('uva', item.uva)
  if (item.anada) params.set('anada', item.anada)
  if (item.coste_estimado) params.set('coste', String(item.coste_estimado))
  if (item.pvp_recomendado) params.set('pvp', String(item.pvp_recomendado))
  return `/dashboard/constructor?${params.toString()}`
}

export default function CatalogoProveedores() {
  const [restaurante, setRestaurante] = useState(null)
  const [items, setItems] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingCatalogo, setLoadingCatalogo] = useState(false)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [token, setToken] = useState('')

  const cargarCatalogo = useCallback(async ({ restId, accessToken, q = '', proveedorFiltro = '', pageNumber = 1 } = {}) => {
    const id = restId
    if (!id) return
    setLoadingCatalogo(true)
    setError('')
    try {
      const params = new URLSearchParams({
        restaurante_id: id,
        limit: String(PAGE_SIZE),
        page: String(pageNumber),
      })
      if (q.trim()) params.set('q', q.trim())
      if (proveedorFiltro) params.set('proveedor', proveedorFiltro)
      const res = await fetch(`/api/proveedores-catalogo?${params}`, { headers: { Authorization: `Bearer ${accessToken || ''}` } })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'No se pudo cargar el catalogo.')
      setItems(payload.items || [])
      setProveedores(payload.proveedores || [])
      setTotal(payload.total || 0)
      setHasMore(Boolean(payload.hasMore))
    } catch (err) {
      setError(err.message || 'No se pudo cargar el catalogo.')
      setItems([])
      setTotal(0)
      setHasMore(false)
    }
    setLoadingCatalogo(false)
  }, [])

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) { window.location.href = '/login'; return }
      const queryRestaurante = supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_DASHBOARD)
      const { data: rest } = restauranteId
        ? await queryRestaurante.eq('id', restauranteId).single()
        : await queryRestaurante.eq('email', email).single()
      setRestaurante(rest || null)
      if (!rest?.id) { setLoading(false); return }

      const { data } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token || ''
      setToken(accessToken)
      await cargarCatalogo({ restId: rest.id, accessToken, q: '', proveedorFiltro: '', pageNumber: 1 })
      setLoading(false)
    }
    cargar()
  }, [cargarCatalogo])

  useEffect(() => {
    if (!restaurante?.id || loading) return
    const timeout = setTimeout(() => {
      setPage(1)
      cargarCatalogo({ restId: restaurante.id, accessToken: token, q: busqueda, proveedorFiltro: proveedor, pageNumber: 1 })
    }, 260)
    return () => clearTimeout(timeout)
  }, [busqueda, proveedor, restaurante?.id, loading, token, cargarCatalogo])

  if (loading) return <LoadingState />
  if (!restaurante) return null

  const valorCatalogo = items.reduce((sum, item) => sum + (Number(item.coste_estimado) || 0), 0)
  const conPrecio = items.filter(item => Number(item.coste_estimado) > 0).length
  const margenMedio = conPrecio
    ? Math.round(items.reduce((sum, item) => sum + (Number(item.margen) || 0), 0) / conPrecio)
    : 0

  function cambiarPagina(nextPage) {
    const safePage = Math.max(1, nextPage)
    setPage(safePage)
    cargarCatalogo({ restId: restaurante.id, accessToken: token, q: busqueda, proveedorFiltro: proveedor, pageNumber: safePage })
  }

  return (
    <FeatureGate restaurante={restaurante} feature="bodega" title="Catalogo no incluido">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Distribuidores"
        title="Catalogo de proveedores"
        subtitle={esPerfilBodega(restaurante)
          ? 'Busca en el catalogo comun de distribuidores de Carta Viva: coste, margen, anada, disponibilidad y datos que ya se usan para enriquecer catas.'
          : 'Catalogo privado de proveedores para preparar compras y altas de referencia.'}
        actions={<Link className={styles.secondary} href="/dashboard/vinos?new=1">Alta manual</Link>}
        help={{
          title: 'Uso para sumiller',
          intro: 'Es el mismo catalogo profesional que alimenta el trabajo interno de Carta Viva; aqui se abre como herramienta de compra para el sumiller.',
          items: [
            { title: 'Comparar', text: 'Coste, PVP recomendado, margen y disponibilidad en una misma vista.' },
            { title: 'Filtrar', text: 'Busca por zona, uva, bodega, proveedor o referencia interna.' },
            { title: 'Decidir', text: 'El siguiente paso es convertir una referencia interesante en ficha de bodega.' },
          ],
        }}
      >
        {error && <div className={styles.empty} style={{ minHeight: 70, marginBottom: 16, color: '#9b3535' }}>{error}</div>}

        <section className={styles.statsGrid}>
          <div className={styles.stat}><p className={styles.statValue}>{total}</p><p className={styles.statLabel}>Referencias encontradas</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{proveedores.length}</p><p className={styles.statLabel}>Distribuidores</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{margenMedio || '-' }%</p><p className={styles.statLabel}>Margen medio sugerido</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{eur(valorCatalogo)}</p><p className={styles.statLabel}>Coste de esta pagina</p></div>
        </section>

        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelBody}>
            <div className={styles.formGrid}>
              <div>
                <label className={styles.label}>Buscar</label>
                <input className={styles.input} value={busqueda} onChange={event => setBusqueda(event.target.value)} placeholder="Vino, bodega, region, uva o referencia" />
              </div>
              <div>
                <label className={styles.label}>Proveedor</label>
                <select className={styles.select} value={proveedor} onChange={event => setProveedor(event.target.value)}>
                  <option value="">Todos</option>
                  {proveedores.map(item => <option key={item.nombre} value={item.nombre}>{item.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Referencias de distribuidor</h2>
              <p className={styles.panelSub}>Catalogo real cargado en Carta Viva para decidir altas, sustituciones, compras y negociacion.</p>
            </div>
            <span className={styles.badge}>{loadingCatalogo ? 'Buscando...' : `${total} refs.`}</span>
          </div>
          <div className={styles.panelBody}>
            {items.length ? (
              <div className={styles.itemStack}>
                {items.map(item => (
                  <article key={item.id} className={styles.itemCard}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow}>{item.proveedor || 'Proveedor'}{item.referencia ? ` · ${item.referencia}` : ''}</p>
                        <h3 className={styles.sectionTitle}>{item.nombre}</h3>
                        <p className={styles.sectionText}>{[item.bodega, item.region, item.uva, item.anada].filter(Boolean).join(' · ')}</p>
                        <p className={styles.sectionText}>{item.disponibilidad || item.formato || 'Disponibilidad pendiente de confirmar'}</p>
                      </div>
                      <span className={styles.badge}>{item.margen != null ? `${item.margen}% margen` : 'Sin PVP'}</span>
                    </div>
                    <div className={styles.actionRow} style={{ marginTop: 12 }}>
                      <span className={styles.badge}>Coste {eur(item.coste_estimado)}</span>
                      <span className={styles.badge}>PVP {eur(item.pvp_recomendado)}</span>
                      <Link className={styles.secondary} href={llevarCartaHref(item)}>Llevar a carta</Link>
                      <Link className={styles.ghost} href={crearFichaHref(item)}>Crear ficha</Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : loadingCatalogo ? (
              <div className={styles.empty}>Buscando en el catalogo completo...</div>
            ) : (
              <div className={styles.empty}>No hay referencias de proveedor con estos filtros.</div>
            )}
            {(total > PAGE_SIZE || page > 1) && (
              <div className={styles.actionRow} style={{ marginTop: 16, justifyContent: 'space-between' }}>
                <button className={styles.secondary} type="button" onClick={() => cambiarPagina(page - 1)} disabled={page <= 1 || loadingCatalogo}>
                  Anterior
                </button>
                <span className={styles.badge}>Pagina {page} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
                <button className={styles.secondary} type="button" onClick={() => cambiarPagina(page + 1)} disabled={!hasMore || loadingCatalogo}>
                  Siguiente
                </button>
              </div>
            )}
          </div>
        </section>
      </ModuleShell>
    </FeatureGate>
  )
}
