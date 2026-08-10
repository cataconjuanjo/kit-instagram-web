import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = 'Kiosko Vinos <kiosko@cataconjuanjo.com>'

export async function GET(request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 })
  }
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: tiendas } = await supabaseAdmin
    .from('tiendas')
    .select('id, nombre, slug, logo_url, informe_email, color_acento, font_family')
    .not('informe_email', 'is', null)
    .neq('informe_email', '')
    .eq('activo', true)

  if (!tiendas?.length) return NextResponse.json({ ok: true, enviados: 0 })

  const resultados = []
  for (const tienda of tiendas) {
    try {
      const datos = await obtenerDatos(tienda.id)
      if (!datos.vacio) {
        const html = await enviarEmail(tienda, datos)
        await guardarInforme(tienda, datos, html)
      }
      resultados.push({ slug: tienda.slug, ok: true, vacio: datos.vacio })
    } catch (e) {
      resultados.push({ slug: tienda.slug, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, resultados })
}

async function obtenerDatos(tiendaId) {
  const desde7  = new Date(Date.now() -  7 * 86400000).toISOString()
  const desde14 = new Date(Date.now() - 14 * 86400000).toISOString()
  const desde30 = new Date(Date.now() - 30 * 86400000).toISOString()

  const { data: searches } = await supabaseAdmin
    .from('kiosko_searches')
    .select('consulta, mode, vinos_ids, vinos_nombres, created_at')
    .eq('tienda_id', tiendaId)
    .gte('created_at', desde30)
    .order('created_at', { ascending: false })

  if (!searches?.length) return { vacio: true }

  const semanaActual   = searches.filter(s => s.created_at >= desde7).length
  const semanaAnterior = searches.filter(s => s.created_at >= desde14 && s.created_at < desde7).length

  const consultaCount = {}
  searches.forEach(s => {
    const k = s.consulta.toLowerCase().trim()
    consultaCount[k] = (consultaCount[k] || 0) + 1
  })
  const topConsultas = Object.entries(consultaCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([consulta, veces]) => ({ consulta, veces }))

  const vinoCount = {}
  const vinoCount7 = {}
  searches.forEach(s => {
    const en7d = s.created_at >= desde7
    ;(s.vinos_ids || []).forEach((id, i) => {
      if (!vinoCount[id]) vinoCount[id] = { nombre: s.vinos_nombres?.[i] || id, veces: 0 }
      vinoCount[id].veces++
      if (en7d) vinoCount7[id] = (vinoCount7[id] || 0) + 1
    })
  })
  const topVinos = Object.entries(vinoCount)
    .sort((a, b) => b[1].veces - a[1].veces).slice(0, 3)
    .map(([id, { nombre, veces }]) => ({ id, nombre, veces }))

  const topVinoIds = new Set(topVinos.map(v => v.id))
  const { data: vinosStock } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, nombre, stock')
    .eq('tienda_id', tiendaId)
    .eq('activo', true)
    .lte('stock', 5)

  const alertas = (vinosStock || [])
    .filter(v => topVinoIds.has(String(v.id)))
    .map(v => ({ nombre: v.nombre, stock: Number(v.stock) }))

  // Sugerencia de reposición: vinos populares con stock < 2 semanas de runway
  const { data: todosVinos } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, nombre, bodega, stock, stock_minimo, precio_pvp, ubicacion_estanteria, destacado, foto_url')
    .eq('tienda_id', tiendaId)
    .eq('activo', true)

  const todosVinosMap = {}
  ;(todosVinos || []).forEach(v => { todosVinosMap[String(v.id)] = v })

  const reposicion = (todosVinos || [])
    .filter(v => Number(v.stock) > 0)
    .map(v => {
      const recom7d = vinoCount7[String(v.id)] || 0
      if (!recom7d) return null
      const diasRestantes = Math.round(Number(v.stock) / (recom7d / 7))
      if (diasRestantes > 14) return null
      const stockMin  = Math.max(Number(v.stock_minimo || 0), 6)
      const sugerido  = Math.max(0, stockMin - Number(v.stock))
      const pvp       = Number(v.precio_pvp || 0)
      return { id: String(v.id), nombre: v.nombre, bodega: v.bodega || null, stock: Number(v.stock), diasRestantes, stockMin, sugerido, pvp }
    })
    .filter(Boolean)
    .sort((a, b) => a.diasRestantes - b.diasRestantes)
    .slice(0, 5)

  // Categorización estrellas / joyas / caballos / revisar
  // Requiere mínimo 20 búsquedas en el mes para tener datos significativos
  let categorias = null
  if (searches.length >= 20) {
    const stockMap = {}
    ;(todosVinos || []).forEach(v => { stockMap[String(v.id)] = Number(v.stock) })

    const demandas = Object.values(vinoCount).map(v => v.veces).sort((a, b) => b - a)
    const mediana  = demandas[Math.floor(demandas.length / 2)] || 1

    const grupos = { estrella: [], joya: [], caballo: [], revisar: [] }
    Object.entries(vinoCount).forEach(([id, { nombre, veces }]) => {
      const stock      = stockMap[id] ?? null
      const altaDemanda = veces >= mediana
      const altoStock   = stock === null || stock > 3
      const cat = altaDemanda && altoStock  ? 'estrella'
                : altaDemanda && !altoStock ? 'caballo'
                : !altaDemanda && altoStock ? 'joya'
                : 'revisar'
      grupos[cat].push({ nombre, veces, stock })
    })

    Object.keys(grupos).forEach(cat => {
      grupos[cat] = grupos[cat].sort((a, b) => b.veces - a.veces).slice(0, 3)
    })
    categorias = grupos
  }

  // ── Acciones accionables (top 3 por impacto) ───────────────────────────────
  const acciones = []

  // 1. REPONER — vinos populares que se agotan pronto
  for (const r of reposicion.slice(0, 3)) {
    const impactoEur = r.sugerido > 0 && r.pvp > 0 ? Math.round(r.sugerido * r.pvp) : null
    acciones.push({
      tipo:        'reponer',
      emoji:       '📦',
      titulo:      `Repón "${r.nombre}"`,
      desc:        `Stock actual: ${r.stock} ud. — se agota en ~${r.diasRestantes} días al ritmo actual. Pedido sugerido: ${r.sugerido || '6+'} ud.`,
      impactoEur,
      impactoDesc: impactoEur ? `~${impactoEur} € en ventas potenciales` : null,
    })
    if (acciones.length >= 3) break
  }

  // 2. UBICAR — vinos populares sin ubicación en estantería
  if (acciones.length < 3) {
    const topIdsSet = new Set(topVinos.map(v => v.id))
    for (const id of [...topIdsSet]) {
      const vino = todosVinosMap[id]
      if (!vino || vino.ubicacion_estanteria) continue
      acciones.push({
        tipo:        'ubicar',
        emoji:       '📍',
        titulo:      `Añade la ubicación de "${vino.nombre}"`,
        desc:        'Es uno de los vinos más buscados pero no tiene estantería configurada. Los clientes no saben dónde encontrarlo.',
        impactoEur:  null,
        impactoDesc: 'Reducción de preguntas al dependiente',
      })
      if (acciones.length >= 3) break
    }
  }

  // 3. DESTACAR — vinos con alta demanda que no están en destacados
  if (acciones.length < 3) {
    const topIdsSet = new Set(topVinos.map(v => v.id))
    for (const id of [...topIdsSet]) {
      const vino = todosVinosMap[id]
      if (!vino || vino.destacado) continue
      acciones.push({
        tipo:        'destacar',
        emoji:       '⭐',
        titulo:      `Destaca "${vino.nombre}" en el kiosko`,
        desc:        'Es de los más recomendados esta semana pero no aparece en el carrusel de destacados. Ponlo en primera fila.',
        impactoEur:  null,
        impactoDesc: 'Mayor visibilidad = más conversiones',
      })
      if (acciones.length >= 3) break
    }
  }

  // ── Pedido de reposición por bodega ────────────────────────────────────────
  const pedidoMap = {}
  for (const r of reposicion) {
    const bodega = r.bodega || 'Sin bodega'
    if (!pedidoMap[bodega]) pedidoMap[bodega] = []
    pedidoMap[bodega].push(r)
  }
  const pedidoReposicion = Object.entries(pedidoMap).map(([bodega, lineas]) => ({ bodega, lineas }))

  return { vacio: false, semanaActual, semanaAnterior, topConsultas, topVinos, alertas, reposicion, categorias, acciones, pedidoReposicion, totalMes: searches.length }
}

function deltaTexto(actual, anterior) {
  if (!anterior) return ''
  const d = actual - anterior
  if (d > 0) return `↑ ${d} más que la semana pasada`
  if (d < 0) return `↓ ${Math.abs(d)} menos que la semana pasada`
  return 'igual que la semana pasada'
}

const FONT_MAP = {
  clasica:  { family: "'Playfair Display', Georgia, serif",   google: 'Playfair+Display:wght@700' },
  elegante: { family: "'Cormorant Garamond', Palatino, serif", google: 'Cormorant+Garamond:wght@600' },
  natural:  { family: "'Lato', Trebuchet MS, sans-serif",      google: 'Lato:wght@700' },
  moderna:  { family: null, google: null },
}

async function enviarEmail(tienda, datos) {
  const base      = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://cataconjuanjo.com')
  const adminUrl  = `${base}/kiosko-admin/${tienda.slug}`
  const semana    = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
  const color     = datos.semanaActual >= datos.semanaAnterior ? '#3a8a3a' : '#c44'
  const acento    = tienda.color_acento || '#c9a96e'
  const fontInfo  = FONT_MAP[tienda.font_family] || {}
  const fontFace  = fontInfo.family || 'system-ui,-apple-system,sans-serif'
  const googleLink = fontInfo.google
    ? `<link href="https://fonts.googleapis.com/css2?family=${fontInfo.google}&display=swap" rel="stylesheet">`
    : ''

  const filaLista = (items, campo) => items.map((it, i) => `
    <tr>
      <td style="width:20px;font-size:.72rem;font-weight:700;color:${acento};vertical-align:middle">${i + 1}</td>
      <td style="font-size:.85rem;padding:7px 0;border-bottom:1px solid #f0ede8;vertical-align:middle">${it[campo]}</td>
      <td style="white-space:nowrap;font-size:.73rem;color:#999;background:#f0ede8;border-radius:20px;padding:2px 8px;vertical-align:middle">${it.veces}×</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${googleLink}</head>
<body style="margin:0;padding:0;background:#f4f3f0;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#1a1a2e">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">

  <div style="background:#1a1a2e;border-radius:12px 12px 0 0;padding:18px 22px;display:flex;align-items:center;gap:12px">
    ${tienda.logo_url
      ? `<img src="${tienda.logo_url}" alt="${tienda.nombre}" style="height:40px;object-fit:contain;border-radius:4px">`
      : `<div style="width:40px;height:40px;border-radius:8px;background:${acento}22;display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:800;color:${acento};font-family:${fontFace}">${tienda.nombre[0]}</div>`}
    <div>
      <p style="margin:0;font-size:1rem;font-weight:800;color:${acento};font-family:${fontFace}">${tienda.nombre}</p>
      <p style="margin:2px 0 0;font-size:.72rem;color:rgba(240,237,232,.45)">Informe del kiosko · semana del ${semana}</p>
    </div>
  </div>

  <div style="background:#fff;padding:22px 24px">

    ${datos.acciones?.length ? `
    <p style="margin:0 0 10px;font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#aaa">Esta semana, haz esto</p>
    ${datos.acciones.map((a, i) => `
    <div style="display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:10px;background:#f9f8f6;margin-bottom:8px;border-left:3px solid ${a.tipo === 'reponer' ? '#f59e0b' : a.tipo === 'ubicar' ? '#3b82f6' : acento}">
      <span style="font-size:1.3rem;line-height:1;flex-shrink:0">${a.emoji}</span>
      <div style="flex:1;min-width:0">
        <p style="margin:0 0 2px;font-size:.87rem;font-weight:700;color:#1a1a2e">${i + 1}. ${a.titulo}</p>
        <p style="margin:0;font-size:.76rem;color:#666;line-height:1.4">${a.desc}</p>
        ${a.impactoDesc ? `<p style="margin:5px 0 0;font-size:.73rem;font-weight:700;color:${a.tipo === 'reponer' ? '#92400e' : '#2e6b47'};background:${a.tipo === 'reponer' ? '#fef3c7' : '#f0fdf4'};display:inline-block;padding:2px 8px;border-radius:20px">${a.impactoDesc}</p>` : ''}
      </div>
    </div>`).join('')}
    <div style="height:1px;background:#f0ede8;margin:18px 0"></div>` : ''}

    <table width="100%" cellpadding="0" cellspacing="12" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center;padding:14px 8px;border-right:1px solid #f0ede8">
          <p style="margin:0;font-size:2.2rem;font-weight:800;color:#1a1a2e">${datos.semanaActual}</p>
          <p style="margin:4px 0 0;font-size:.68rem;color:#999;text-transform:uppercase;letter-spacing:.06em">esta semana</p>
          ${datos.semanaAnterior > 0 ? `<p style="margin:4px 0 0;font-size:.7rem;color:${color}">${deltaTexto(datos.semanaActual, datos.semanaAnterior)}</p>` : ''}
        </td>
        <td style="text-align:center;padding:14px 8px">
          <p style="margin:0;font-size:2.2rem;font-weight:800;color:#1a1a2e">${datos.totalMes}</p>
          <p style="margin:4px 0 0;font-size:.68rem;color:#999;text-transform:uppercase;letter-spacing:.06em">últimos 30 días</p>
        </td>
      </tr>
    </table>

    ${datos.topConsultas.length ? `
    <p style="margin:0 0 6px;font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#aaa">Qué buscaron los clientes</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px">
      ${filaLista(datos.topConsultas, 'consulta')}
    </table>` : ''}

    ${datos.topVinos.length ? `
    <p style="margin:0 0 6px;font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#aaa">Vinos más recomendados</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px">
      ${filaLista(datos.topVinos, 'nombre')}
    </table>` : ''}

    ${datos.alertas.length ? `
    <div style="background:#fff8f0;border:1.5px solid #f5c06a;border-radius:8px;padding:12px 14px;margin-bottom:18px">
      <p style="margin:0 0 6px;font-size:.82rem;font-weight:700;color:#92400e">⚠️ Stock bajo en vinos recomendados</p>
      ${datos.alertas.map(a => `<p style="margin:3px 0;font-size:.82rem">${a.stock === 0 ? '🔴' : '🟡'} ${a.nombre} — ${a.stock === 0 ? 'Sin stock' : `${a.stock} ud.`}</p>`).join('')}
    </div>` : `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 14px;margin-bottom:18px">
      <p style="margin:0;font-size:.82rem;color:#166534">✅ Stock OK en todos los vinos recomendados</p>
    </div>`}

    ${datos.reposicion?.length ? `
    <div style="background:#fefce8;border:1.5px solid #fde047;border-radius:8px;padding:12px 14px;margin-bottom:18px">
      <p style="margin:0 0 8px;font-size:.82rem;font-weight:700;color:#713f12">📦 Sugerencia de reposición</p>
      <p style="margin:0 0 8px;font-size:.75rem;color:#92400e">Vinos con alta demanda que se agotarán pronto al ritmo actual:</p>
      ${datos.reposicion.map(r => `<p style="margin:4px 0;font-size:.82rem">⏱️ <strong>${r.nombre}</strong> — ${r.stock} ud. · se agota en ~${r.diasRestantes} días</p>`).join('')}
    </div>` : ''}

    ${datos.categorias ? `
    <div style="border-top:1px solid #f0ede8;margin:4px 0 18px"></div>
    <p style="margin:0 0 10px;font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#aaa">Clasificación de tu carta</p>
    <table width="100%" cellpadding="0" cellspacing="8">
      <tr>
        ${[
          { key: 'estrella', icon: '⭐', label: 'Estrellas',          desc: 'Muy pedidos y bien surtidos' },
          { key: 'caballo',  icon: '🐴', label: 'Caballos de batalla', desc: 'Muy pedidos, stock bajo' },
        ].map(({ key, icon, label, desc }) => `
        <td width="50%" style="vertical-align:top;background:#f9f8f6;border-radius:8px;padding:10px 12px">
          <p style="margin:0 0 4px;font-size:.78rem;font-weight:700;color:#1a1a2e">${icon} ${label}</p>
          <p style="margin:0 0 8px;font-size:.68rem;color:#999">${desc}</p>
          ${datos.categorias[key].length
            ? datos.categorias[key].map(v => `<p style="margin:3px 0;font-size:.78rem;color:#333">${v.nombre}</p>`).join('')
            : `<p style="margin:0;font-size:.75rem;color:#bbb;font-style:italic">Sin datos aún</p>`}
        </td>`).join('')}
      </tr>
      <tr>
        ${[
          { key: 'joya',    icon: '💎', label: 'Joyas ocultas', desc: 'Poco pedidos, pero bien surtidos' },
          { key: 'revisar', icon: '🔍', label: 'A revisar',     desc: 'Poca demanda y poco stock' },
        ].map(({ key, icon, label, desc }) => `
        <td width="50%" style="vertical-align:top;background:#f9f8f6;border-radius:8px;padding:10px 12px">
          <p style="margin:0 0 4px;font-size:.78rem;font-weight:700;color:#1a1a2e">${icon} ${label}</p>
          <p style="margin:0 0 8px;font-size:.68rem;color:#999">${desc}</p>
          ${datos.categorias[key].length
            ? datos.categorias[key].map(v => `<p style="margin:3px 0;font-size:.78rem;color:#333">${v.nombre}</p>`).join('')
            : `<p style="margin:0;font-size:.75rem;color:#bbb;font-style:italic">Sin datos aún</p>`}
        </td>`).join('')}
      </tr>
    </table>` : `
    <div style="background:#f9f8f6;border-radius:8px;padding:14px 16px;margin-bottom:4px;text-align:center">
      <p style="margin:0 0 4px;font-size:.82rem;font-weight:700;color:#1a1a2e">⭐ Clasificación de carta — próximamente</p>
      <p style="margin:0;font-size:.75rem;color:#999">Con más semanas de datos podrás ver qué vinos son estrellas, joyas ocultas, caballos de batalla o candidatos a revisar.</p>
    </div>`}

    ${datos.pedidoReposicion?.length ? `
    <div style="border-top:1px solid #f0ede8;margin:4px 0 18px"></div>
    <p style="margin:0 0 10px;font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#aaa">Pedido de reposición</p>
    ${datos.pedidoReposicion.map(({ bodega, lineas }) => `
    <div style="margin-bottom:12px">
      <p style="margin:0 0 6px;font-size:.8rem;font-weight:700;color:#1a1a2e">${bodega}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <thead>
          <tr style="background:#f9f8f6">
            <th style="text-align:left;font-size:.68rem;color:#aaa;font-weight:600;padding:5px 8px;border-bottom:1px solid #f0ede8">Vino</th>
            <th style="text-align:right;font-size:.68rem;color:#aaa;font-weight:600;padding:5px 8px;border-bottom:1px solid #f0ede8">Stock</th>
            <th style="text-align:right;font-size:.68rem;color:#aaa;font-weight:600;padding:5px 8px;border-bottom:1px solid #f0ede8">Pedir</th>
          </tr>
        </thead>
        <tbody>
          ${lineas.map(r => `
          <tr>
            <td style="font-size:.8rem;padding:6px 8px;border-bottom:1px solid #f7f4f0;color:#333">${r.nombre}</td>
            <td style="font-size:.8rem;padding:6px 8px;border-bottom:1px solid #f7f4f0;text-align:right;color:#999">${r.stock} ud.</td>
            <td style="font-size:.82rem;padding:6px 8px;border-bottom:1px solid #f7f4f0;text-align:right;font-weight:700;color:#92400e">${r.sugerido > 0 ? `${r.sugerido} ud.` : '6+ ud.'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('')}` : ''}

    <div style="text-align:center;margin-top:18px">
      <a href="${adminUrl}" style="display:inline-block;background:${acento};color:#1a1a2e;font-weight:700;font-size:.88rem;padding:11px 28px;border-radius:9px;text-decoration:none">Ver analítica completa →</a>
    </div>
  </div>

  <div style="background:#1a1a2e;border-radius:0 0 12px 12px;padding:12px 22px;text-align:center">
    <p style="margin:0;font-size:.68rem;color:rgba(240,237,232,.3)">Para dejar de recibir este informe ve a Ajustes en tu panel de admin del kiosko</p>
  </div>

</div>
</body></html>`

  await resend.emails.send({
    from: FROM,
    to: tienda.informe_email,
    subject: `Kiosko ${tienda.nombre} — informe semana ${semana}`,
    html,
  })

  return html
}

async function guardarInforme(tienda, datos, html) {
  const ahora = new Date()
  const lunes = new Date(ahora)
  lunes.setDate(ahora.getDate() - ((ahora.getDay() + 6) % 7))
  const semanaInicio = lunes.toISOString().slice(0, 10)
  const semanaLabel  = ahora.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })

  await supabaseAdmin.from('kiosko_informes').insert({
    tienda_id:    tienda.id,
    slug:         tienda.slug,
    semana_label: semanaLabel,
    semana_inicio: semanaInicio,
    datos:        datos,
    html:         html,
    email_destino: tienda.informe_email,
    enviado_ok:   true,
  })
}
