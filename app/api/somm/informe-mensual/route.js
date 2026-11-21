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
import { esRelacionInexistente } from '../../../lib/eventosBodega'
import {
  PDF_COLORS,
  cargarLogoPdf,
  formatPeriodoPdfEs,
  pintarCabecera,
  pintarPiesEnTodas,
} from '../../../lib/pdfEstilos'

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

    // Fase F: eventos del mes (grupos/maridajes NO incluidos en el TPV).
    // Línea informativa separada: NO suma a ventas ni al P&L (ni
    // ventas_neto ni resultado cambian). Si la tabla no existe (SQL
    // pendiente), `eventosInfo` queda null y no se pinta.
    const mesStart = `${periodo}-01`
    const [yStr, mStr] = periodo.split('-')
    const yNum = parseInt(yStr, 10), mNum = parseInt(mStr, 10)
    const mesNext = mNum === 12 ? `${yNum + 1}-01-01` : `${yStr}-${String(mNum + 1).padStart(2, '0')}-01`
    let eventosInfo = null
    try {
      const { data: eventos, error: errEv } = await supabaseAdmin
        .from('eventos_bodega')
        .select('tipo, importe_neto, incluido_en_tpv')
        .eq('restaurante_id', restauranteId)
        .gte('fecha', mesStart)
        .lt('fecha', mesNext)
      if (errEv) {
        if (!esRelacionInexistente(errEv)) {
          console.error('[informe-mensual] eventos_bodega error:', errEv.message)
        }
      } else {
        const noTpv = (eventos || []).filter(e => !e.incluido_en_tpv)
        if (noTpv.length > 0) {
          eventosInfo = {
            n:            noTpv.length,
            importe_neto: Math.round(noTpv.reduce((s, e) => s + (Number(e.importe_neto) || 0), 0) * 100) / 100,
          }
        }
      }
    } catch (e) {
      console.error('[informe-mensual] eventos_bodega excepción:', e?.message)
    }

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

    function hrule(yPos, color = PDF_COLORS.borde) {
      doc.setDrawColor(...color)
      doc.setLineWidth(0.3)
      doc.line(margin, yPos, W - margin, yPos)
    }

    function row(label, value, yPos, pct, negativo = false) {
      line(label, margin, yPos)
      line(value, W - margin - 30, yPos, { align: 'right' })
      if (pct !== undefined && pct !== null) {
        line(formatPct(pct), W - margin, yPos, { align: 'right', color: negativo ? PDF_COLORS.red : [80, 80, 80] })
      }
    }

    // Cabecera Carta Viva (burdeos + filete dorado + logo isotipo).
    // Delegada en app/lib/pdfEstilos.js para compartir paleta con el
    // Excel (BRAND de excelEstilos.js). Si el logo no carga,
    // degrada a sólo texto.
    const logo = cargarLogoPdf()
    pintarCabecera(doc, {
      W, margin,
      restauranteNombre: restaurante?.nombre || '',
      periodoEs: formatPeriodoPdfEs(periodo),
      subtitulo: 'Informe de Explotación Mensual',
      logo,
    })

    y = 38

    // Sección: Resultados principales
    line('CUENTA DE EXPLOTACIÓN', margin, y, { size: 8, bold: true, color: PDF_COLORS.wine })
    y += 6
    hrule(y)
    y += 6

    // Columna headers (tono burdeos oscuro para contraste con los
    // datos en marrón oscuro del cuerpo de la tabla).
    line('Partida', margin, y, { size: 8, bold: true, color: PDF_COLORS.wineDark })
    line('Importe', W - margin - 30, y, { size: 8, bold: true, color: PDF_COLORS.wineDark, align: 'right' })
    line('% s/total ing.', W - margin, y, { size: 8, bold: true, color: PDF_COLORS.wineDark, align: 'right' })
    y += 5
    hrule(y, PDF_COLORS.borde)
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
        hrule(y - 4, PDF_COLORS.gold)
      }
      // Fondo alternado beige (zebra) con la banda Carta Viva.
      if (idx % 2 === 1) {
        doc.setFillColor(...PDF_COLORS.banda)
        doc.rect(margin - 2, y - 5, W - margin * 2 + 4, 7, 'F')
      }
      doc.setFontSize(10)
      doc.setFont('helvetica', f.bold ? 'bold' : 'normal')
      doc.setTextColor(...PDF_COLORS.textDark)
      doc.text(ascii(f.label), margin, y)
      doc.text(f.value, W - margin - 30, y, { align: 'right' })
      if (f.pct !== null && f.pct !== undefined) {
        doc.setFontSize(9)
        if (f.negativo) doc.setTextColor(...PDF_COLORS.red)
        else            doc.setTextColor(80, 80, 80)
        doc.text(formatPct(f.pct), W - margin, y, { align: 'right' })
      }
      y += 7
      if (f.bold) {
        hrule(y - 2, PDF_COLORS.borde)
      }
    })

    y += 2
    hrule(y, PDF_COLORS.wine)
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

    // Fase F — línea informativa de eventos (no incluidos en ventas).
    // Se pinta solo si hay al menos 1 evento NO incluido en TPV; nunca
    // suma al P&L ni al resultado. Si la tabla eventos_bodega no existe
    // o no hay eventos, eventosInfo es null y este bloque se omite.
    if (eventosInfo) {
      y += 4
      line('EVENTOS (NO INCLUIDOS EN VENTAS)', margin, y, { size: 8, bold: true, color: PDF_COLORS.wine })
      y += 6
      hrule(y)
      y += 6
      row(`${eventosInfo.n} evento${eventosInfo.n === 1 ? '' : 's'} del mes`, formatEur(eventosInfo.importe_neto), y)
      y += 7
      line(
        ascii('Importe neto informativo. No suma a ventas ni al P&L (los eventos marcados como ya facturados por el TPV no se cuentan aquí).'),
        margin, y, { size: 7, color: [100, 100, 100] },
      )
      y += 10
    }

    // Break-Even
    line('PUNTO DE EQUILIBRIO', margin, y, { size: 8, bold: true, color: PDF_COLORS.wine })
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
      line('PRESUPUESTO VS REAL', margin, y, { size: 8, bold: true, color: PDF_COLORS.wine })
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

    // Pie: fecha de generación en una línea sutil sobre el footer de
    // marca; el footer "Carta Viva · Informe economico" + "Pagina X de N"
    // se pinta en pintarPiesEnTodas al final, iterando páginas, para
    // que el total sea correcto aunque el PDF crezca.
    const fechaGeneracion = ascii(new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }))
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...PDF_COLORS.textDark)
    doc.text(ascii(`Generado el ${fechaGeneracion}`), 18, 282)
    doc.text('Confidencial', W - 18, 282, { align: 'right' })

    // Footer de marca con Página X de N en TODAS las páginas.
    pintarPiesEnTodas(doc, { W })

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
