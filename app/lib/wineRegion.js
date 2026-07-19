export function normalizeWineText(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function compactText(text = '') {
  return normalizeWineText(text).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function termsFrom(text = '') {
  return compactText(text).split(' ').filter(term => term.length > 3)
}

const LOCAL_PRESETS = [
  {
    match: ['santander', 'cantabria'],
    terms: ['santander', 'cantabria', 'costa de cantabria', 'valle de guriezo', 'guriezo', 'liebana'],
  },
  {
    match: ['malaga'],
    terms: ['malaga', 'sierras de malaga', 'montes de malaga', 'ronda', 'axarquia'],
  },
  {
    match: ['jerez'],
    terms: ['jerez', 'jerez xeres sherry'],
  },
  {
    match: ['cadiz'],
    terms: ['cadiz', 'jerez', 'sanlucar', 'manzanilla', 'tierra de cadiz'],
  },
]

const SPANISH_TERMS = [
  'espana', 'rioja', 'rioja alavesa', 'ribera del duero', 'duero', 'toro', 'bierzo',
  'priorat', 'montsant', 'jumilla', 'yecla', 'alicante', 'almansa', 'valdepenas',
  'carinena', 'campo de borja', 'calatayud', 'valdejalon', 'utiel requena',
  'pago de otazu', 'abadia retuerta', 'rueda', 'rias baixas', 'valdeorras',
  'ribeiro', 'ribeira sacra', 'monterrei', 'tierra de galicia', 'galicia',
  'navarra', 'penedes', 'corpinnat', 'cava', 'alella', 'conca de barbera',
  'costers del segre', 'terra alta', 'emporda', 'mallorca', 'lanzarote',
  'getariako txakolina', 'txakoli', 'txacoli', 'cantabria', 'costa de cantabria',
  'valle de guriezo', 'tierra de castilla y leon', 'castilla y leon', 'do leon',
  'cebreros', 'sierra de gredos', 'madrid', 'tierra de madrid', 'tierra de extremadura',
  'extremadura', 'cadiz', 'tierra de cadiz', 'jerez', 'manzanilla', 'montilla',
  'moriles', 'malaga', 'sierras de malaga', 'granada', 'andalucia', 'valencia',
  'murcia', 'toledo', 'catalunya', 'cataluna', 'aragon', 'getaria', 'bizkaiko',
  'bizkaia', 'arabako', 'arlanza', 'mentrida', 'manchuela', 'ribeira duero',
  'ribera duero',
]

const INTERNATIONAL_TERMS = [
  'francia', 'aoc ', 'champagne', 'chablis', 'borgona', 'bourgogne', 'beaujolais',
  'beajolais', 'burdeos', 'bordeaux', 'margaux', 'loire', 'loira', 'rhone',
  'rodano', 'alsace', 'alsacia', 'jura', 'sauternes', 'saint emilion', 'pomerol',
  'pauillac', 'pessac leognan', 'saint estephe', 'st estephe', 'italia', 'toscana', 'piamonte',
  'barolo', 'brunello', 'bolgheri', 'lambrusco', 'brachetto', 'emilia romagna',
  'alemania', 'mosel', 'rheingau', 'pfalz', 'portugal', 'vinho verde', 'porto',
  'oporto', 'douro', 'dao', 'alentejo', 'evora', 'hungria', 'tokaj', 'argentina',
  'chile', 'sudafrica', 'austria', 'napa', 'vin de france', 'sud ouest',
  'irouleguy', 'jurancon', 'savennieres', 'saumur', 'anjou', 'morgon', 'fleurie',
  'gevey chambertin', 'gevrey chambertin', 'corton', 'volnay', 'montalcino',
  'siciliana', 'romagna', 'chianti', 'bairrada',
]

const SPANISH_REGION_MARKERS = [
  'rioja', 'navarra', 'rias baixas', 'ribeiro', 'monterrei', 'valdeorras',
  'ribeira sacra', 'bierzo', 'rueda', 'valdejalon', 'penedes', 'costers del segre',
  'alella', 'terra alta', 'orotava', 'lanzarote', 'getariako', 'bizkaiko',
  'ribera del duero', 'ribera duero', 'arlanza', 'mentrida', 'toro', 'montsant',
  'jumilla', 'manchuela', 'cava', 'txakolina', 'txakoli', 'txacoli',
]

const INTERNATIONAL_REGION_MARKERS = [
  'aoc', 'docg', 'doc ', 'vin de france', 'sudsteiermark', 'austria', 'alemania',
  'italia', 'portugal', 'francia', 'champagne', 'bourgogne', 'burdeos', 'bordeaux',
  'douro', 'dao', 'alentejo', 'bairrada', 'brunello', 'barolo', 'chianti',
  'siciliana', 'romagna',
]

export function localTermsForRestaurant(restaurante = {}) {
  const zone = compactText(`${restaurante?.ciudad || ''} ${restaurante?.provincia || ''} ${restaurante?.region || ''}`)
  const base = termsFrom(zone)
  const presets = LOCAL_PRESETS
    .filter(preset => preset.match.some(term => zone.includes(term)))
    .flatMap(preset => preset.terms)
  return [...new Set([...base, ...presets].map(compactText).filter(Boolean))]
}

export function isLocalWine(vino = {}, restaurante = {}) {
  const terms = localTermsForRestaurant(restaurante)
  if (!terms.length) return false
  const text = compactText(`${vino.nombre || ''} ${vino.bodega || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)
  return terms.some(term => text.includes(term))
}

export function localWineLabel(restaurante = {}) {
  const zone = restaurante?.provincia || restaurante?.ciudad || ''
  return zone ? `Vinos locales / ${zone}` : 'Vinos locales'
}

export function isSpanishWine(vino = {}) {
  const text = compactText(`${vino.region || ''} ${vino.notas_cata || ''}`)
  if (SPANISH_REGION_MARKERS.some(term => text.includes(compactText(term)))) return true
  return SPANISH_TERMS.some(term => text.includes(compactText(term)))
}

export function isInternationalWine(vino = {}) {
  if (vino.internacional === true) return true
  const text = compactText(`${vino.region || ''} ${vino.notas_cata || ''}`)
  if (INTERNATIONAL_REGION_MARKERS.some(term => text.includes(compactText(term)))) return true
  return INTERNATIONAL_TERMS.some(term => text.includes(compactText(term)))
}

export function commercialScopeForWine(vino = {}, restaurante = {}) {
  if (isLocalWine(vino, restaurante)) return 'local'
  if (isSpanishWine(vino)) return 'espana'
  if (isInternationalWine(vino)) return 'internacional'
  return 'sin_origen'
}

export function canonicalWineRegion(vino = {}) {
  const raw = String(vino.region || '').trim()
  const region = compactText(raw)
  if (!region) return 'Sin D.O.'

  const rules = [
    ['jerez xeres sherry', 'D.O. Jerez-Xeres-Sherry'],
    ['sierras de malaga', 'D.O. Sierras de Malaga'],
    ['malaga ancestral', 'Malaga Ancestral'],
    ['malaga', 'D.O. Malaga'],
    ['manzanilla', 'D.O. Manzanilla-Sanlucar'],
    ['montilla moriles', 'D.O. Montilla-Moriles'],
    ['tierra de cadiz', 'V.T. Cadiz'],
    ['cadiz', 'V.T. Cadiz'],
    ['rioja alavesa', 'D.O.Ca. Rioja Alavesa'],
    ['rioja', 'D.O.Ca. Rioja'],
    ['ribera del duero', 'D.O. Ribera del Duero'],
    ['ribera duero', 'D.O. Ribera del Duero'],
    ['toro', 'D.O. Toro'],
    ['bierzo', 'D.O. Bierzo'],
    ['priorat', 'D.O.Q. Priorat'],
    ['montsant', 'D.O. Montsant'],
    ['rias baixas', 'D.O. Rias Baixas'],
    ['ribeiro', 'D.O. Ribeiro'],
    ['ribeira sacra', 'D.O. Ribeira Sacra'],
    ['valdeorras', 'D.O. Valdeorras'],
    ['monterrei', 'D.O. Monterrei'],
    ['rueda', 'D.O. Rueda'],
    ['jumilla', 'D.O. Jumilla'],
    ['yecla', 'D.O. Yecla'],
    ['alicante', 'D.O. Alicante'],
    ['almansa', 'D.O. Almansa'],
    ['valdepenas', 'D.O. Valdepenas'],
    ['campo de borja', 'D.O. Campo de Borja'],
    ['carinena', 'D.O.P. Carinena'],
    ['calatayud', 'D.O. Calatayud'],
    ['valdejalon', 'V.T. Valdejalon'],
    ['utiel requena', 'D.O. Utiel-Requena'],
    ['pago de otazu', 'D.O.P. Pago de Otazu'],
    ['abadia retuerta', 'D.O.P. Abadia Retuerta'],
    ['cava', 'D.O. Cava'],
    ['corpinnat', 'Corpinnat'],
    ['penedes', 'D.O. Penedes'],
    ['alella', 'D.O. Alella'],
    ['conca de barbera', 'D.O. Conca de Barbera'],
    ['costers del segre', 'D.O. Costers del Segre'],
    ['terra alta', 'D.O. Terra Alta'],
    ['emporda', 'D.O. Emporda'],
    ['mallorca', 'D.O. Mallorca'],
    ['navarra', 'D.O. Navarra'],
    ['bizkaiko txakolina', 'D.O. Bizkaiko Txakolina'],
    ['getariako txakolina', 'D.O. Getariako Txakolina'],
    ['txakoli', 'D.O. Txakoli'],
    ['txacoli', 'D.O. Txakoli'],
    ['lanzarote', 'D.O. Lanzarote'],
    ['cantabria', 'V.T. Costa de Cantabria'],
    ['costa de cantabria', 'V.T. Costa de Cantabria'],
    ['valle de guriezo', 'V.T. Costa de Cantabria'],
    ['tierra de castilla y leon', 'V.T. Castilla y Leon'],
    ['castilla y leon', 'V.T. Castilla y Leon'],
    ['do leon', 'D.O. Leon'],
    ['tierra de galicia', 'V.T. Galicia'],
    ['tierra de madrid', 'V.T. Madrid'],
    ['madrid', 'D.O. Vinos de Madrid'],
    ['cebreros', 'D.O.P. Cebreros'],
    ['sierra de gredos', 'Sierra de Gredos'],
    ['tierra de extremadura', 'V.T. Extremadura'],
    ['extremadura', 'V.T. Extremadura'],
    ['valencia', 'D.O. Valencia'],
    ['champagne', 'AOC Champagne'],
    ['coteaux champenois', 'AOC Coteaux Champenois'],
    ['chablis', 'AOC Chablis'],
    ['puligny montrachet', 'AOC Puligny-Montrachet'],
    ['chassagne montrachet', 'AOC Chassagne-Montrachet'],
    ['meursault', 'AOC Meursault'],
    ['pouilly fuisse', 'AOC Pouilly-Fuisse'],
    ['pouilly fume', 'AOC Pouilly-Fume'],
    ['irouleguy', 'AOC Irouleguy'],
    ['jurancon', 'AOC Jurancon'],
    ['saumur champigny', 'AOC Saumur-Champigny'],
    ['savennieres', 'AOC Savennieres'],
    ['anjou', 'AOC Anjou'],
    ['beaune', 'AOC Beaune'],
    ['volnay', 'AOC Volnay'],
    ['bourgogne', 'AOC Bourgogne'],
    ['borgona', 'AOC Bourgogne'],
    ['beaujolais', 'AOC Beaujolais'],
    ['chinon', 'AOC Chinon'],
    ['cotes de gascogne', 'IGP Cotes de Gascogne'],
    ['sancerre', 'AOC Sancerre'],
    ['jura', 'AOC Jura'],
    ['l etoile', 'AOC L Etoile'],
    ['alsace', 'AOC Alsace'],
    ['chateauneuf du pape', 'AOC Chateauneuf-du-Pape'],
    ['crozes hermitage', 'AOC Crozes-Hermitage'],
    ['bordeaux superieur', 'AOC Bordeaux Superieur'],
    ['saint emilion grand cru', 'AOC Saint-Emilion Grand Cru'],
    ['montagne saint emilion', 'AOC Montagne-Saint-Emilion'],
    ['saint emilion', 'AOC Saint-Emilion'],
    ['saint estephe', 'AOC Saint-Estephe'],
    ['st estephe', 'AOC Saint-Estephe'],
    ['pessac leognan', 'AOC Pessac-Leognan'],
    ['pomerol', 'AOC Pomerol'],
    ['pauillac', 'AOC Pauillac'],
    ['sauternes', 'AOC Sauternes'],
    ['rheingau', 'Rheingau'],
    ['pfalz', 'Pfalz'],
    ['barolo', 'DOCG Barolo'],
    ['brunello di montalcino', 'DOCG Brunello di Montalcino'],
    ['bolgheri sassicaia', 'DOC Bolgheri Sassicaia'],
    ['bramaterra', 'DOC Bramaterra'],
    ['coste della sesia', 'DOC Coste della Sesia'],
    ['toscana', 'IGT Toscana'],
    ['lambrusco di sorbara', 'DOC Lambrusco di Sorbara'],
    ['lambrusco', 'Lambrusco'],
    ['brachetto d acqui', 'DOCG Brachetto d Acqui'],
    ['emilia romagna', 'Emilia-Romagna'],
    ['romagna sangiovese', 'DOC Romagna Sangiovese'],
    ['chianti', 'DOCG Chianti'],
    ['terre siciliana', 'IGT Terre Siciliane'],
    ['siciliana', 'IGT Terre Siciliane'],
    ['vinho verde', 'DOC Vinho Verde'],
    ['porto', 'DOC Porto'],
    ['douro', 'DOC Douro'],
    ['bairrada', 'DOC Bairrada'],
    ['dao', 'DOC Dao'],
    ['dâo', 'DOC Dao'],
    ['alentejo', 'DOC Alentejo'],
    ['evora', 'DOC Evora'],
    ['tokaj', 'Tokaj'],
  ]

  return rules.find(([term]) => region.includes(term))?.[1] || raw
}
