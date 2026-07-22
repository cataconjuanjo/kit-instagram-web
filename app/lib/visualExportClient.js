'use client'

function safeFileName(name = 'carta-viva') {
  return String(name || 'carta-viva')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 90) || 'carta-viva'
}

async function elementToCanvas(element, options = {}) {
  if (!element) throw new Error('No hay contenido para exportar.')
  const html2canvas = (await import('html2canvas')).default
  return html2canvas(element, {
    backgroundColor: options.backgroundColor || '#fffaf3',
    scale: options.scale || Math.min(2, window.devicePixelRatio || 2),
    useCORS: true,
    logging: false,
  })
}

function downloadUrl(url, filename) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export async function downloadElementAsPng(element, filename, options = {}) {
  const canvas = await elementToCanvas(element, options)
  downloadUrl(canvas.toDataURL('image/png'), `${safeFileName(filename)}.png`)
}

export async function downloadElementAsPdf(element, filename, options = {}) {
  const [canvas, jsPdfModule] = await Promise.all([
    elementToCanvas(element, options),
    import('jspdf'),
  ])
  const jsPDF = jsPdfModule.default
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const pageWidth = 210
  const pageHeight = 297
  const margin = options.marginMm ?? 10
  const imageWidthMm = pageWidth - margin * 2
  const imageHeightPerPagePx = Math.floor((pageHeight - margin * 2) * canvas.width / imageWidthMm)

  let sourceY = 0
  let page = 0
  while (sourceY < canvas.height) {
    const sliceHeight = Math.min(imageHeightPerPagePx, canvas.height - sourceY)
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = sliceHeight
    const context = slice.getContext('2d')
    context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)

    if (page > 0) pdf.addPage()
    const renderHeightMm = sliceHeight * imageWidthMm / canvas.width
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, imageWidthMm, renderHeightMm)
    sourceY += sliceHeight
    page += 1
  }

  pdf.save(`${safeFileName(filename)}.pdf`)
}
