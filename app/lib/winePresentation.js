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

export function etiquetasTipoVino() {
  return { label: BASE_LABELS, plural: BASE_PLURALS }
}

export function ordenTiposVino() {
  return ['tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja', 'sin_alcohol']
}
