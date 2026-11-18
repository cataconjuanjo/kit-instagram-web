import { jsPDF } from 'jspdf'
import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import {
  calcularTotalPersonal,
  calcularTotalGastos,
  calcularTotalAlquiler,
  calcularTotalBancarios,
  calcularBreakEven,
  calcularResultadoExplotacion,
} from '../../../lib/sommExplotacion'
import { imputarParametros } from '../../../lib/imputacionBodega'

function num(v) { return Number(v) || 0 }

// Las fuentes estándar de jsPDF (helvetica) sólo cubren WinAnsi-1252.
// Si cae un carácter fuera (signo "−" U+2212, en/em dashes, comillas curvas,
// espacios finos o no separables) jsPDF cambia el stream de esa línea a
// UTF-16 y el texto se renderiza con separaciones raras o glifos .
// ascii() sanea las cadenas antes de pintarlas.
function ascii(txt) {
  if (txt == null) return ''
  return String(txt)
    .replace(/[−‐‑–—]/g, '-')  // minus, hyphen, en-dash, em-dash
    .replace(/[‘’‚′]/g, "'")        // smart single quotes
    .replace(/[“”„″]/g, '"')        // smart double quotes
    .replace(/[    ]/g, ' ')        // thin / nbsp spaces
}

function formatEur(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0,00 €'
  const abs = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(Math.abs(v))
  return ascii((v < 0 ? '-' : '') + abs) + ' €'
}

function formatPct(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-'
  const v = Number(n)
  const abs = Math.abs(v).toFixed(1).replace('.', ',')
  return (v < 0 ? '-' : '') + abs + ' %'
}

function nombreMes(periodo) {
  if (!periodo) return ''
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const [anio, mes] = periodo.split('-')
  return `${meses[parseInt(mes) - 1]} ${anio}`
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = searchParams.get('restaurante_id')
    const periodo = searchParams.get('periodo') // 'YYYY-MM'

    if (!restauranteId || !periodo) {
      return Response.json({ error: 'Parámetros restaurante_id y periodo son obligatorios.' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      return Response.json({ error: 'Formato de periodo inválido. Usar YYYY-MM.' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    // Cargar datos
    const [{ data: restaurante }, { data: params }, { data: historico }, { data: presupuesto }] = await Promise.all([
      supabaseAdmin.from('restaurantes').select('nombre, email, plan').eq('id', restauranteId).single(),
      supabaseAdmin.from('parametros_explotacion').select('*').eq('restaurante_id', restauranteId).eq('periodo', periodo).maybeSingle(),
      supabaseAdmin.from('historico_mensual').select('*').eq('restaurante_id', restauranteId)
        .eq('anio', parseInt(periodo.slice(0, 4))).eq('mes', parseInt(periodo.slice(5))).maybeSingle(),
      supabaseAdmin.from('presupuesto_mensual').select('*').eq('restaurante_id', restauranteId)
        .eq('anio', parseInt(periodo.slice(0, 4))).eq('mes', parseInt(periodo.slice(5))).maybeSingle(),
    ])

    // Calcular P&L. Imputamos ANTES de agregar: con imputacion_pct
    // ausente o {} (columna no aplicada, o usuario sin tocar los %),
    // el objeto imputado es idéntico al original → el PDF saca los
    // mismos números que antes. SELECT * trae imputacion_pct si existe;
    // si no, viene undefined y imputarParametros lo trata como "100 %
    // en todo".
    const ventasNetas = num(historico?.ingresos)
    // `resto_ingresos` sólo existe si la migración `add_resto_ingresos`
    // está aplicada. `SELECT *` no falla si la columna no existe; en
    // ese caso params no la trae y `num(undefined)` queda en 0, con
    // lo que TOTAL INGRESOS = Ventas netas (comportamiento previo).
    const restoIngresos = num(params?.resto_ingresos)
    const totalIngresos = ventasNetas + restoIngresos
    const consumoMp = num(historico?.consumo_mp)
    const paramsImp = imputarParametros(params || {})
    const totalPersonal = calcularTotalPersonal(paramsImp).total
    const totalGastos = calcularTotalGastos(paramsImp.partidas_gastos || []).total
    const totalAlquiler = calcularTotalAlquiler(paramsImp.partidas_alquiler || []).total
    const totalBancarios = calcularTotalBancarios(paramsImp).total

    // Ratios y resultado se calculan con TOTAL INGRESOS como denominador
    // (ver sheet real del usuario "CUENTA EXPLOTACIÓN BODEGA").
    const resultado = calcularResultadoExplotacion({
      facturacion: totalIngresos,
      consumoMp,
      personal: totalPersonal,
      generales: totalGastos,
      alquiler: totalAlquiler,
      bancarios: totalBancarios,
    })

    const pctMp = totalIngresos > 0 ? (consumoMp / totalIngresos) * 100 : 0
    const margenBruto = totalIngresos - consumoMp
    const pctMargenBruto = totalIngresos > 0 ? (margenBruto / totalIngresos) * 100 : 0
    const be = calcularBreakEven(totalPersonal, totalGastos, totalAlquiler, totalBancarios, pctMp)

    // Generar PDF
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const W = 210
    const margin = 18
    let y = 20

    function line(text, x, yPos, opts = {}) {
      const { size = 10, bold = false, color = [30, 30, 30], align = 'left' } = opts
      doc.setFontSize(size)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setTextColor(...color)
      doc.text(ascii(text), x, yPos, { align })
    }

    function hrule(yPos, color = [220, 215, 200]) {
      doc.setDrawColor(...color)
      doc.setLineWidth(0.3)
      doc.line(margin, yPos, W - margin, yPos)
    }

    function row(label, value, yPos, pct, negativo = false) {
      line(label, margin, yPos)
      line(value, W - margin - 30, yPos, { align: 'right' })
      if (pct !== undefined && pct !== null) {
        line(formatPct(pct), W - margin, yPos, { align: 'right', color: negativo ? [220, 60, 60] : [80, 80, 80] })
      }
    }

    // Cabecera (banda negra + línea fina de acento dorado)
    doc.setFillColor(26, 26, 26)
    doc.rect(0, 0, W, 28, 'F')
    doc.setFillColor(201, 168, 106)
    doc.rect(0, 28, W, 1.2, 'F')
    line('Carta Viva', margin, 11, { size: 14, bold: true, color: [255, 255, 255] })
    line('Informe de Explotación Mensual', margin, 18, { size: 9, color: [180, 170, 155] })
    line(nombreMes(periodo), W - margin, 11, { size: 12, bold: true, color: [255, 255, 255], align: 'right' })
    if (restaurante?.nombre) {
      line(restaurante.nombre, W - margin, 18, { size: 9, color: [180, 170, 155], align: 'right' })
    }

    y = 38

    // Sección: Resultados principales
    line('CUENTA DE EXPLOTACIÓN', margin, y, { size: 8, bold: true, color: [150, 140, 130] })
    y += 6
    hrule(y)
    y += 6

    // Columna headers
    line('Partida', margin, y, { size: 8, bold: true, color: [120, 110, 100] })
    line('Importe', W - margin - 30, y, { size: 8, bold: true, color: [120, 110, 100], align: 'right' })
    line('% s/total ing.', W - margin, y, { size: 8, bold: true, color: [120, 110, 100], align: 'right' })
    y += 5
    hrule(y, [235, 230, 220])
    y += 5

    // Dos líneas de ingresos y un TOTAL INGRESOS explícito. La fila
    // "Resto" sólo aparece cuando es > 0 (si la columna no está
    // aplicada aún, resto = 0 y el PDF queda idéntico al previo).
    const filas = [
      { label: 'Ventas netas', value: formatEur(ventasNetas), pct: null, bold: false },
    ]
    if (restoIngresos > 0) {
      filas.push({ label: '+ Resto de ingresos de explotación', value: formatEur(restoIngresos), pct: null, bold: false })
    }
    filas.push(
      { label: '= Total ingresos', value: formatEur(totalIngresos), pct: null, bold: true },
      { label: '- Consumo Materia Prima', value: formatEur(consumoMp), pct: resultado.pctMp, negativo: true },
      { label: '= Margen Bruto', value: formatEur(margenBruto), pct: pctMargenBruto, bold: true },
      { label: '- Personal', value: formatEur(totalPersonal), pct: resultado.pctPersonal, negativo: true },
      { label: '- Gastos Operacionales', value: formatEur(totalGastos), pct: resultado.pctGenerales, negativo: true },
      { label: '- Alquileres', value: formatEur(totalAlquiler), pct: resultado.pctAlquiler, negativo: true },
      { label: '- Gastos Bancarios', value: formatEur(totalBancarios), pct: resultado.pctBancarios, negativo: true },
    )

    filas.forEach((f, idx) => {
      // Línea separadora reforzada antes de cada total (bold) que no sea el primero.
      if (f.bold && idx > 0) {
        hrule(y - 4, [210, 200, 180])
      }
      // Fondo alternado suave (zebra) en filas pares.
      if (idx % 2 === 1) {
        doc.setFillColor(250, 248, 243)
        doc.rect(margin - 2, y - 5, W - margin * 2 + 4, 7, 'F')
      }
      doc.setFontSize(10)
      doc.setFont('helvetica', f.bold ? 'bold' : 'normal')
      doc.setTextColor(30, 30, 30)
      doc.text(ascii(f.label), margin, y)
      doc.text(f.value, W - margin - 30, y, { align: 'right' })
      if (f.pct !== null && f.pct !== undefined) {
        doc.setFontSize(9)
        doc.setTextColor(f.negativo ? 180 : 80, f.negativo ? 50 : 80, f.negativo ? 50 : 80)
        doc.text(formatPct(f.pct), W - margin, y, { align: 'right' })
      }
      y += 7
      if (f.bold) {
        hrule(y - 2, [235, 230, 220])
      }
    })

    y += 2
    hrule(y, [26, 26, 26])
    y += 7

    // Resultado explotación: caja destacada en verde (positivo) o rojo (negativo)
    const margenPositivo = resultado.resultado >= 0
    // Fondo de la caja (tinte suave)
    doc.setFillColor(
      margenPositivo ? 232 : 253,
      margenPositivo ? 244 : 235,
      margenPositivo ? 232 : 235,
    )
    doc.rect(margin, y - 6, W - margin * 2, 12, 'F')
    // Barra lateral del color principal para reforzar el signo
    doc.setFillColor(
      margenPositivo ? 39 : 220,
      margenPositivo ? 160 : 60,
      margenPositivo ? 80 : 60,
    )
    doc.rect(margin, y - 6, 1.6, 12, 'F')
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(
      margenPositivo ? 18 : 170,
      margenPositivo ? 110 : 40,
      margenPositivo ? 45 : 40,
    )
    doc.text(ascii('= Margen de Explotación'), margin + 4, y)
    doc.text(formatEur(resultado.resultado), W - margin - 30, y, { align: 'right' })
    doc.setFontSize(10)
    doc.text(formatPct(resultado.pctResultado), W - margin, y, { align: 'right' })
    y += 16

    // Break-Even
    line('PUNTO DE EQUILIBRIO', margin, y, { size: 8, bold: true, color: [150, 140, 130] })
    y += 6
    hrule(y)
    y += 6
    row('Gastos fijos totales', formatEur(be.gastosFijos), y)
    y += 7
    row('Margen de contribución', formatPct(be.margenContribucion), y)
    y += 7
    row('Break-Even del mes', formatEur(be.breakEven), y, undefined)
    y += 7
    if (totalIngresos > 0 && be.breakEven > 0) {
      // El punto de equilibrio se evalúa contra TOTAL INGRESOS
      // (ventas netas + resto), coherente con la hoja real.
      const superado = totalIngresos >= be.breakEven
      const color = superado ? [39, 174, 96] : [231, 76, 60]
      const texto = superado
        ? `Cubierto: superado en ${formatEur(totalIngresos - be.breakEven)}`
        : `Sin cubrir: faltan ${formatEur(be.breakEven - totalIngresos)}`
      doc.setFillColor(superado ? 240 : 255, superado ? 250 : 245, superado ? 240 : 240)
      doc.rect(margin, y - 4, W - margin * 2, 8, 'F')
      line(texto, margin + 2, y, { size: 9, bold: true, color })
      y += 12
    }

    // Presupuesto vs real (si hay datos)
    if (presupuesto?.objetivo_facturacion) {
      y += 4
      line('PRESUPUESTO VS REAL', margin, y, { size: 8, bold: true, color: [150, 140, 130] })
      y += 6
      hrule(y)
      y += 6
      // El comparativo de presupuesto se mantiene sobre VENTAS NETAS
      // (es como se fijan los objetivos YoY en Histórico y Bonus).
      // El "Resto de ingresos" no entra en este bloque.
      const desvFact = presupuesto.objetivo_facturacion > 0
        ? ((ventasNetas - presupuesto.objetivo_facturacion) / presupuesto.objetivo_facturacion) * 100
        : null
      row('Objetivo facturación (ventas)', formatEur(presupuesto.objetivo_facturacion), y)
      y += 7
      row('Ventas netas reales', formatEur(ventasNetas), y)
      y += 7
      if (desvFact !== null) {
        const color = desvFact >= 0 ? [39, 174, 96] : [231, 76, 60]
        line('Desviación', margin, y)
        line(`${desvFact >= 0 ? '+' : ''}${formatPct(desvFact)}`, W - margin, y, { align: 'right', color })
        y += 7
      }
    }

    // Pie de página
    const fechaGeneracion = ascii(new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }))
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(180, 170, 155)
    doc.text(ascii(`Generado el ${fechaGeneracion} · Carta Viva`), margin, 287)
    doc.text('Confidencial', W - margin, 287, { align: 'right' })

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    const nombreArchivo = `informe-explotacion-${periodo}.pdf`

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('[somm/informe-mensual] GET:', error)
    return Response.json({ error: 'No se pudo generar el informe PDF.' }, { status: 500 })
  }
}
