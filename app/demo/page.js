'use client'

import Link from 'next/link'
import { setDemoEmail } from '../demo'

export default function DemoLoDeCarmen() {
  if (process.env.NEXT_PUBLIC_SHOW_DEMO !== 'true') {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#111', color: '#fff', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <p style={{ color: '#777', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 11 }}>Demo no disponible</p>
          <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 300 }}>Acceso privado</h1>
          <p style={{ color: '#aaa', lineHeight: 1.6 }}>Esta demo solo se activa para presentaciones internas.</p>
          <Link href="/" style={{ color: '#fff' }}>Volver a Cata con Juanjo</Link>
        </div>
      </main>
    )
  }

  function abrirDashboard() {
    setDemoEmail('lodecarmen@cartavinos.com')
    window.location.href = '/dashboard'
  }

  return (
    <main style={{ minHeight: '100vh', background: '#111', color: '#fff', fontFamily: 'system-ui, sans-serif', padding: '40px 24px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <p style={{ fontSize: 11, color: '#777', letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 12px' }}>Demo preparada</p>
        <h1 style={{ fontSize: 42, fontWeight: 300, fontFamily: 'Georgia, serif', margin: '0 0 12px' }}>Lo de Carmen</h1>
        <p style={{ fontSize: 16, color: '#aaa', lineHeight: 1.7, maxWidth: 560, margin: '0 0 36px' }}>
          Recorrido corto para enseñar carta digital, modo camarero y recomendaciones accionables sobre platos reales.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 36 }}>
          <Link href="/demo/sumiller" style={{ textDecoration: 'none' }}>
            <DemoCard titulo="Demo sumiller" desc="Bodega profesional con stock, compras, margen e inventario." destacado />
          </Link>
          <Link href="/demo/taberna-del-puerto" style={{ textDecoration: 'none' }}>
            <DemoCard titulo="La Taberna del Puerto" desc="Muestra comercial con cliente, camarero y gerente." />
          </Link>
          <Link href="/carta/carmen" style={{ textDecoration: 'none' }}>
            <DemoCard titulo="Carta pública" desc="Vista cliente con platos, vinos y guía de maridaje." />
          </Link>
          <Link href="/camarero/carmen?demo=1" style={{ textDecoration: 'none' }}>
            <DemoCard titulo="Modo camarero" desc="Entra sin PIN y abre una ficha de venta." />
          </Link>
          <button onClick={abrirDashboard} style={{ textAlign: 'left', border: '1px solid #333', background: '#1a1a1a', color: '#fff', padding: 20, borderRadius: 12, cursor: 'pointer' }}>
            <p style={{ fontSize: 15, color: '#fff', margin: '0 0 8px', fontWeight: 500 }}>Dashboard</p>
            <p style={{ fontSize: 13, color: '#777', margin: 0, lineHeight: 1.55 }}>Objetivos y mejoras de carta.</p>
          </button>
        </div>

        <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, padding: 24 }}>
          <p style={{ fontSize: 10, color: '#777', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 16px' }}>Guion para grabar</p>
          {[
            'Abrir Modo camarero.',
            'Mostrar que aparece un plato real: Codillo al Pedro Ximénez.',
            'Leer la ficha: cerdo meloso, grasa, cocción lenta y reducción dulce.',
            'Mostrar qué buscar y qué evitar.',
            'Enseñar las tres opciones de vino de la carta.',
            'Pulsar Otras opciones compatibles para ver rotación.',
            'Cambiar objetivo a Rotar stock y repetir.',
          ].map((paso, idx) => (
            <div key={paso} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: idx < 6 ? '1px solid #252525' : 'none' }}>
              <span style={{ color: '#555', fontSize: 13, width: 20 }}>{idx + 1}</span>
              <p style={{ margin: 0, color: '#bbb', fontSize: 14, lineHeight: 1.5 }}>{paso}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

function DemoCard({ titulo, desc, destacado = false }) {
  return (
    <div style={{ border: destacado ? '1px solid #fff' : '1px solid #333', background: destacado ? '#fff' : '#1a1a1a', color: destacado ? '#111' : '#fff', padding: 20, borderRadius: 12, minHeight: 118, boxSizing: 'border-box' }}>
      <p style={{ fontSize: 15, margin: '0 0 8px', fontWeight: 500 }}>{titulo}</p>
      <p style={{ fontSize: 13, color: destacado ? '#555' : '#777', margin: 0, lineHeight: 1.55 }}>{desc}</p>
    </div>
  )
}
