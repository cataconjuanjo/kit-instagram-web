'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import styles from './admin.module.css'
import { supabase } from '../../supabase'
import { isAdminEmail } from '../../demo'

const TIPOS = ['tinto','blanco','rosado','espumoso','generoso','dulce','naranja','sin_alcohol']

const VINO_VACIO = {
  nombre:'', bodega:'', tipo:'', uva:'', anada:'', region:'', pais:'España',
  precio_pvp:'', precio_coste:'', stock:'', ubicacion_estanteria:'',
  foto_url:'', notas_cata:'', descripcion:'', puntuacion:'', destacado:false, activo:true,
}

export default function AdminKioskoPage() {
  const { slug } = useParams()

  const [tienda, setTienda]         = useState(null)
  const [vinos, setVinos]           = useState([])
  const [cargando, setCargando]     = useState(true)
  const [error, setError]           = useState('')
  const [accesoDenegado, setAccesoDenegado] = useState(false)

  const [modal, setModal]         = useState(null)  // null | 'nuevo' | vino
  const [form, setForm]           = useState(VINO_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg]             = useState('')
  const [fotoFileModal, setFotoFileModal] = useState(null)
  const [draggingFoto, setDraggingFoto]   = useState(false)
  const fotoInputModalRef = useRef(null)

  const [inlineEdit, setInlineEdit] = useState(null)  // { id, campo, valor }

  const [subiendoFoto, setSubiendoFoto] = useState(null)  // vinoId
  const fotoInputFilaRef  = useRef(null)
  const fotoVinoTargetRef = useRef(null)

  const [busqueda, setBusqueda]         = useState('')
  const [filtroTipo, setFiltroTipo]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')

  const [modalImport, setModalImport]     = useState(false)
  const [archivoImport, setArchivoImport] = useState(null)
  const [modoImport, setModoImport]       = useState('añadir')
  const [importando, setImportando]       = useState(false)
  const [resultImport, setResultImport]   = useState(null)
  const [draggingImport, setDraggingImport] = useState(false)

  useEffect(() => { if (slug) cargar() }, [slug])

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
      setTienda(meta.tienda)
      setVinos(dv.vinos || [])
    } catch (e) { setError(e.message) }
    finally     { setCargando(false)  }
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

    const numericos  = ['precio_pvp', 'precio_coste', 'stock', 'puntuacion']
    const valorFinal = numericos.includes(campo)
      ? (valor !== '' && valor !== null ? Number(valor) : (campo === 'stock' ? 0 : null))
      : (String(valor).trim() || null)

    const res = await fetch(`/api/kiosko/${slug}/admin/vinos/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valorFinal }),
    })
    if (res.ok) {
      setVinos(prev => prev.map(v => v.id === id ? { ...v, [campo]: valorFinal } : v))
    }
  }

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
  const vinosFiltrados = vinos.filter(v => {
    if (filtroTipo && v.tipo !== filtroTipo) return false
    if (filtroEstado === 'activo'   && !v.activo)  return false
    if (filtroEstado === 'inactivo' &&  v.activo)  return false
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return [v.nombre, v.bodega, v.tipo, v.uva, v.region].filter(Boolean).join(' ').toLowerCase().includes(q)
  })

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

  return (
    <div className={styles.admin}>
      {/* Inputs ocultos */}
      <input
        ref={fotoInputFilaRef} type="file" accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }} onChange={onFileFotoFila}
      />

      {/* Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.titulo}>Admin Kiosko</h1>
          {tienda && <p className={styles.subtitulo}>{tienda.nombre} · {tienda.ciudad}</p>}
        </div>
        <div className={styles.headerActions}>
          <a href={`/kiosko/${slug}`} target="_blank" rel="noreferrer" className={styles.btnSecundario}>
            Ver kiosko →
          </a>
          <button onClick={exportarCSV} type="button" className={styles.btnSecundario}>
            Exportar CSV
          </button>
          <button onClick={() => { setModalImport(true); setResultImport(null) }} type="button" className={styles.btnSecundario}>
            Importar catálogo
          </button>
          <button onClick={abrirNuevo} type="button" className={styles.btnPrimario}>
            + Añadir vino
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <input
          className={styles.busqueda}
          type="search"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, bodega, tipo…"
        />
        <select className={styles.filtroSelect} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace('_',' ')}</option>
          ))}
        </select>
        <select className={styles.filtroSelect} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
        </select>
        <span className={styles.total}>{vinosFiltrados.length} / {vinos.length} vinos</span>
      </div>

      {/* Tabla */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thFoto}>Foto</th>
              <th>Nombre</th>
              <th>Bodega</th>
              <th>Tipo</th>
              <th>Añada</th>
              <th>PVP €</th>
              <th>Stock</th>
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

                {/* Stock inline */}
                <td
                  className={`${styles.tdEditable} ${v.stock === 0 ? styles.stockCero : ''}`}
                  onClick={e => startInline(v.id, 'stock', v.stock, e)}
                >
                  {inlineEdit?.id === v.id && inlineEdit.campo === 'stock' ? (
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
                <td colSpan={11} className={styles.empty}>
                  No hay vinos{busqueda ? ' con esa búsqueda' : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
