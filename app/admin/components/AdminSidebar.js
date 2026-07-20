'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../../supabase'
import BrandLogo from '../../components/BrandLogo'

export default function AdminSidebar() {
  const [restaurantes, setRestaurantes] = useState([])
  const pathname = usePathname()

  useEffect(() => {
    supabase.from('restaurantes').select('id, nombre, ciudad').order('nombre')
      .then(({ data }) => setRestaurantes(data || []))
  }, [])

  const matchRest = pathname.match(/\/admin\/restaurante\/([^/]+)/)
  const currentId = matchRest?.[1]

  const enProveedores = pathname === '/admin/proveedores'
  const enSommelier = pathname === '/sommelier'

  return (
    <aside className="admin-sidebar admin-sidebar-ng">
      <div className="asng-brand">
        <BrandLogo variant="horizontalDark" />
        <span>Panel consultor</span>
      </div>

      <nav className="asng-tools">
        <Link href="/admin/proveedores" className={enProveedores ? 'active' : ''}>Proveedores</Link>
        <Link href="/sommelier" className={enSommelier ? 'active' : ''}>Selección Juanjo</Link>
      </nav>

      <div className="asng-divider" />

      <div className="asng-restaurants">
        <p className="asng-label">Restaurantes</p>
        {restaurantes.map(r => (
          <Link
            key={r.id}
            href={`/admin/restaurante/${r.id}`}
            className={`asng-rest-link ${currentId === String(r.id) ? 'active' : ''}`}
          >
            <span className="asng-rest-name">{r.nombre}</span>
            {r.ciudad && <span className="asng-rest-city">{r.ciudad}</span>}
          </Link>
        ))}
        {restaurantes.length === 0 && (
          <span className="asng-empty">Sin restaurantes</span>
        )}
      </div>

      <div className="asng-divider" />

      <nav className="asng-footer">
        <Link href="/admin/consultoria" className={pathname === '/admin/consultoria' ? 'active' : ''}>Radar global</Link>
        <Link href="/admin">Gestionar</Link>
      </nav>
    </aside>
  )
}
