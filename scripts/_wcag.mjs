// Helper local para calcular ratio WCAG; no se incorpora al runtime del bundle.
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}
function channelLinear(c8) {
  const c = c8 / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function relLum(hex) {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b)
}
export function ratio(fg, bg) {
  const l1 = relLum(fg), l2 = relLum(bg)
  const [L1, L2] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (L1 + 0.05) / (L2 + 0.05)
}
export function aa(fg, bg, big = false) {
  const r = ratio(fg, bg)
  return { ratio: r.toFixed(2), pass: big ? r >= 3 : r >= 4.5 }
}

// Oscurece un color manteniendo el hue/sat aproximado hasta que supere el ratio objetivo.
// Para no tocar la familia de marca, bajamos L hasta pasar el threshold.
export function darkenToPass(fg, bg, target = 4.5, step = 2) {
  let [r, g, b] = hexToRgb(fg)
  while ((r > 0 || g > 0 || b > 0) && ratio(rgbToHex([r, g, b]), bg) < target) {
    r = Math.max(0, r - step)
    g = Math.max(0, g - step)
    b = Math.max(0, b - step)
  }
  return rgbToHex([r, g, b])
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

// Si se invoca directamente: dump de los casos del informe.
const entry = process.argv[1] ? `file://${process.argv[1].replace(/\\/g, '/')}` : null
if (entry && import.meta.url === entry) {
  const cases = [
    { label: '.statLabel (subtítulo KPI, 11.5px upper)',  fg: '#9a9186', bg: '#ffffff', big: false },
    { label: '.statHint   (ayuda KPI, 12px)',             fg: '#b0a698', bg: '#ffffff', big: false },
    { label: '.statValue  (cifra KPI, 32px bold)',        fg: '#171416', bg: '#ffffff', big: true  },
    { label: '.eyebrow    (10px bold, letter-spacing)',   fg: '#9b7430', bg: '#ffffff', big: false },
    { label: '.loadingHint (ayuda 14px)',                 fg: '#756d63', bg: '#ffffff', big: false },
    { label: 'vinos: cabecera col VINO/COPA/… (10px)',    fg: '#cccccc', bg: '#ffffff', big: false },
    { label: 'banner ambar "Mes sin cerrar" (12px)',      fg: '#F59E0B', bg: '#fff8e7', big: false }, // fondo mezcla rgba(245,158,11,0.08) ≈ #fff8e7
  ]
  console.log('ANTES:')
  for (const c of cases) {
    const r = aa(c.fg, c.bg, c.big)
    const target = c.big ? 3 : 4.5
    console.log(`  ${c.label} ${c.fg} on ${c.bg}: ${r.ratio}:1 ${r.pass ? 'OK' : `← FALLA (objetivo ${target})`}`)
    if (!r.pass) {
      const sugerido = darkenToPass(c.fg, c.bg, target)
      const nuevo = aa(sugerido, c.bg, c.big)
      console.log(`    sugerido ${sugerido} → ${nuevo.ratio}:1 ${nuevo.pass ? 'OK' : 'KO'}`)
    }
  }
}
