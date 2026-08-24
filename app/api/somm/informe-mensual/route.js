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

function num(v) { return Number(v) || 0 }

function formatEur(n) {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0) + ' €'
}

function formatPct(n) {
  return (n !== null && n !== undefined) ? n.toFixed(1) + '%' : '—'
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

    // Calcular P&L
    const facturacion = num(historico?.ingresos)
    const consumoMp = num(historico?.consumo_mp)
    const totalPersonal = calcularTotalPersonal(params || {}).total
    const totalGastos = calcularTotalGastos(params?.partidas_gastos || []).total
    const totalAlquiler = calcularTotalAlquiler(params?.partidas_alquiler || []).total
    const totalBancarios = calcularTotalBancarios(params || {}).total

    const resultado = calcularResultadoExplotacion({
      facturacion,
      consumoMp,
      personal: totalPersonal,
      generales: totalGastos,
      alquiler: totalAlquiler,
      bancarios: totalBancarios,
    })

    const pctMp = facturacion > 0 ? (consumoMp / facturacion) * 100 : 0
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
      doc.text(text, x, yPos, { align })
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

    // Cabecera
    doc.setFillColor(26, 26, 26)
    doc.rect(0, 0, W, 28, 'F')
    line('Carta Viva Somm', margin, 11, { size: 14, bold: true, color: [255, 255, 255] })
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
    line('% s/fact.', W - margin, y, { size: 8, bold: true, color: [120, 110, 100], align: 'right' })
    y += 5
    hrule(y, [235, 230, 220])
    y += 5

    const filas = [
      { label: 'Facturación', value: formatEur(facturacion), pct: null, bold: true },
      { label: '− Consumo Materia Prima', value: formatEur(consumoMp), pct: resultado.pctMp, negativo: true },
      { label: '= Margen Bruto', value: formatEur(resultado.margenBruto), pct: resultado.pctMargenBruto, bold: true },
      { label: '− Personal', value: formatEur(totalPersonal), pct: resultado.pctPersonal, negativo: true },
      { label: '− Gastos Operacionales', value: formatEur(totalGastos), pct: resultado.pctGenerales, negativo: true },
      { label: '− Alquileres', value: formatEur(totalAlquiler), pct: resultado.pctAlquiler, negativo: true },
      { label: '− Gastos Bancarios', value: formatEur(totalBancarios), pct: resultado.pctBancarios, negativo: true },
    ]

    for (const f of filas) {
      doc.setFontSize(10)
      doc.setFont('helvetica', f.bold ? 'bold' : 'normal')
      doc.setTextColor(30, 30, 30)
      doc.text(f.label, margin, y)
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
    }

    y += 2
    hrule(y, [26, 26, 26])
    y += 7

    // Resultado explotación
    const margenPositivo = resultado.margenExplotacion >= 0
    doc.setFillColor(margenPositivo ? 240 : 255, margenPositivo ? 248 : 240, margenPositivo ? 240 : 240)
    doc.rect(margin, y - 5, W - margin * 2, 10, 'F')
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(margenPositivo ? 30 : 200, margenPositivo ? 130 : 50, margenPositivo ? 30 : 50)
    doc.text('= Margen de Explotación', margin + 2, y)
    doc.text(formatEur(resultado.margenExplotacion), W - margin - 30, y, { align: 'right' })
    doc.setFontSize(10)
    doc.text(formatPct(resultado.pctMargenExplotacion), W - margin, y, { align: 'right' })
    y += 14

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
    if (facturacion > 0 && be.breakEven > 0) {
      const superado = facturacion >= be.breakEven
      const color = superado ? [39, 174, 96] : [231, 76, 60]
      const texto = superado
        ? `Cubierto: superado en ${formatEur(facturacion - be.breakEven)}`
        : `Sin cubrir: faltan ${formatEur(be.breakEven - facturacion)}`
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
      const desvFact = presupuesto.objetivo_facturacion > 0
        ? ((facturacion - presupuesto.objetivo_facturacion) / presupuesto.objetivo_facturacion) * 100
        : null
      row('Objetivo facturación', formatEur(presupuesto.objetivo_facturacion), y)
      y += 7
      row('Facturación real', formatEur(facturacion), y)
      y += 7
      if (desvFact !== null) {
        const color = desvFact >= 0 ? [39, 174, 96] : [231, 76, 60]
        line('Desviación', margin, y)
        line(`${desvFact >= 0 ? '+' : ''}${desvFact.toFixed(1)}%`, W - margin, y, { align: 'right', color })
        y += 7
      }
    }

    // Pie de página
    const fechaGeneracion = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(180, 170, 155)
    doc.text(`Generado el ${fechaGeneracion} · Carta Viva Somm`, margin, 287)
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
