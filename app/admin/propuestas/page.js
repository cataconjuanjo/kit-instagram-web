'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isAdminEmail } from '../../demo'
import {
  SELECT_CLIENT_PLATO_ADMIN,
  SELECT_CLIENT_RESTAURANTE_ADMIN,
  SELECT_CLIENT_VINO_ADMIN,
} from '../../lib/clientSupabaseSelects'
import AdminOverlay from '../components/AdminOverlay'

const inicial = {
  restaurante_id: '',
  titulo: '',
  vino: '',
  tipo: '',
  zona: '',
  proveedor_sugerido: '',
  coste_estimado: '',
  precio_recomendado: '',
  margen_objetivo: '',
  plato_objetivo: '',
  motivo: '',
  prioridad: 'media',
  estado: 'propuesta'
}

function calcularMargen(coste, precio) {
  const costeNum = Number(coste) || 0
  const precioNum = Number(precio) || 0
  if (!costeNum || !precioNum || precioNum <= costeNum) return ''
  return String(Math.round(((precioNum - costeNum) / costeNum) * 100))
}

function calcularPrecioDesdeMargen(coste, margen) {
  const costeNum = Number(coste) || 0
  const margenNum = Number(margen) || 0
  if (!costeNum || margenNum <= 0) return ''
  const precio = costeNum * (1 + margenNum / 100)
  return precio.toFixed(2)
}

function normalizarCatalogo(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export default function PropuestasConsultor() {
  const [user, setUser] = useState(null)
  const [restaurantes, setRestaurantes] = useState([])
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [proveedoresCatalogo, setProveedoresCatalogo] = useState([])
  const [vinosCatalogo, setVinosCatalogo] = useState([])
  const [propuestas, setPropuestas] = useState([])
  const [form, setForm] = useState(inicial)
  const [modoPropuesta, setModoPropuesta] = useState('alta')
  const [vinoExistenteId, setVinoExistenteId] = useState('')
  const [proveedorCatalogoId, setProveedorCatalogoId] = useState('')
  const [vinoCatalogoId, setVinoCatalogoId] = useState('')
  const [busquedaVinoCatalogo, setBusquedaVinoCatalogo] = useState('')
  const [editando, setEditando] = useState(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ultimoCampoEconomico, setUltimoCampoEconomico] = useState('precio')
  const [formAbierto, setFormAbierto] = useState(false)
  const [borrarPendiente, setBorrarPendiente] = useState(null)

  const tokenAdmin = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    return sessionData?.session?.access_token
  }, [])

  const cargarPropuestas = useCallback(async () => {
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/propuestas', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    setPropuestas(res.ok ? data.propuestas || [] : [])
  }, [tokenAdmin])

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) {
        window.location.href = '/login'
        return
      }
      setUser(user)
      const token = await tokenAdmin()
      const [{ data: rests }, { data: vinosData }, { data: platosData }, catalogoRes] = await Promise.all([
        supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_ADMIN).order('nombre'),
        supabase.from('vinos').select(SELECT_CLIENT_VINO_ADMIN).order('nombre'),
        supabase.from('platos').select(SELECT_CLIENT_PLATO_ADMIN).order('nombre'),
        fetch('/api/admin/proveedores', { headers: { Authorization: `Bearer ${token}` } })
      ])
      const catalogoData = await catalogoRes.json().catch(() => ({}))
      setRestaurantes(rests || [])
      setVinos(vinosData || [])
      setPlatos(platosData || [])
      setProveedoresCatalogo(catalogoRes.ok ? catalogoData.proveedores || [] : [])
      setVinosCatalogo(catalogoRes.ok ? catalogoData.vinos || [] : [])
      await cargarPropuestas()
      setLoading(false)
    }
    cargar()
  }, [cargarPropuestas, tokenAdmin])

  useEffect(() => {
    if (!restaurantes.length) return
    const params = new URLSearchParams(window.location.search)
    const restauranteId = params.get('restaurante')
    if (!restauranteId) return
    window.requestAnimationFrame(() => {
      setFormAbierto(true)
      setForm(prev => ({
        ...prev,
        restaurante_id: restauranteId,
        titulo: params.get('titulo') || prev.titulo,
        motivo: params.get('motivo') || prev.motivo,
        prioridad: params.get('prioridad') || prev.prioridad
      }))
    })
  }, [restaurantes])

  const vinosRestaurante = vinos.filter(vino => String(vino.restaurante_id) === String(form.restaurante_id))
  const platosRestaurante = platos.filter(plato => String(plato.restaurante_id) === String(form.restaurante_id))
  const vinosCatalogoFiltrados = useMemo(() => {
    const terminos = normalizarCatalogo(busquedaVinoCatalogo).split(' ').filter(Boolean)
    const base = proveedorCatalogoId
      ? vinosCatalogo.filter(vino => String(vino.proveedor_id) === String(proveedorCatalogoId))
      : vinosCatalogo
    return base
      .filter(vino => {
        if (!terminos.length) return true
        const proveedor = proveedoresCatalogo.find(item => String(item.id) === String(vino.proveedor_id))
        const texto = normalizarCatalogo([
          vino.nombre,
          vino.bodega,
          vino.region,
          vino.tipo,
          vino.uva,
          vino.referencia,
          vino.formato,
          proveedor?.nombre,
        ].filter(Boolean).join(' '))
        return terminos.every(termino => texto.includes(termino))
      })
      .slice(0, 40)
  }, [vinosCatalogo, proveedoresCatalogo, proveedorCatalogoId, busquedaVinoCatalogo])

  function actualizar(campo, valor) {
    setError('')
    if (campo === 'precio_recomendado') setUltimoCampoEconomico('precio')
    if (campo === 'margen_objetivo') setUltimoCampoEconomico('margen')
    setForm(prev => {
      const next = { ...prev, [campo]: valor }
      if (campo === 'margen_objetivo') {
        const precio = calcularPrecioDesdeMargen(next.coste_estimado, next.margen_objetivo)
        if (precio) next.precio_recomendado = precio
      } else if (campo === 'coste_estimado' && ultimoCampoEconomico === 'margen') {
        const precio = calcularPrecioDesdeMargen(next.coste_estimado, next.margen_objetivo)
        if (precio) next.precio_recomendado = precio
      } else if (campo === 'coste_estimado' || campo === 'precio_recomendado') {
        next.margen_objetivo = calcularMargen(next.coste_estimado, next.precio_recomendado)
      }
      return next
    })
  }

  function empezarEditar(propuesta) {
    setFormAbierto(true)
    setEditando(propuesta.id)
    setUltimoCampoEconomico('precio')
    setModoPropuesta(propuesta.tipo === 'Retirar referencia' ? 'retirada' : 'alta')
    setVinoExistenteId('')
    setProveedorCatalogoId('')
    setVinoCatalogoId('')
    setBusquedaVinoCatalogo('')
    setForm({
      restaurante_id: propuesta.restaurante_id || '',
      titulo: propuesta.titulo || '',
      vino: propuesta.vino || '',
      tipo: propuesta.tipo || '',
      zona: propuesta.zona || '',
      proveedor_sugerido: propuesta.proveedor_sugerido || '',
      coste_estimado: propuesta.coste_estimado || '',
      precio_recomendado: propuesta.precio_recomendado || '',
      margen_objetivo: propuesta.margen_objetivo || '',
      plato_objetivo: propuesta.plato_objetivo || '',
      motivo: propuesta.motivo || '',
      prioridad: propuesta.prioridad || 'media',
      estado: propuesta.estado || 'propuesta'
    })
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    const token = await tokenAdmin()
    const margenCalculado = calcularMargen(form.coste_estimado, form.precio_recomendado)
    const payload = {
      ...form,
      tipo: modoPropuesta === 'retirada' ? 'Retirar referencia' : form.tipo,
      margen_objetivo: margenCalculado || form.margen_objetivo || ''
    }
    const res = await fetch('/api/admin/propuestas', {
      method: editando ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(editando ? { ...payload, id: editando } : payload)
    })
    const data = await res.json()
    if (res.ok) {
      if (editando) setPropuestas(propuestas.map(item => item.id === data.propuesta.id ? data.propuesta : item))
      else setPropuestas([data.propuesta, ...propuestas])
      setForm(inicial)
      setModoPropuesta('alta')
      setVinoExistenteId('')
      setProveedorCatalogoId('')
      setVinoCatalogoId('')
      setBusquedaVinoCatalogo('')
      setEditando(null)
      setFormAbierto(false)
    } else {
      setError(data.error || 'No se pudo guardar la propuesta.')
    }
    setGuardando(false)
  }

  function cerrarFormulario() {
    if (guardando) return
    setFormAbierto(false)
    setEditando(null)
    setForm(inicial)
    setModoPropuesta('alta')
    setVinoExistenteId('')
    setProveedorCatalogoId('')
    setVinoCatalogoId('')
    setBusquedaVinoCatalogo('')
    setError('')
  }

  function abrirNueva() {
    cerrarFormulario()
    setFormAbierto(true)
  }

  async function borrar(id) {
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/propuestas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id })
    })
    if (res.ok) {
      setPropuestas(propuestas.filter(item => item.id !== id))
      setBorrarPendiente(null)
    }
  }

  function seleccionarVinoExistente(id) {
    setVinoExistenteId(id)
    const vino = vinos.find(item => String(item.id) === String(id))
    if (!vino) return
    setForm(prev => ({
      ...prev,
      titulo: prev.titulo || `Retirar ${vino.nombre} de la carta`,
      vino: vino.nombre || '',
      tipo: 'Retirar referencia',
      zona: vino.region || '',
      proveedor_sugerido: vino.proveedor || '',
      coste_estimado: vino.coste_compra || '',
      precio_recomendado: vino.precio_botella || ''
    }))
  }

  function seleccionarProveedorCatalogo(proveedorId) {
    setProveedorCatalogoId(proveedorId)
    setVinoCatalogoId('')
    setBusquedaVinoCatalogo('')
  }

  function seleccionarVinoCatalogo(id) {
    setVinoCatalogoId(id)
    const vino = vinosCatalogo.find(item => String(item.id) === String(id))
    if (!vino) return
    const proveedor = proveedoresCatalogo.find(item => String(item.id) === String(vino.proveedor_id))
    const pvp = Number(vino.pvp_recomendado) > 0 ? vino.pvp_recomendado : ''
    setProveedorCatalogoId(vino.proveedor_id || '')
    setBusquedaVinoCatalogo(vino.nombre || '')
    setUltimoCampoEconomico(pvp ? 'precio' : 'margen')
    setForm(prev => ({
      ...prev,
      titulo: prev.titulo || `Añadir ${vino.nombre} a la carta`,
      vino: vino.nombre || '',
      tipo: vino.tipo || '',
      zona: vino.region || '',
      proveedor_sugerido: proveedor?.nombre || vino.proveedores_vino?.nombre || '',
      coste_estimado: Number(vino.coste_estimado) > 0 ? vino.coste_estimado : '',
      precio_recomendado: pvp,
      margen_objetivo: pvp ? calcularMargen(vino.coste_estimado, pvp) : prev.margen_objetivo,
    }))
  }

  if (loading) {
    return (
      <main className="admin-page">
        <p className="admin-loading">Cargando propuestas</p>
      </main>
    )
  }

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <div>
          <p className="admin-kicker">Superadmin</p>
          <h1>Propuestas del consultor</h1>
          <p>{user?.email}</p>
        </div>
      </header>

      <section className="admin-shell">
        <aside className="admin-sidebar">
          <p className="admin-kicker">Consultor</p>
          <Link href="/admin/consultoria">Radar</Link>
          <Link className="active" href="/admin/propuestas">Propuestas</Link>
          <Link href="/admin/proveedores">Proveedores</Link>
          <Link href="/sommelier">Selección Juanjo</Link>
          <Link href="/admin">Restaurantes</Link>
        </aside>

        <div className="admin-main">
        <div className="admin-overlay-launch">
          <button type="button" onClick={abrirNueva}>Nueva propuesta</button>
        </div>
        <AdminOverlay
          open={formAbierto}
          onClose={cerrarFormulario}
          eyebrow={editando ? 'Editar propuesta' : 'Nueva propuesta'}
          title="Recomendación accionable"
          description="Crea una propuesta para el restaurante sin perder el listado ni el contexto de consultoría."
          footer={
            <>
              <button type="button" onClick={cerrarFormulario} disabled={guardando}>Cancelar</button>
              <button type="submit" form="consultant-proposal-form" className="is-primary" disabled={guardando}>
                {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear propuesta'}
              </button>
            </>
          }
        >
        <section className="admin-create">
          <div>
            <p className="eyebrow">{editando ? 'Editar propuesta' : 'Nueva propuesta'}</p>
            <h2>Recomendación accionable para un restaurante</h2>
            <p>Esto aparecerá en el Control de Bodega del restaurante como propuesta de @cataconjuanjo.</p>
          </div>
          <form id="consultant-proposal-form" onSubmit={guardar} className="admin-create-form">
            <label>
              Restaurante
              <select value={form.restaurante_id} onChange={e => actualizar('restaurante_id', e.target.value)} required>
                <option value="">Selecciona...</option>
                {restaurantes.map(rest => <option key={rest.id} value={rest.id}>{rest.nombre}</option>)}
              </select>
            </label>
            <label>
              Tipo de propuesta
              <select
                value={modoPropuesta}
                onChange={e => {
                  const modo = e.target.value
                  setModoPropuesta(modo)
                  setVinoExistenteId('')
                  setProveedorCatalogoId('')
                  setVinoCatalogoId('')
                  if (modo === 'retirada') actualizar('tipo', 'Retirar referencia')
                  else actualizar('tipo', '')
                }}
              >
                <option value="alta">Añadir o recomendar vino</option>
                <option value="retirada">Retirar vino existente</option>
              </select>
            </label>
            <label>
              Titulo
              <input value={form.titulo} onChange={e => actualizar('titulo', e.target.value)} placeholder="Falta un vino dulce para postres" required />
            </label>
            {modoPropuesta === 'retirada' ? (
              <label>
                Vino de su carta
                <select value={vinoExistenteId || (form.vino ? 'actual' : '')} onChange={e => e.target.value !== 'actual' && seleccionarVinoExistente(e.target.value)} required>
                  <option value="">Selecciona una referencia...</option>
                  {form.vino && <option value="actual">{form.vino}</option>}
                  {vinosRestaurante.map(vino => (
                    <option key={vino.id} value={vino.id}>
                      {[vino.nombre, vino.bodega, vino.region].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label>
                  Proveedor del catálogo
                  <select value={proveedorCatalogoId} onChange={e => seleccionarProveedorCatalogo(e.target.value)}>
                    <option value="">Todos los proveedores...</option>
                    {proveedoresCatalogo.map(proveedor => (
                      <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Buscar vino del catálogo común
                  <input value={busquedaVinoCatalogo} onChange={e => setBusquedaVinoCatalogo(e.target.value)} placeholder="Nombre, bodega, zona, uva o referencia..." />
                </label>
                <div className="admin-create-wide catalog-picker">
                  {vinosCatalogoFiltrados.length === 0 && <p>No hay vinos con ese filtro.</p>}
                  {vinosCatalogoFiltrados.map(vino => {
                    const proveedor = proveedoresCatalogo.find(item => String(item.id) === String(vino.proveedor_id))
                    return (
                      <button
                        type="button"
                        key={vino.id}
                        className={String(vinoCatalogoId) === String(vino.id) ? 'active' : ''}
                        onClick={() => seleccionarVinoCatalogo(vino.id)}
                      >
                        <strong>{vino.nombre}</strong>
                        <span>{[proveedor?.nombre, vino.bodega, vino.region, vino.formato, vino.coste_estimado ? `${vino.coste_estimado} EUR` : ''].filter(Boolean).join(' · ')}</span>
                      </button>
                    )
                  })}
                </div>
                <label>
                  Vino sugerido
                  <input value={form.vino} onChange={e => actualizar('vino', e.target.value)} placeholder="Moscatel naturalmente dulce..." />
                </label>
                <label>
                  Tipo / estilo
                  <input value={form.tipo} onChange={e => actualizar('tipo', e.target.value)} placeholder="Dulce, generoso, blanco salino..." />
                </label>
              </>
            )}
            <label>
              Zona / D.O.
              <input value={form.zona} onChange={e => actualizar('zona', e.target.value)} placeholder="Málaga, Jerez, Rías Baixas..." />
            </label>
            <label>
              Proveedor sugerido
              <input value={form.proveedor_sugerido} onChange={e => actualizar('proveedor_sugerido', e.target.value)} placeholder="Distribuidor o bodega" />
            </label>
            <label>
              Coste estimado
              <input type="number" step="0.01" value={form.coste_estimado} onChange={e => actualizar('coste_estimado', e.target.value)} />
            </label>
            <label>
              Precio recomendado
              <input type="number" step="0.01" value={form.precio_recomendado} onChange={e => actualizar('precio_recomendado', e.target.value)} />
            </label>
            <label>
              Margen sobre coste %
              <input
                type="number"
                min="1"
                max="900"
                value={form.margen_objetivo}
                onChange={e => actualizar('margen_objetivo', e.target.value)}
                placeholder="Ej. 200"
                title="Si editas este margen, la app calcula el precio recomendado."
              />
            </label>
            <label>
              Plato objetivo
              <select value={form.plato_objetivo} onChange={e => actualizar('plato_objetivo', e.target.value)} disabled={!form.restaurante_id}>
                <option value="">{form.restaurante_id ? 'Sin plato concreto...' : 'Elige restaurante primero...'}</option>
                {form.plato_objetivo && !platosRestaurante.some(plato => plato.nombre === form.plato_objetivo) && (
                  <option value={form.plato_objetivo}>{form.plato_objetivo}</option>
                )}
                {platosRestaurante.map(plato => (
                  <option key={plato.id} value={plato.nombre}>
                    {[plato.nombre, plato.categoria].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Prioridad
              <select value={form.prioridad} onChange={e => actualizar('prioridad', e.target.value)}>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </label>
            <label>
              Estado
              <select value={form.estado} onChange={e => actualizar('estado', e.target.value)}>
                <option value="propuesta">Propuesta</option>
                <option value="interesa">Interesa</option>
                <option value="descartada">Descartada</option>
                <option value="incorporada">Incorporada</option>
              </select>
            </label>
            <label className="admin-create-wide">
              Motivo
              <textarea
                value={form.motivo}
                onChange={e => actualizar('motivo', e.target.value)}
                placeholder={modoPropuesta === 'retirada'
                  ? 'Por qué conviene retirarlo: solapa perfil, baja rotación, margen débil, no encaja con cocina...'
                  : 'Por qué conviene, qué hueco cubre, cómo lo vendería sala...'}
              />
            </label>
            <button disabled={guardando}>{guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear propuesta'}</button>
            {editando && <button type="button" className="admin-plain-button" onClick={cerrarFormulario}>Cancelar</button>}
          </form>
          {error && <p className="admin-alert admin-alert-error">{error}</p>}
        </section>
        </AdminOverlay>

        <div className="admin-grid">
          {propuestas.map(propuesta => (
            <article className="admin-card" key={propuesta.id}>
              <div>
                <span className="admin-slug">{propuesta.restaurantes?.nombre || 'Restaurante'}</span>
                <h3>{propuesta.titulo}</h3>
                <p>{[propuesta.vino, propuesta.tipo, propuesta.zona].filter(Boolean).join(' · ') || 'Propuesta de consultoría'}</p>
                <span>{propuesta.motivo || 'Sin motivo detallado'}</span>
                <small className="admin-slug">{propuesta.prioridad} · {propuesta.estado}</small>
              </div>
              <div className="admin-card-actions">
                <button onClick={() => empezarEditar(propuesta)}>Editar</button>
                <button className="admin-plain-button" onClick={() => setBorrarPendiente(propuesta)}>Borrar</button>
              </div>
            </article>
          ))}
        </div>
        <AdminOverlay
          open={Boolean(borrarPendiente)}
          onClose={() => setBorrarPendiente(null)}
          size="modal"
          eyebrow="Confirmación"
          title="Borrar propuesta"
          description="Esta acción elimina la propuesta del panel del consultor y del restaurante."
          footer={
            <>
              <button type="button" onClick={() => setBorrarPendiente(null)}>Cancelar</button>
              <button type="button" className="is-danger" onClick={() => borrar(borrarPendiente.id)}>Borrar definitivamente</button>
            </>
          }
        >
          {borrarPendiente && (
            <div className="admin-detail-box">
              <h3>{borrarPendiente.titulo}</h3>
              <p>{borrarPendiente.restaurantes?.nombre || 'Restaurante'}</p>
            </div>
          )}
        </AdminOverlay>
        </div>
      </section>
    </main>
  )
}
