'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isAdminEmail } from '../../demo'
import AdminSidebar from '../components/AdminSidebar'

const proveedorInicial = {
  nombre: '',
  contacto: '',
  email: '',
  telefono: '',
  zona: '',
  notas: '',
  visible_restaurantes: false
}

const vinoInicial = {
  proveedor_id: '',
  nombre: '',
  bodega: '',
  tipo: '',
  region: '',
  uva: '',
  anada: '',
  referencia: '',
  formato: '',
  coste_estimado: '',
  pvp_recomendado: '',
  disponibilidad: '',
  notas: '',
  activo: true
}

function dinero(valor) {
  const numero = Number(valor) || 0
  return numero ? `${numero.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR` : ''
}

async function tokenAdmin() {
  const { data: sessionData } = await supabase.auth.getSession()
  return sessionData?.session?.access_token
}

export default function ProveedoresPage() {
  const [user, setUser] = useState(null)
  const [proveedores, setProveedores] = useState([])
  const [vinos, setVinos] = useState([])
  const [proveedorForm, setProveedorForm] = useState(proveedorInicial)
  const [vinoForm, setVinoForm] = useState(vinoInicial)
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState('')
  const [editandoProveedor, setEditandoProveedor] = useState(null)
  const [editandoVino, setEditandoVino] = useState(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cargarCatalogo = useCallback(async () => {
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/proveedores', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudieron cargar proveedores.')
    setProveedores(data.proveedores || [])
    setVinos(data.vinos || [])

    const primerProveedor = data.proveedores?.[0]?.id || ''
    setProveedorSeleccionado(actual => actual || primerProveedor)
    setVinoForm(actual => ({
      ...actual,
      proveedor_id: actual.proveedor_id || primerProveedor
    }))
  }, [])

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) {
        window.location.href = '/login'
        return
      }

      setUser(user)
      try {
        await cargarCatalogo()
      } catch (error) {
        setError(error.message)
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [cargarCatalogo])

  const vinosFiltrados = useMemo(() => {
    if (!proveedorSeleccionado) return vinos
    return vinos.filter(vino => String(vino.proveedor_id) === String(proveedorSeleccionado))
  }, [vinos, proveedorSeleccionado])

  const proveedorPorId = useMemo(
    () => Object.fromEntries(proveedores.map(proveedor => [proveedor.id, proveedor])),
    [proveedores]
  )

  function cambiarProveedor(campo, valor) {
    setError('')
    setProveedorForm(prev => ({ ...prev, [campo]: valor }))
  }

  function cambiarVino(campo, valor) {
    setError('')
    setVinoForm(prev => ({ ...prev, [campo]: valor }))
  }

  function editarProveedor(proveedor) {
    setEditandoProveedor(proveedor.id)
    setProveedorForm({
      nombre: proveedor.nombre || '',
      contacto: proveedor.contacto || '',
      email: proveedor.email || '',
      telefono: proveedor.telefono || '',
      zona: proveedor.zona || '',
      notas: proveedor.notas || '',
      visible_restaurantes: Boolean(proveedor.visible_restaurantes)
    })
  }

  function editarVino(vino) {
    setEditandoVino(vino.id)
    setVinoForm({
      proveedor_id: vino.proveedor_id || proveedorSeleccionado || '',
      nombre: vino.nombre || '',
      bodega: vino.bodega || '',
      tipo: vino.tipo || '',
      region: vino.region || '',
      uva: vino.uva || '',
      anada: vino.anada || '',
      referencia: vino.referencia || '',
      formato: vino.formato || '',
      coste_estimado: vino.coste_estimado || '',
      pvp_recomendado: vino.pvp_recomendado || '',
      disponibilidad: vino.disponibilidad || '',
      notas: vino.notas || '',
      activo: vino.activo !== false
    })
  }

  async function guardarProveedor(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const token = await tokenAdmin()
      const res = await fetch('/api/admin/proveedores', {
        method: editandoProveedor ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind: 'proveedor',
          id: editandoProveedor,
          ...proveedorForm
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el proveedor.')
      await cargarCatalogo()
      setProveedorForm(proveedorInicial)
      setEditandoProveedor(null)
      if (data.proveedor?.id) setProveedorSeleccionado(data.proveedor.id)
    } catch (error) {
      setError(error.message)
    } finally {
      setGuardando(false)
    }
  }

  async function guardarVino(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const token = await tokenAdmin()
      const res = await fetch('/api/admin/proveedores', {
        method: editandoVino ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind: 'vino',
          id: editandoVino,
          ...vinoForm
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el vino.')
      await cargarCatalogo()
      setVinoForm({ ...vinoInicial, proveedor_id: vinoForm.proveedor_id })
      setEditandoVino(null)
      if (data.vino?.proveedor_id) setProveedorSeleccionado(data.vino.proveedor_id)
    } catch (error) {
      setError(error.message)
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(id, kind) {
    const mensaje = kind === 'vino'
      ? '¿Borrar este vino del catálogo privado?'
      : '¿Borrar este proveedor y su catálogo privado?'
    if (!confirm(mensaje)) return

    setError('')
    try {
      const token = await tokenAdmin()
      const res = await fetch('/api/admin/proveedores', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, kind })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo borrar.')
      if (kind === 'vino') setVinos(actual => actual.filter(vino => vino.id !== id))
      else {
        setProveedores(actual => actual.filter(proveedor => proveedor.id !== id))
        setVinos(actual => actual.filter(vino => vino.proveedor_id !== id))
        if (proveedorSeleccionado === id) setProveedorSeleccionado('')
      }
    } catch (error) {
      setError(error.message)
    }
  }

  if (loading) {
    return (
      <main className="admin-page">
        <p className="admin-loading">Cargando proveedores</p>
      </main>
    )
  }

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <div>
          <p className="admin-kicker">Superadmin</p>
          <h1>Proveedores y catálogos</h1>
          <p>{user?.email}</p>
        </div>
      </header>

      <section className="admin-shell">
        <AdminSidebar />

        <div className="admin-main">
          <div className="consult-hero">
            <div>
              <p className="eyebrow">Base privada de compra</p>
              <h2>Catálogo de distribuidores para preparar propuestas sin exponer precios.</h2>
              <p>Guarda contactos, zonas, referencias, coste estimado, PVP recomendado y disponibilidad. Por defecto queda fuera de la vista del restaurante.</p>
            </div>
            <div className="consult-summary">
              <strong>{proveedores.length}</strong><span>proveedores</span>
              <strong>{vinos.length}</strong><span>referencias</span>
            </div>
          </div>

          {error && <p className="admin-alert admin-alert-error">{error}</p>}

          <section className="admin-create supplier-panel">
            <div>
              <p className="eyebrow">{editandoProveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</p>
              <h2>Ficha privada del distribuidor</h2>
              <p>Úsala como agenda comercial y fuente de compra. El check de visibilidad queda preparado, pero no publica nada por sí solo.</p>
            </div>
            <form onSubmit={guardarProveedor} className="admin-create-form">
              <label>Nombre<input value={proveedorForm.nombre} onChange={e => cambiarProveedor('nombre', e.target.value)} placeholder="Distribuidor, bodega o importador" required /></label>
              <label>Zona<input value={proveedorForm.zona} onChange={e => cambiarProveedor('zona', e.target.value)} placeholder="Málaga, Andalucía, nacional..." /></label>
              <label>Contacto<input value={proveedorForm.contacto} onChange={e => cambiarProveedor('contacto', e.target.value)} placeholder="Persona de contacto" /></label>
              <label>Email<input type="email" value={proveedorForm.email} onChange={e => cambiarProveedor('email', e.target.value)} placeholder="comercial@proveedor.com" /></label>
              <label>Teléfono<input value={proveedorForm.telefono} onChange={e => cambiarProveedor('telefono', e.target.value)} placeholder="+34..." /></label>
              <label className="admin-hub-switch">
                <input type="checkbox" checked={proveedorForm.visible_restaurantes} onChange={e => cambiarProveedor('visible_restaurantes', e.target.checked)} />
                Preparado para mostrar a restaurantes
              </label>
              <label className="admin-create-wide">Notas<textarea value={proveedorForm.notas} onChange={e => cambiarProveedor('notas', e.target.value)} placeholder="Condiciones, zonas fuertes, mínimos, tipo de catálogo, relación comercial..." /></label>
              <button disabled={guardando}>{guardando ? 'Guardando...' : editandoProveedor ? 'Guardar proveedor' : 'Crear proveedor'}</button>
              {editandoProveedor && <button type="button" className="admin-plain-button" onClick={() => { setEditandoProveedor(null); setProveedorForm(proveedorInicial) }}>Cancelar edición</button>}
            </form>
          </section>

          <section className="admin-create supplier-panel">
            <div>
              <p className="eyebrow">{editandoVino ? 'Editar referencia' : 'Nueva referencia'}</p>
              <h2>Vino de catálogo</h2>
              <p>Aquí sí conviene guardar uva o blend, coste y PVP sugerido: luego podrás convertirlo en propuesta para un restaurante.</p>
            </div>
            <form onSubmit={guardarVino} className="admin-create-form">
              <label>
                Proveedor
                <select value={vinoForm.proveedor_id} onChange={e => cambiarVino('proveedor_id', e.target.value)} required>
                  <option value="">Selecciona...</option>
                  {proveedores.map(proveedor => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
                </select>
              </label>
              <label>Vino<input value={vinoForm.nombre} onChange={e => cambiarVino('nombre', e.target.value)} placeholder="Nombre comercial" required /></label>
              <label>Bodega<input value={vinoForm.bodega} onChange={e => cambiarVino('bodega', e.target.value)} placeholder="Bodega" /></label>
              <label>Tipo<input value={vinoForm.tipo} onChange={e => cambiarVino('tipo', e.target.value)} placeholder="Tinto, blanco, generoso..." /></label>
              <label>Zona / D.O.<input value={vinoForm.region} onChange={e => cambiarVino('region', e.target.value)} placeholder="Rioja, Jerez, Málaga..." /></label>
              <label>Uva / blend<input value={vinoForm.uva} onChange={e => cambiarVino('uva', e.target.value)} placeholder="Tempranillo, Palomino, Garnacha..." /></label>
              <label>Añada<input value={vinoForm.anada} onChange={e => cambiarVino('anada', e.target.value)} placeholder="2022, saca 2024..." /></label>
              <label>Referencia<input value={vinoForm.referencia} onChange={e => cambiarVino('referencia', e.target.value)} placeholder="Código proveedor" /></label>
              <label>Formato<input value={vinoForm.formato} onChange={e => cambiarVino('formato', e.target.value)} placeholder="Botella 75 cl, caja 6..." /></label>
              <label>Coste estimado<input type="number" step="0.01" value={vinoForm.coste_estimado} onChange={e => cambiarVino('coste_estimado', e.target.value)} /></label>
              <label>PVP recomendado<input type="number" step="0.01" value={vinoForm.pvp_recomendado} onChange={e => cambiarVino('pvp_recomendado', e.target.value)} /></label>
              <label>Disponibilidad<input value={vinoForm.disponibilidad} onChange={e => cambiarVino('disponibilidad', e.target.value)} placeholder="Disponible, cupo, preguntar..." /></label>
              <label className="admin-hub-switch">
                <input type="checkbox" checked={vinoForm.activo} onChange={e => cambiarVino('activo', e.target.checked)} />
                Referencia activa
              </label>
              <label className="admin-create-wide">Notas<textarea value={vinoForm.notas} onChange={e => cambiarVino('notas', e.target.value)} placeholder="Por qué interesa, estilo, restaurantes donde encaja, margen, maridajes..." /></label>
              <button disabled={guardando || proveedores.length === 0}>{guardando ? 'Guardando...' : editandoVino ? 'Guardar referencia' : 'Añadir al catálogo'}</button>
              {editandoVino && <button type="button" className="admin-plain-button" onClick={() => { setEditandoVino(null); setVinoForm({ ...vinoInicial, proveedor_id: proveedorSeleccionado }) }}>Cancelar edición</button>}
            </form>
          </section>

          <div className="consult-filterbar">
            <button className={!proveedorSeleccionado ? 'active' : ''} onClick={() => setProveedorSeleccionado('')}>Todos</button>
            {proveedores.map(proveedor => (
              <button key={proveedor.id} className={proveedorSeleccionado === proveedor.id ? 'active' : ''} onClick={() => setProveedorSeleccionado(proveedor.id)}>
                {proveedor.nombre}
              </button>
            ))}
          </div>

          <div className="supplier-layout">
            <section className="supplier-list">
              <h2>Proveedores</h2>
              {proveedores.length === 0 && <p className="consult-empty">Aún no hay proveedores privados.</p>}
              {proveedores.map(proveedor => (
                <article className="admin-card supplier-card" key={proveedor.id}>
                  <div>
                    <span className="admin-slug">{proveedor.visible_restaurantes ? 'Preparado para mostrar' : 'Privado'}</span>
                    <h3>{proveedor.nombre}</h3>
                    <p>{[proveedor.zona, proveedor.contacto].filter(Boolean).join(' · ') || 'Sin zona/contacto'}</p>
                    <span>{[proveedor.email, proveedor.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</span>
                    {proveedor.notas && <small className="admin-slug">{proveedor.notas}</small>}
                  </div>
                  <div className="admin-card-actions">
                    <button onClick={() => editarProveedor(proveedor)}>Editar</button>
                    <button className="admin-plain-button" onClick={() => borrar(proveedor.id, 'proveedor')}>Borrar</button>
                  </div>
                </article>
              ))}
            </section>

            <section className="supplier-list">
              <h2>Referencias de catálogo</h2>
              {vinosFiltrados.length === 0 && <p className="consult-empty">No hay vinos para este filtro.</p>}
              {vinosFiltrados.map(vino => (
                <article className="admin-card supplier-card" key={vino.id}>
                  <div>
                    <span className="admin-slug">{proveedorPorId[vino.proveedor_id]?.nombre || vino.proveedores_vino?.nombre || 'Proveedor'}</span>
                    <h3>{vino.nombre}</h3>
                    <p>{[vino.bodega, vino.uva, vino.region, vino.anada].filter(Boolean).join(' · ') || 'Sin datos de estilo'}</p>
                    <span>{[dinero(vino.coste_estimado), dinero(vino.pvp_recomendado), vino.disponibilidad].filter(Boolean).join(' · ') || 'Sin precios guardados'}</span>
                    {vino.notas && <small className="admin-slug">{vino.notas}</small>}
                  </div>
                  <div className="admin-card-actions">
                    <button onClick={() => editarVino(vino)}>Editar</button>
                    <button className="admin-plain-button" onClick={() => borrar(vino.id, 'vino')}>Borrar</button>
                  </div>
                </article>
              ))}
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}
