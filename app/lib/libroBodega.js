/**
 * libroBodega.js — Funciones puras para el Libro Mensual de Bodega por Vino (F2).
 * Sin dependencias externas, testeables en Node.
 */

export function r2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

// ── Indexadores ──────────────────────────────────────────────────────────────

// movimientos_stock → { [mes]: { [vino_id]: { entradas_u, ventas_bot_u, ventas_copa_u, otras_u, ajustes_u } } }
export function indexarMovimientos(movs) {
  const idx = {}
  for (const m of movs) {
    const mes = (m.fecha_movimiento || '').slice(0, 7)
    if (!mes) continue
    if (!idx[mes]) idx[mes] = {}
    if (!idx[mes][m.vino_id]) idx[mes][m.vino_id] = { entradas_u: 0, ventas_bot_u: 0, ventas_copa_u: 0, otras_u: 0, ajustes_u: 0 }
    const e = idx[mes][m.vino_id]
    const cant = Number(m.cantidad) || 0
    switch (m.tipo) {
      case 'compra':
      case 'entrada':
        e.entradas_u += Math.abs(cant); break
      case 'venta_botella':
      case 'venta':
        e.ventas_bot_u += Math.abs(cant); break
      case 'venta_copa':
        e.ventas_copa_u += Math.abs(cant); break
      case 'ajuste':
        e.ajustes_u += cant; break
      default:
        e.otras_u += Math.abs(cant)
    }
  }
  return idx
}

// lineas_compra → { [mes]: { [vino_id]: { eur } } }
export function indexarCompras(lineas, cabFechaMap) {
  const idx = {}
  for (const l of lineas) {
    const fecha = cabFechaMap[l.cabecera_id]
    if (!fecha) continue
    const mes = fecha.slice(0, 7)
    if (!idx[mes]) idx[mes] = {}
    if (!idx[mes][l.vino_id]) idx[mes][l.vino_id] = { eur: 0 }
    idx[mes][l.vino_id].eur = r2(idx[mes][l.vino_id].eur + (Number(l.importe_neto) || 0))
  }
  return idx
}

// partes_servicio_lineas → { [mes]: { [vino_id]: { bot_u, bot_eur_bruto, copa_u, copa_eur_bruto } } }
export function indexarPartes(lineas, parteFechaMap) {
  const idx = {}
  for (const l of lineas) {
    const fecha = parteFechaMap[l.parte_id]
    if (!fecha) continue
    const mes = fecha.slice(0, 7)
    if (!idx[mes]) idx[mes] = {}
    if (!idx[mes][l.vino_id]) idx[mes][l.vino_id] = { bot_u: 0, bot_eur_bruto: 0, copa_u: 0, copa_eur_bruto: 0 }
    const e = idx[mes][l.vino_id]
    const pvp = Number(l.precio_unitario) || 0
    if (l.tipo === 'venta_botella') {
      const u = Number(l.cantidad) || 0
      e.bot_u         += u
      e.bot_eur_bruto  = r2(e.bot_eur_bruto + u * pvp)
    } else if (l.tipo === 'venta_copa') {
      const u    = Number(l.cantidad) || 0
      const copas = Number(l.copas_vendidas) || 0
      e.copa_u         += u
      e.copa_eur_bruto  = r2(e.copa_eur_bruto + copas * pvp)
    }
  }
  return idx
}

// ── Cálculo de fila por vino ─────────────────────────────────────────────────

export function calcularFilaVino({ vino, smbPrev, smbCurrent, movsEntry, comprasEntry, partesEntry, ivaPct = 10 }) {
  const iva         = 1 + ivaPct / 100
  const stock_ini   = smbPrev?.stock_final_real ?? null
  const coste_medio = smbCurrent?.coste_medio ?? smbPrev?.coste_medio ?? 0

  const entradas_u   = movsEntry?.entradas_u   ?? 0
  const entradas_eur = r2(comprasEntry?.eur     ?? 0)

  // Display desde partes (fuente de facturación)
  const ventas_bot_u    = partesEntry?.bot_u    ?? 0
  const ventas_bot_eur  = r2((partesEntry?.bot_eur_bruto  ?? 0) / iva)
  const ventas_copa_u   = partesEntry?.copa_u   ?? 0
  const ventas_copa_eur = r2((partesEntry?.copa_eur_bruto ?? 0) / iva)

  const otras_salidas_u = movsEntry?.otras_u   ?? 0
  const ajustes_u       = movsEntry?.ajustes_u ?? 0

  // Reconstrucción de stock desde movimientos (consistente con cómo BD calcula SMB)
  // Fallback a partes si no hay movimientos para ese tipo
  const vbot_mov  = movsEntry?.ventas_bot_u  ?? ventas_bot_u
  const vcopa_mov = movsEntry?.ventas_copa_u ?? ventas_copa_u

  const stock_fin_rec = stock_ini !== null
    ? r2(stock_ini + entradas_u - vbot_mov - vcopa_mov - otras_salidas_u + ajustes_u)
    : null
  const stock_fin_smb = smbCurrent?.stock_final_real ?? null
  const stock_fin     = stock_fin_smb ?? stock_fin_rec

  // descuadre solo cuando hay SMB y reconstrucción posible
  const descuadre = (stock_fin_rec !== null && stock_fin_smb !== null)
    ? r2(stock_fin_rec - stock_fin_smb)
    : 0

  const consumo_mp = r2((ventas_bot_u + ventas_copa_u + otras_salidas_u) * coste_medio)

  return {
    vino_id:        vino.id,
    nombre:         vino.nombre,
    tipo:           vino.tipo ?? null,
    stock_ini,
    entradas_u,
    entradas_eur,
    ventas_bot_u,
    ventas_bot_eur,
    ventas_copa_u,
    ventas_copa_eur,
    otras_salidas_u,
    ajustes_u,
    stock_fin,
    consumo_mp,
    coste_medio,
    descuadre,
  }
}

// ── Totales de mes ───────────────────────────────────────────────────────────

export function totalizarFilas(filas) {
  const t = {
    entradas_u: 0, entradas_eur: 0,
    ventas_bot_u: 0, ventas_bot_eur: 0,
    ventas_copa_u: 0, ventas_copa_eur: 0,
    otras_salidas_u: 0, ajustes_u: 0,
    stock_ini: 0, stock_fin: 0,
    consumo_mp: 0,
  }
  for (const f of filas) {
    t.entradas_u      += f.entradas_u
    t.entradas_eur    += f.entradas_eur
    t.ventas_bot_u    += f.ventas_bot_u
    t.ventas_bot_eur  += f.ventas_bot_eur
    t.ventas_copa_u   += f.ventas_copa_u
    t.ventas_copa_eur += f.ventas_copa_eur
    t.otras_salidas_u += f.otras_salidas_u
    t.ajustes_u       += f.ajustes_u
    t.stock_ini       += (f.stock_ini ?? 0)
    t.stock_fin       += (f.stock_fin ?? 0)
    t.consumo_mp      += f.consumo_mp
  }
  for (const k of Object.keys(t)) t[k] = r2(t[k])
  return t
}

// ── Exportar CSV ─────────────────────────────────────────────────────────────

export function exportarCSV(meses) {
  const COLS = [
    'mes', 'estado', 'vino', 'tipo',
    'stock_ini', 'entradas_u', 'entradas_eur',
    'ventas_bot_u', 'ventas_bot_eur',
    'ventas_copa_u', 'ventas_copa_eur',
    'otras_salidas_u', 'ajustes_u',
    'stock_fin', 'consumo_mp', 'coste_medio', 'descuadre',
  ]
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [COLS.join(',')]
  for (const m of meses) {
    for (const f of m.vinos) {
      rows.push([
        m.mes, m.estado, esc(f.nombre), f.tipo ?? '',
        f.stock_ini ?? '', f.entradas_u, f.entradas_eur,
        f.ventas_bot_u, f.ventas_bot_eur,
        f.ventas_copa_u, f.ventas_copa_eur,
        f.otras_salidas_u, f.ajustes_u,
        f.stock_fin ?? '', f.consumo_mp, f.coste_medio, f.descuadre,
      ].join(','))
    }
  }
  return rows.join('\n')
}
