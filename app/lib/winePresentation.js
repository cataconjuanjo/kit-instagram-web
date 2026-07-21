export const WINE_TYPE_COLORS = {
  tinto: '#7B2D2D',
  blanco: '#C4A55A',
  rosado: '#C47A8A',
  espumoso: '#4A8C6F',
  generoso: '#854F0B',
  dulce: '#993556',
  naranja: '#D85A30',
  sin_alcohol: '#7B9E87',
  sidra: '#8A8F3A',
}

const BASE_LABELS = {
  tinto: 'Tinto',
  blanco: 'Blanco',
  rosado: 'Rosado',
  espumoso: 'Espumoso',
  generoso: 'Generoso',
  dulce: 'Dulce',
  naranja: 'Naranja',
  sin_alcohol: 'Sin alcohol',
  sidra: 'Sidra',
}

const BASE_PLURALS = {
  tinto: 'Tintos',
  blanco: 'Blancos',
  rosado: 'Rosados',
  espumoso: 'Espumosos',
  generoso: 'Generosos',
  dulce: 'Dulces',
  naranja: 'Naranjas',
  sin_alcohol: 'Sin alcohol',
  sidra: 'Sidras',
}

export function esPerfilGoiko(restaurante = {}) {
  const texto = `${restaurante?.slug || ''} ${restaurante?.nombre || ''}`.toLowerCase()
  return texto.includes('goiko') || texto.includes('janardoa')
}

export function etiquetasTipoVino(restaurante = {}) {
  if (!esPerfilGoiko(restaurante)) return { label: BASE_LABELS, plural: BASE_PLURALS }
  return {
    label: {
      ...BASE_LABELS,
      tinto: 'Tinto / ardo beltza',
      blanco: 'Blanco / ardo txuria',
      rosado: 'Rosado / ardo gorria',
      espumoso: 'Espumoso / aparduna',
      generoso: 'Generoso / ardo oparoa',
      dulce: 'Dulce / ardo gozoa',
      sidra: 'Sidra / sagardoa',
    },
    plural: {
      ...BASE_PLURALS,
      tinto: 'Tintos / ardo beltzak',
      blanco: 'Blancos / ardo txuriak',
      rosado: 'Rosados / ardo gorriak',
      espumoso: 'Espumosos / apardunak',
      generoso: 'Generosos / ardo oparoak',
      dulce: 'Dulces / ardo gozoak',
      sidra: 'Sidras / sagardoak',
    },
  }
}

export function ordenTiposVino(restaurante = {}) {
  const base = ['tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja', 'sin_alcohol']
  return esPerfilGoiko(restaurante) ? ['sidra', ...base] : base
}
