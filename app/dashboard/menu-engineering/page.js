'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { actividadRealDesdeISO } from '../../lib/actividadReal'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

function decimal(val) { return parseFloat(val) || 0 }

const CATEGORIAS = [
  {
    id: 'estrella',
    emoji: '⭐',
    label: 'Estrella',
    desc: 'Alta popularidad · Alto margen',
    acciones: [
      'Dale la mejor posición en carta.',
      'Entrena a sala para que sigan vendiéndolo.',
      'No toques el precio — está funcionando.',
    ],
    color: '#7a5a1a',
    borde: '#d4a636',
    fondo: '#fdf8ee',
  },
  {
    id: 'joya',
    emoji: '💎',
    label: 'Joya oculta',
    desc: 'Baja popularidad · Alto margen',
    acciones: [
      'Dale más visibilidad en carta.',
      'Pide a sala que lo recomiende activamente.',
      'Considera bajar ligeramente el precio para activar la salida.',
    ],
    color: '#2e6b47',
    borde: '#4a9c69',
    fondo: '#eef7f2',
  },
  {
    id: 'caballo',
    emoji: '🔄',
    label: 'Caballo de batalla',
    desc: 'Alta popularidad · Bajo margen',
    acciones: [
      'Renegocia el precio de compra con el proveedor.',
      'Ajusta el PVP si el mercado lo aguanta.',
      'Valora sustituirlo por una referencia más rentable.',
    ],
    color: '#1a4f7a',
    borde: '#2e7ab8',
    fondo: '#eef4fb',
  },
  {
    id: 'revisar',
    emoji: '⚠️',
    label: 'Revisar',
    desc: 'Baja popularidad · Bajo margen',
    acciones: [
      'Candidato a salir de la carta.',
      'Negocia el precio de compra o busca otro proveedor.',
      'Si quieres conservarlo, estimula su venta en sala.',
    ],
    color: '#7a2020',
    borde: '#c03030',
    fondo: '#fdf0f0',
  },
]

const ANALISIS_DEMO = {
  estado: 'demo',
  totalVentas: 42,
  barreraRentabilidad: 12.4,
  barreraPopularidad: 17.5,
  vinosSinCoste: 0,
  vinos: [
    { id: 'demo-estrella', nombre: 'Ejemplo: Rioja crianza', bodega: 'Bodega de muestra', margen: 15.8, ventas: 14, pctVentas: 33.3, categoria: 'estrella' },
    { id: 'demo-joya', nombre: 'Ejemplo: Godello sobre lías', bodega: 'Bodega de muestra', margen: 14.2, ventas: 4, pctVentas: 9.5, categoria: 'joya' },
    { id: 'demo-caballo', nombre: 'Ejemplo: Verdejo por copa', bodega: 'Bodega de muestra', margen: 8.6, ventas: 16, pctVentas: 38.1, categoria: 'caballo' },
    { id: 'demo-revisar', nombre: 'Ejemplo: Reserva clásico', bodega: 'Bodega de muestra', margen: 7.9, ventas: 3, pctVentas: 7.1, categoria: 'revisar' },
  ],
}

export default function MenuEngineering() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase
        .from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const desdeActividad = actividadRealDesdeISO(rest)
        let ventasQuery = Promise.resolve({ data: [] })
        if (desdeActividad) {
          ventasQuery = supabase
            .from('estadisticas')
            .select('detalle')
            .eq('restaurante_id', rest.id)
            .eq('tipo', 'venta')
            .gte('created_at', desdeActividad)
        }
        const [{ data: vinosData }, { data: statsData }] = await Promise.all([
          supabase
            .from('vinos')
            .select('id, nombre, bodega, precio_botella, coste_compra')
            .eq('restaurante_id', rest.id)
            .eq('activo', true),
          ventasQuery,
        ])
        setVinos(vinosData || [])
        setVentas(statsData || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const analisis = useMemo(() => {
    if (!vinos.length) return null

    // Contar botellas vendidas por vino_id
    const ventasPorId = {}
    for (const stat of ventas) {
      try {
        const d = JSON.parse(stat.detalle || '{}')
        if (d.resultado === 'vendida' && d.vino_id) {
          ventasPorId[d.vino_id] = (ventasPorId[d.vino_id] || 0) + (d.cantidad || 1)
        }
      } catch { /* ignorar registros corruptos */ }
    }

    // Solo vinos con coste y precio informados
    const vinosConCoste = vinos.filter(
      v => decimal(v.coste_compra) > 0 && decimal(v.precio_botella) > 0
    )
    if (vinosConCoste.length < 3) return { estado: 'sin_coste', vinosConCoste }

    const totalVentas = Object.values(ventasPorId).reduce((s, n) => s + n, 0)
    if (totalVentas < 5) return { estado: 'sin_ventas', vinosConCoste, totalVentas }

    const vinosCalculados = vinosConCoste.map(v => ({
      ...v,
      margen: decimal(v.precio_botella) - decimal(v.coste_compra),
      ventas: ventasPorId[v.id] || 0,
      pctVentas: ((ventasPorId[v.id] || 0) / totalVentas) * 100,
    }))

    // Barreras según metodología Álex Pardo GCA
    const barreraRentabilidad =
      vinosCalculados.reduce((s, v) => s + v.margen, 0) / vinosCalculados.length

    const vinosConVentas = vinosCalculados.filter(v => v.ventas > 0).length
    const barreraPopularidad = vinosConVentas > 0
      ? (100 / vinosConVentas) * 0.7
      : 0

    const clasificados = vinosCalculados.map(v => {
      const rentable = v.margen >= barreraRentabilidad
      const popular = v.pctVentas >= barreraPopularidad
      return {
        ...v,
        categoria: rentable && popular ? 'estrella'
          : !rentable && popular ? 'caballo'
          : rentable && !popular ? 'joya'
          : 'revisar',
      }
    })

    return {
      estado: 'ok',
      vinos: clasificados,
      totalVentas,
      barreraRentabilidad,
      barreraPopularidad,
      vinosSinCoste: vinos.length - vinosConCoste.length,
    }
  }, [vinos, ventas])

  if (loading) return <LoadingState />
  if (!restaurante) return null

  const esDemo = analisis?.estado !== 'ok'
  const analisisVisible = esDemo ? ANALISIS_DEMO : analisis

  return (
    <FeatureGate restaurante={restaurante} feature="estadisticas" title="Análisis no incluido">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Análisis"
        title="Rentabilidad de carta"
        subtitle="Cada vino clasificado por popularidad real y margen. Toma decisiones de precio, posición y sustitución con datos."
        help={{
          title: 'Cómo funciona',
          intro: 'Necesita dos datos por vino: precio de coste (en Bodega) y ventas registradas en Sala. Cuantas más ventas acumuladas, más preciso el análisis.',
          items: [
            { title: '⭐ Estrella', text: 'Se vende bien y deja buen margen. Cuídalo y dale visibilidad.' },
            { title: '💎 Joya oculta', text: 'Rentable pero poco pedido. Entrenar sala o darle mejor posición en carta.' },
            { title: '🔄 Caballo de batalla', text: 'Se vende mucho pero con poco margen. Renegociar coste o ajustar PVP.' },
            { title: '⚠️ Revisar', text: 'Poco vendido y poco rentable. Candidato a salir de carta.' },
          ],
        }}
      >

        {/* Avisos de datos insuficientes */}
        {analisis?.estado === 'sin_coste' && (
          <div className={styles.panel} style={{ borderLeft: '3px solid #d4a636', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#7a5a20' }}>
              <strong>Faltan precios de coste.</strong>{' '}
              Introduce el coste de compra en al menos 3 vinos desde{' '}
              <a href="/dashboard/bodega" style={{ color: '#7a5a20' }}>Bodega → Inventario</a>{' '}
              para activar el análisis.{' '}
              {analisis.vinosConCoste.length > 0 && `Ahora solo hay ${analisis.vinosConCoste.length}.`}
            </p>
          </div>
        )}

        {analisis?.estado === 'sin_ventas' && (
          <div className={styles.panel} style={{ borderLeft: '3px solid #d4a636', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#7a5a20' }}>
              <strong>Pocas ventas registradas.</strong>{' '}
              Hay {analisis.totalVentas} de 5 ventas mínimas marcadas desde Sala. Cuantas más semanas de datos, más fiable el resultado.
            </p>
          </div>
        )}

        {esDemo && (
          <div className={styles.panel} style={{ borderLeft: '3px solid #531827', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#531827' }}>
              <strong>Vista previa con datos de ejemplo.</strong>{' '}
              Así se organizará tu carta cuando haya suficiente actividad real. Ninguna cifra ni referencia de esta muestra pertenece a tu restaurante.
            </p>
          </div>
        )}

        {/* Análisis completo o vista previa */}
        {analisisVisible && (
          <>
            {/* Métricas clave */}
            <section className={styles.panel} style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div>
                  <p style={{ margin: '0 0 3px', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ventas analizadas</p>
                  <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#171416' }}>{analisisVisible.totalVentas}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 3px', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Margen medio</p>
                  <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#171416' }}>{analisisVisible.barreraRentabilidad.toFixed(2)}€</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 3px', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Barrera popularidad</p>
                  <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#171416' }}>{analisisVisible.barreraPopularidad.toFixed(1)}%</p>
                </div>
              </div>
              {analisisVisible.vinosSinCoste > 0 && (
                <p style={{ margin: '12px 0 0', fontSize: 12, color: '#999' }}>
                  {analisisVisible.vinosSinCoste} {analisisVisible.vinosSinCoste === 1 ? 'vino' : 'vinos'} sin coste de compra no {analisisVisible.vinosSinCoste === 1 ? 'aparece' : 'aparecen'} en el análisis.{' '}
                  <a href="/dashboard/bodega" style={{ color: '#766e64' }}>Completar en Bodega →</a>
                </p>
              )}
            </section>

            {/* Cuadrantes */}
            <div style={{ display: 'grid', gap: 10 }}>
              {CATEGORIAS.map(cat => {
                const vinosCat = analisisVisible.vinos
                  .filter(v => v.categoria === cat.id)
                  .sort((a, b) => b.ventas - a.ventas || b.margen - a.margen)
                return (
                  <section
                    key={cat.id}
                    className={styles.panel}
                    style={{ borderLeft: `3px solid ${cat.borde}`, background: cat.fondo, padding: '14px 16px' }}
                  >
                    <div style={{ marginBottom: 10 }}>
                      <h2 className={styles.panelTitle} style={{ color: cat.color, marginBottom: 2 }}>
                        {cat.emoji} {cat.label}
                        <span style={{ fontWeight: 400, fontSize: 13, color: '#888', marginLeft: 8 }}>
                          — {cat.desc}
                        </span>
                      </h2>
                    </div>

                    {vinosCat.length === 0 ? (
                      <p style={{ margin: '0 0 10px', fontSize: 13, color: '#aaa' }}>Ningún vino en esta categoría.</p>
                    ) : (
                      <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                        {vinosCat.map(v => (
                          <div
                            key={v.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr auto',
                              gap: 10,
                              alignItems: 'center',
                              background: 'rgba(255,255,255,0.75)',
                              border: `1px solid ${cat.borde}33`,
                              borderRadius: 7,
                              padding: '9px 12px',
                            }}
                          >
                            <div>
                              <p style={{ margin: 0, fontSize: 14, fontWeight: 650, color: '#171416' }}>{v.nombre}</p>
                              {v.bodega && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#766e64' }}>{v.bodega}</p>}
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: cat.color }}>
                                +{v.margen.toFixed(2)}€
                              </p>
                              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888' }}>
                                {v.ventas} {v.ventas === 1 ? 'venta' : 'ventas'} · {v.pctVentas.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div>
                      <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 700, color: cat.color, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                        Acciones
                      </p>
                      <ul style={{ margin: 0, paddingLeft: 15 }}>
                        {cat.acciones.map((a, i) => (
                          <li key={i} style={{ fontSize: 12, color: '#555', lineHeight: 1.5, marginBottom: 2 }}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  </section>
                )
              })}
            </div>
          </>
        )}

      </ModuleShell>
    </FeatureGate>
  )
}
