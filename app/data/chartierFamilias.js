/**
 * chartierFamilias.js
 * Mapping de las 12 familias aromáticas canónicas de Chartier
 * a reglas de matching de vinos — compatible con cliente (no usa fs ni Node.js).
 *
 * Usado en el camarero para aplicar bonus Chartier a la puntuación local de vinos.
 */

function norm(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// ── Las 12 familias canónicas ──────────────────────────────────────────────
export const CHARTIER_FAMILIAS = {
  anisado_mentolado: {
    label: 'Anisado, mentolado, sabor a frío',
    tipos_preferidos: ['blanco', 'espumoso'],
    uvas: ['sauvignon', 'verdejo', 'albarino', 'albari', 'riesling', 'gruner', 'txakoli', 'godello', 'assyrtiko', 'chenin'],
    notas: ['herbal', 'citrico', 'fresco', 'vegetal', 'mineral', 'anisado'],
    evitar_tipos: ['tinto'],
    boost: 35,
    motivo: 'familia anisada/mentolada: los aromas herbales del plato resuenan con blancos tipo sauvignon, verdejo o riesling',
  },
  terpenico_floral: {
    label: 'Terpénico, cítrico, floral, balsámico',
    tipos_preferidos: ['blanco'],
    uvas: ['riesling', 'gewurztraminer', 'moscatel', 'torrontes', 'albarino', 'albari', 'gruner', 'viognier'],
    notas: ['floral', 'aromatico', 'especiado', 'exotico', 'perfumado'],
    boost: 30,
    motivo: 'familia terpénica/floral: los aromas especiados o florales conectan con blancos muy aromáticos',
  },
  tioles: {
    label: 'Tioles, vegetal exótico, fruta de la pasión',
    tipos_preferidos: ['blanco'],
    uvas: ['sauvignon', 'verdejo', 'colombard', 'scheurebe', 'gruner'],
    notas: ['herbal', 'citrico', 'mineral', 'vegetal'],
    boost: 33,
    motivo: 'familia tioles: ajo, alcaparras o pomelo conectan directamente con sauvignon blanc y verdejo',
  },
  lactonas: {
    label: 'Lactonas, coco, melocotón, cremosidad',
    tipos_preferidos: ['blanco'],
    uvas: ['chardonnay', 'roussanne', 'viognier', 'semillon', 'marsanne', 'godello'],
    notas: ['lias', 'crianza biologica', 'cremoso', 'mantequilla', 'untuoso', 'madera'],
    boost: 30,
    motivo: 'familia lactonas: ingredientes cremosos o grasos conectan con chardonnay, viognier o blancos sobre lías',
  },
  roble_barrica: {
    label: 'Roble, brasa, ahumado, tostado, Maillard',
    tipos_preferidos: ['tinto', 'blanco'],
    uvas: ['tempranillo', 'syrah', 'shiraz', 'cabernet', 'merlot', 'garnacha', 'malbec', 'chardonnay'],
    notas: ['crianza', 'reserva', 'roble', 'barrica', 'tostado', 'madera', 'ahumado'],
    boost: 32,
    motivo: 'familia tostada/Maillard: la brasa, el asado o el ahumado comparten puente aromático con vinos de crianza en barrica',
  },
  eugenol_clavo: {
    label: 'Eugenol, clavo, especias dulces',
    tipos_preferidos: ['tinto'],
    uvas: ['tempranillo', 'monastrell', 'zinfandel', 'garnacha'],
    notas: ['crianza', 'roble', 'barrica', 'especiado'],
    boost: 28,
    motivo: 'familia eugenol/clavo: especias como clavo o canela conectan con tintos españoles de crianza',
  },
  sotolon_oxidativo: {
    label: 'Sotolon, curry, nuez, soja, oxidativo',
    tipos_preferidos: ['generoso'],
    uvas: ['palomino'],
    notas: ['amontillado', 'oloroso', 'oxidativo', 'fino', 'manzanilla', 'jerez', 'rancio'],
    tipos_aceptados: ['dulce'],
    boost: 36,
    motivo: 'familia sotolon: curry, miso o soja conectan con jerez amontillado, oloroso o vinos oxidativos',
  },
  yodado_salino: {
    label: 'Yodado, salino, mineral, marino',
    tipos_preferidos: ['generoso', 'blanco', 'espumoso'],
    uvas: ['palomino', 'albarino', 'albari', 'godello', 'assyrtiko', 'muscadet', 'gruner', 'riesling'],
    notas: ['manzanilla', 'fino', 'salino', 'mineral', 'yodado', 'chablis', 'marino'],
    evitar_tipos: ['tinto'],
    boost: 38,
    motivo: 'familia marina/yodada: los mariscos y pescados conectan con fino, manzanilla, albariño o blancos minerales',
  },
  umami: {
    label: 'Umami, profundidad, volumen',
    tipos_preferidos: ['blanco', 'espumoso', 'generoso'],
    notas: ['lias', 'crianza biologica', 'oxidativo', 'mineral', 'salino', 'amontillado'],
    boost: 22,
    motivo: 'familia umami: setas, jamón o queso curado piden presencia en boca — blancos con lías, jerez o champagne',
  },
  capsaicina_picante: {
    label: 'Capsaicina, picante',
    tipos_preferidos: ['blanco', 'espumoso', 'rosado'],
    uvas: ['riesling', 'gewurztraminer', 'moscatel', 'albarino', 'albari', 'gruner'],
    notas: ['semidulce', 'afrutado', 'fresco', 'bajo alcohol'],
    evitar_tipos: ['tinto'],
    penalizar_notas: ['reserva', 'gran reserva', 'mucho cuerpo', 'potente', 'alcohol'],
    boost: 26,
    motivo: 'con picante: evitar tanino duro y alcohol alto — blancos frescos o con ligero dulzor',
  },
  carotenoides: {
    label: 'Carotenoides, pimentón, color naranja/rojo',
    tipos_preferidos: ['tinto', 'rosado'],
    uvas: ['garnacha', 'monastrell', 'grenache', 'tempranillo'],
    boost: 20,
    motivo: 'familia carotenoides (pimentón, calabaza, zanahoria) conecta con garnacha y rosados de calidad',
  },
  fruta_roja_floral: {
    label: 'Fruta roja, floral, ionona',
    tipos_preferidos: ['tinto', 'rosado'],
    uvas: ['pinot', 'garnacha', 'gamay', 'grenache', 'mencia'],
    notas: ['elegante', 'delicado', 'fino', 'ligero', 'fruta'],
    boost: 22,
    motivo: 'familia fruta roja/floral: conecta con pinot noir, garnacha joven o rosados de calidad',
  },
}

// ── Calcula el bonus Chartier para un vino basado en las familias del plato ──
export function bonusChartierFamilias(vino, familias = []) {
  if (!familias?.length || !vino) return { bonus: 0, motivo: null, riesgos: [] }

  const textoVino = norm(`${vino.nombre || ''} ${vino.tipo || ''} ${vino.uva || ''} ${vino.notas_cata || ''} ${vino.region || ''}`)
  const tipoVino = norm(vino.tipo || '')

  let bonus = 0
  const motivosPositivos = []
  const riesgos = []

  for (const familiaId of familias) {
    const familia = CHARTIER_FAMILIAS[familiaId]
    if (!familia) continue

    // Verificar evitación explícita
    if (familia.evitar_tipos?.includes(tipoVino)) {
      bonus -= 20
      riesgos.push(`${familia.label.split(',')[0]}: tipo ${tipoVino} puede chocar con este perfil`)
      continue
    }

    // Penalizar notas específicas con picante
    if (familia.penalizar_notas?.some(n => textoVino.includes(n))) {
      bonus -= 10
      riesgos.push(`con ${familia.label.split(',')[0]}: evitar notas de alcohol alto o tanino potente`)
    }

    const esUvaMatch = familia.uvas?.some(u => textoVino.includes(u))
    const esNotasMatch = familia.notas?.some(n => textoVino.includes(n))
    const esTipoPref = familia.tipos_preferidos?.includes(tipoVino)
    const esTipoAceptado = familia.tipos_aceptados?.includes(tipoVino)

    if (esUvaMatch) {
      bonus += familia.boost
      motivosPositivos.push(familia.motivo)
    } else if (esNotasMatch) {
      bonus += Math.round(familia.boost * 0.82)
      motivosPositivos.push(familia.motivo)
    } else if (esTipoPref) {
      bonus += Math.round(familia.boost * 0.5)
    } else if (esTipoAceptado) {
      bonus += Math.round(familia.boost * 0.4)
    }
  }

  return {
    bonus,
    motivo: motivosPositivos[0] || null,
    riesgos,
  }
}
