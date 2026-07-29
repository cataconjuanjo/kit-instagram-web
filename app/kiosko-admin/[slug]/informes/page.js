'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../supabase'
import styles from './informes.module.css'

export default function InformesPage() {
  const { slug } = useParams()
  const router   = useRouter()

  const [informes, setInformes]   = useState(null)
  const [selected, setSelected]   = useState(null)
  const [html, setHtml]           = useState(null)
  const [loadingHtml, setLoadingHtml] = useState(false)
  const [error, setError]         = useState(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace(`/kiosko-admin/${slug}`); return }

      const res = await fetch(`/api/kiosko/${slug}/admin/informes`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) { setError('Sin acceso'); return }
      const json = await res.json()
      setInformes(json.informes || [])
      if (json.informes?.length) seleccionar(json.informes[0], session.access_token)
    }
    init()
  }, [slug])

  async function seleccionar(informe, token) {
    setSelected(informe)
    setHtml(null)
    setLoadingHtml(true)
    const { data: { session } } = await supabase.auth.getSession()
    const t = token || session?.access_token
    const res = await fetch(`/api/kiosko/${slug}/admin/informes?id=${informe.id}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
    const json = await res.json()
    setHtml(json.informe?.html || null)
    setLoadingHtml(false)
  }

  if (error) return <div className={styles.empty}>{error}</div>
  if (!informes) return <div className={styles.loading}>Cargando…</div>

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <button className={styles.backBtn} onClick={() => router.push(`/kiosko-admin/${slug}`)}>← Admin</button>
          <h1 className={styles.title}>Informes semanales</h1>
          <p className={styles.sub}>{slug}</p>
        </div>

        {informes.length === 0 ? (
          <p className={styles.empty}>Aún no hay informes generados.</p>
        ) : (
          <ul className={styles.list}>
            {informes.map(inf => (
              <li
                key={inf.id}
                className={`${styles.item} ${selected?.id === inf.id ? styles.itemActive : ''}`}
                onClick={() => seleccionar(inf)}
              >
                <span className={styles.itemSemana}>{inf.semana_label}</span>
                <span className={styles.itemFecha}>{new Date(inf.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <div className={styles.itemStats}>
                  <span>{inf.datos?.semanaActual ?? '—'} búsquedas</span>
                  {inf.datos?.alertas?.length > 0 && <span className={styles.alertBadge}>⚠️ {inf.datos.alertas.length}</span>}
                  {inf.datos?.categorias && <span className={styles.catBadge}>⭐ {inf.datos.categorias.estrella?.length || 0}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.viewer}>
        {loadingHtml && <div className={styles.viewerLoading}>Cargando informe…</div>}
        {!loadingHtml && html && (
          <iframe
            srcDoc={html}
            className={styles.iframe}
            title={`Informe ${selected?.semana_label}`}
            sandbox="allow-same-origin"
          />
        )}
        {!loadingHtml && !html && selected && (
          <div className={styles.viewerEmpty}>No hay HTML guardado para este informe.</div>
        )}
        {!selected && informes.length === 0 && (
          <div className={styles.viewerEmpty}>
            <p>Los informes se generan automáticamente cada lunes a las 8:00.</p>
            <p>Aparecerán aquí en cuanto se envíe el primero.</p>
          </div>
        )}
      </div>
    </div>
  )
}
