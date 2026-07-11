const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const outputDir = process.argv[2] || path.join('output', 'catalogos')

const APP_COLUMNS = [
  'nombre',
  'bodega',
  'tipo',
  'region',
  'uva',
  'anada',
  'referencia',
  'formato',
  'coste_estimado',
  'pvp_recomendado',
  'disponibilidad',
  'notas',
]

function readSheet(filePath, sheetName = null) {
  const workbook = XLSX.readFile(filePath)
  const name = sheetName || workbook.SheetNames[0]
  return XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '', raw: false })
}

function normalizeAppRows(rows, catalogo, proveedorSugerido) {
  return rows.map(row => {
    const normalized = Object.fromEntries(APP_COLUMNS.map(column => [column, row[column] ?? '']))
    normalized.notas = [
      `catalogo: ${catalogo}`,
      `proveedor sugerido: ${proveedorSugerido}`,
      normalized.notas,
    ].filter(Boolean).join(' | ')
    return normalized
  })
}

function withOrigin(rows, catalogo, proveedorSugerido) {
  return rows.map(row => ({
    catalogo,
    proveedor_sugerido: proveedorSugerido,
    ...row,
  }))
}

function addSheet(workbook, name, rows) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name.slice(0, 31))
}

function main() {
  const listadoImport = readSheet(path.join(outputDir, 'listado_vinos_import_app.xlsx'))
  const listadoImportConPrecio = readSheet(path.join(outputDir, 'listado_vinos_import_app_con_precio.xlsx'))
  const listadoRevision = readSheet(path.join(outputDir, 'listado_vinos_revision.xlsx'), 'Revision')

  const vaImport = readSheet(path.join(outputDir, 'vins_alemanys_import_app.xlsx'))
  const vaImportConPrecio = readSheet(path.join(outputDir, 'vins_alemanys_import_app_con_precio.xlsx'))
  const vaRevision = readSheet(path.join(outputDir, 'vins_alemanys_revision.xlsx'), 'Revision')

  const lexImport = readSheet(path.join(outputDir, 'lexcellence_import_app.xlsx'))
  const lexImportConPrecio = readSheet(path.join(outputDir, 'lexcellence_import_app_con_precio.xlsx'))
  const lexRevision = readSheet(path.join(outputDir, 'lexcellence_revision.xlsx'), 'Revision')

  const bmImport = readSheet(path.join(outputDir, 'bodegas_mar_malaga_import_app.xlsx'))
  const bmImportConPrecio = readSheet(path.join(outputDir, 'bodegas_mar_malaga_import_app_con_precio.xlsx'))
  const bmRevision = readSheet(path.join(outputDir, 'bodegas_mar_malaga_revision.xlsx'), 'Revision')

  const listadoProveedor = 'Sommeliervinos'
  const vaProveedor = 'Vins Alemanys'
  const lexProveedor = "Must of Wines / L'Excellence"
  const bmProveedor = 'Bodegas Mar Malaga'

  const combinadoImport = [
    ...normalizeAppRows(listadoImport, 'LISTADO VINOS', listadoProveedor),
    ...normalizeAppRows(vaImport, 'Vins Alemanys 2026-06', vaProveedor),
    ...normalizeAppRows(lexImport, "L'Excellence Mayo 2026 Peninsula", lexProveedor),
    ...normalizeAppRows(bmImport, 'Bodegas Mar Malaga 2026-06-23', bmProveedor),
  ]
  const combinadoImportConPrecio = [
    ...normalizeAppRows(listadoImportConPrecio, 'LISTADO VINOS', listadoProveedor),
    ...normalizeAppRows(vaImportConPrecio, 'Vins Alemanys 2026-06', vaProveedor),
    ...normalizeAppRows(lexImportConPrecio, "L'Excellence Mayo 2026 Peninsula", lexProveedor),
    ...normalizeAppRows(bmImportConPrecio, 'Bodegas Mar Malaga 2026-06-23', bmProveedor),
  ]

  const resumen = [
    {
      catalogo: 'LISTADO VINOS',
      proveedor_sugerido: listadoProveedor,
      filas_total: listadoImport.length,
      filas_con_precio: listadoImportConPrecio.length,
      filas_revision: listadoRevision.length,
      observaciones: 'PDF original con 67 referencias sin precio/agotadas en el completo.',
    },
    {
      catalogo: 'Vins Alemanys 2026-06',
      proveedor_sugerido: vaProveedor,
      filas_total: vaImport.length,
      filas_con_precio: vaImportConPrecio.length,
      filas_revision: vaRevision.length,
      observaciones: 'Precio sin IVA; conserva codigo, clasificacion, cosecha, volumen y cajas en notas/revision.',
    },
    {
      catalogo: "L'Excellence Mayo 2026 Peninsula",
      proveedor_sugerido: lexProveedor,
      filas_total: lexImport.length,
      filas_con_precio: lexImportConPrecio.length,
      filas_revision: lexRevision.length,
      observaciones: 'Catalogo editorial extraido por precio y coordenadas; revisar hojas LEX si sustituye una tarifa anterior del mismo proveedor.',
    },
    {
      catalogo: 'Bodegas Mar Malaga 2026-06-23',
      proveedor_sugerido: bmProveedor,
      filas_total: bmImport.length,
      filas_con_precio: bmImportConPrecio.length,
      filas_revision: bmRevision.length,
      observaciones: 'Extrae vinos, generosos, espumosos, vermuts y licores; omite aceites, vinagres y no bebidas del catalogo.',
    },
    {
      catalogo: 'COMBINADO',
      proveedor_sugerido: 'Revisar proveedor por catalogo antes de importar',
      filas_total: combinadoImport.length,
      filas_con_precio: combinadoImportConPrecio.length,
      filas_revision: listadoRevision.length + vaRevision.length + lexRevision.length + bmRevision.length,
      observaciones: 'Usar archivos separados para cargar en la app por proveedor; si LEX es actualizacion, importar solo el ultimo catalogo y reemplazar el anterior.',
    },
  ]

  fs.mkdirSync(outputDir, { recursive: true })

  const revisionWorkbook = XLSX.utils.book_new()
  addSheet(revisionWorkbook, 'Resumen', resumen)
  addSheet(revisionWorkbook, 'Import LISTADO', withOrigin(listadoImport, 'LISTADO VINOS', listadoProveedor))
  addSheet(revisionWorkbook, 'Import VA', withOrigin(vaImport, 'Vins Alemanys 2026-06', vaProveedor))
  addSheet(revisionWorkbook, 'Import LEX', withOrigin(lexImport, "L'Excellence Mayo 2026 Peninsula", lexProveedor))
  addSheet(revisionWorkbook, 'Import BMM', withOrigin(bmImport, 'Bodegas Mar Malaga 2026-06-23', bmProveedor))
  addSheet(revisionWorkbook, 'Revision LISTADO', withOrigin(listadoRevision, 'LISTADO VINOS', listadoProveedor))
  addSheet(revisionWorkbook, 'Revision VA', withOrigin(vaRevision, 'Vins Alemanys 2026-06', vaProveedor))
  addSheet(revisionWorkbook, 'Revision LEX', withOrigin(lexRevision, "L'Excellence Mayo 2026 Peninsula", lexProveedor))
  addSheet(revisionWorkbook, 'Revision BMM', withOrigin(bmRevision, 'Bodegas Mar Malaga 2026-06-23', bmProveedor))

  const appWorkbook = XLSX.utils.book_new()
  addSheet(appWorkbook, 'Import app', combinadoImport)

  const appConPrecioWorkbook = XLSX.utils.book_new()
  addSheet(appConPrecioWorkbook, 'Import app', combinadoImportConPrecio)

  const revisionPath = path.join(outputDir, 'catalogos_combinados_revision.xlsx')
  const appPath = path.join(outputDir, 'catalogos_combinados_import_app.xlsx')
  const appConPrecioPath = path.join(outputDir, 'catalogos_combinados_import_app_con_precio.xlsx')
  const reportPath = path.join(outputDir, 'catalogos_combinados_reporte.json')

  XLSX.writeFile(revisionWorkbook, revisionPath)
  XLSX.writeFile(appWorkbook, appPath)
  XLSX.writeFile(appConPrecioWorkbook, appConPrecioPath)

  const report = {
    output: {
      revision: path.resolve(revisionPath),
      app: path.resolve(appPath),
      appConPrecio: path.resolve(appConPrecioPath),
      report: path.resolve(reportPath),
    },
    resumen,
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
}

main()
