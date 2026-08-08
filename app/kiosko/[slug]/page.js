'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import styles from './kiosko.module.css'

// ── Constantes ────────────────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 60_000
const SHOWCASE_INTERVAL_MS = 7_000
const MOBILE_SELECTION_MAX = 6
const COUNTER_ORDERS_IN_DEVELOPMENT = true

const TIPO_LABELS = {
  tinto: 'Tinto', blanco: 'Blanco', rosado: 'Rosado', espumoso: 'Espumoso',
  generoso: 'Generoso', dulce: 'Dulce', naranja: 'Naranja', sin_alcohol: 'Sin alcohol',
}
const TIPO_COLORS = {
  tinto: '#8B1A1A', blanco: '#C4A843', rosado: '#D4756A', espumoso: '#7AB5C8',
  generoso: '#B47C3C', dulce: '#C4567C', naranja: '#C4843C', sin_alcohol: '#5C9C5C',
}
const TIPO_ORDER = ['tinto','blanco','rosado','espumoso','generoso','dulce','naranja','sin_alcohol']

const FONT_CSS = {
  clasica:    { css: "'Playfair Display', Georgia, serif",    google: 'Playfair+Display:ital,wght@0,400;0,700;1,400' },
  moderna:    { css: "'Inter', system-ui, sans-serif",         google: null },
  elegante:   { css: "'Cormorant Garamond', Palatino, serif",  google: 'Cormorant+Garamond:ital,wght@0,400;0,600;1,400' },
  natural:    { css: "'Lato', Trebuchet MS, sans-serif",       google: 'Lato:wght@400;700' },
  redondeada: { css: "'Nunito', system-ui, sans-serif",        google: 'Nunito:wght@400;700;800' },
}

const SUGERENCIAS_MARIDAJE_FALLBACK = [
  'Tabla de quesos','Embutido ibérico','Conservas del mar',
  'Pulpo a la gallega','Mejillones al vapor','Cecina con picos',
  'Boquerones en vinagre','Sardinillas en aceite','Croquetas caseras',
]

const REGION_TO_CCAA = {
  'Rías Baixas': 'Galicia', 'Ribeiro': 'Galicia', 'Ribeira Sacra': 'Galicia',
  'Valdeorras': 'Galicia', 'Monterrei': 'Galicia',
  'Canarias': 'Canarias', 'Lanzarote': 'Canarias', 'La Palma': 'Canarias',
  'El Hierro': 'Canarias', 'Abona': 'Canarias', 'Tacoronte-Acentejo': 'Canarias',
  'Valle de Güímar': 'Canarias', 'Ycoden-Daute-Isora': 'Canarias', 'Gran Canaria': 'Canarias',
  'Rioja': 'La Rioja', 'La Rioja': 'La Rioja',
  'Ribera del Duero': 'Castilla y León', 'Rueda': 'Castilla y León', 'Toro': 'Castilla y León',
  'Bierzo': 'Castilla y León', 'Cigales': 'Castilla y León', 'Arribes': 'Castilla y León',
  'Priorat': 'Cataluña', 'Penedès': 'Cataluña', 'Catalunya': 'Cataluña',
  'Cava': 'Cataluña', 'Costers del Segre': 'Cataluña', 'Empordà': 'Cataluña',
  'Montsant': 'Cataluña', 'Terra Alta': 'Cataluña',
  'Jerez': 'Andalucía', 'Manzanilla': 'Andalucía', 'Montilla-Moriles': 'Andalucía',
  'Condado de Huelva': 'Andalucía', 'Málaga': 'Andalucía',
  'Rias Baixas': 'Galicia',
  'Navarra': 'Navarra',
  'Somontano': 'Aragón', 'Campo de Borja': 'Aragón', 'Cariñena': 'Aragón',
  'Alicante': 'Comunitat Valenciana', 'Valencia': 'Comunitat Valenciana', 'Utiel-Requena': 'Comunitat Valenciana',
  'Jumilla': 'Murcia', 'Yecla': 'Murcia', 'Bullas': 'Murcia',
  'La Mancha': 'Castilla-La Mancha', 'Valdepeñas': 'Castilla-La Mancha', 'Manchuela': 'Castilla-La Mancha',
  'Mentida': 'Castilla-La Mancha', 'Almansa': 'Castilla-La Mancha',
  'Vinho Verde': 'Portugal', 'Douro': 'Portugal', 'Alentejo': 'Portugal',
  'Bordeaux': 'Francia', 'Bourgogne': 'Francia', 'Champagne': 'Francia', 'Val de Loire': 'Francia',
  'Alsace': 'Francia', 'Côtes du Rhône': 'Francia',
}

function dominantCCAA(vinos) {
  const counts = {}
  for (const v of vinos) {
    const ccaa = REGION_TO_CCAA[v.region]
    if (ccaa) counts[ccaa] = (counts[ccaa] || 0) + 1
  }
  const total = vinos.filter(v => REGION_TO_CCAA[v.region]).length
  if (!total) return null
  const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || []
  return n / total >= 0.3 ? top : null
}

const OCASIONES_IDS = [
  { id: 'regalo',      emoji: '🎁' },
  { id: 'celebracion', emoji: '🥂' },
  { id: 'casa',        emoji: '🏠' },
]
const PRESUPUESTOS_IDS = [
  { id: 'bajo',  label: 'Hasta 15 €' },
  { id: 'medio', label: '15 – 30 €'  },
  { id: 'alto',  label: '30 – 60 €'  },
  { id: 'libre', label: null },  // label viene de T
]
const ESTILOS_IDS = [
  { id: 'afrutado' },
  { id: 'seco'     },
  { id: 'cuerpo'   },
  { id: 'ligero'   },
  { id: 'espumoso' },
  { id: 'dulce'    },
]

const VIEWS = { WELCOME: 'welcome', BROWSE: 'browse', PAIRING: 'pairing', DETAIL: 'detail', WIZARD: 'wizard', SHOWCASE: 'showcase', CESTA: 'cesta' }

const IDIOMAS = [
  { id: 'es', label: 'Español', flagClass: 'langFlagEs' },
  { id: 'en', label: 'English', flagClass: 'langFlagGb' },
  { id: 'fr', label: 'Français', flagClass: 'langFlagFr' },
  { id: 'de', label: 'Deutsch', flagClass: 'langFlagDe' },
]

const WELCOME_ACTION_EMOJIS = {
  browse: '🍾',
  choose: '🤔',
  pairing: '🍽️',
  cesta: '🎁',
}

const MARIDAJE_ICONOS = [
  { icon: '🧀', terms: ['queso', 'trufa', 'manchego', 'manchega', 'curado', 'curada'] },
  { icon: '🥩', terms: ['jamon', 'iberico', 'bellota', 'carne', 'cordero', 'solomillo', 'ternera'] },
  { icon: '🐟', terms: ['pescado', 'sardina', 'atun', 'bacalao', 'merluza'] },
  { icon: '🦞', terms: ['marisco', 'cigala', 'langostino', 'gamba', 'pulpo', 'bogavante'] },
  { icon: '🫒', terms: ['oliva', 'aceituna', 'esparrago', 'verdura', 'ensalada'] },
  { icon: '🍯', terms: ['dulce', 'postre', 'miel', 'chocolate'] },
]

const T = {
  es: {
    explorar: 'Explorar vinos', elegir: 'Ayúdame\na elegir', maridaje: '¿Con qué\nlo tomo?', cesta: 'Cesta\nregalo',
    volver: '← Volver', inicio: 'Inicio', atras: 'Atrás', nuevaBusqueda: 'Empezar de nuevo',
    referencias: n => `${n} referencias`, disponibles: n => `${n} disponibles`, destacados: '★ Destacados',
    pairingTitle: '¿Para qué buscas el vino?',
    pairingSub: 'Dinos el plato, momento u ocasión y te recomendamos el vino perfecto de nuestra selección',
    pairingPlaceholder: 'Ej: cigalas a la plancha, cordero asado, queso curado, celebración especial…',
    buscando: '⏳ Consultando…', buscar: '🔍 Buscar vinos', ideasRapidas: 'Ideas rápidas:',
    intentarDeNuevo: 'Intentar de nuevo',
    wizardTitle: 'Ayúdame a elegir',
    q0: '¿Para qué ocasión buscas el vino?', q1: '¿Qué estilo suele gustar?', q2: '¿Cuál es el presupuesto?',
    browseInicio: '← Inicio', buscarPlaceholder: 'Buscar vino, bodega, uva…',
    vinos: n => `${n} vinos`, todos: 'Todos', pais: 'País', region: 'D.O.', precio: 'Precio',
    sinResultados: 'No hay vinos con estos filtros.', limpiarFiltros: 'Limpiar filtros', limpiar: 'Limpiar',
    destacado: '★ Vino destacado', uva: 'Uva', anada: 'Añada', do: 'D.O.', paisLabel: 'País',
    encuentraEn: 'Encuéntralo en', maridaCon: 'Marida con',
    tipoLabels: { tinto:'Tinto', blanco:'Blanco', rosado:'Rosado', espumoso:'Espumoso', generoso:'Generoso', dulce:'Dulce', naranja:'Naranja', sin_alcohol:'Sin alcohol' },
    ocasionLabels: { regalo:'Es un\nregalo', celebracion:'Celebración\no aperitivo', casa:'Para tomar\nen casa' },
    estiloLabels: { afrutado:'🍓 Afrutado', seco:'🍂 Seco y elegante', cuerpo:'💪 Con mucho cuerpo', ligero:'☁️ Ligero y fresco', espumoso:'✨ Espumoso', dulce:'🍯 Dulce o generoso' },
    sinLimite: 'Sin límite', miRango: '🎯 Mi rango', elegirPresupuesto: 'Elige tu presupuesto',
    buscarRango: '🔍 Buscar con este rango →', cancelar: 'Cancelar',
    buscandoVino: '⏳ Buscando el vino perfecto para ti…',
    cestaTitle: 'Arma tu cesta regalo', cestaBack3: 'Cambiar preferencias',
    cestaQ0: '¿Para quién es el regalo?', cestaQ1: '¿Cuál es tu presupuesto?', cestaQ2: '¿Alguna preferencia especial?',
    cestaInputLabel: 'Introduce tu presupuesto en euros', cestaInputPh: 'p.ej. 85',
    cestaContinuar: 'Continuar →', cestaVerOpciones: '← Ver opciones predefinidas',
    cestaSinAlcohol: 'Sin alcohol', cestaVegano: 'Apto para veganos', cestaSinGluten: 'Sin gluten',
    cestaCrear: 'Crear mi cesta →', cestaArmando: 'Armando tu cesta…',
    cestaProductos: n => `${n} productos · Total:`, cestaPresupuesto: n => `/ ${n} € presupuesto`,
    cestaVacia: 'No hay suficientes productos para este presupuesto y preferencias.',
    cestaCambiarPresup: 'Cambiar presupuesto', cestaOtraCombi: '↺ Otra combinación', cestaNueva: 'Nueva cesta',
    cestaOcasiones: {
      enamorar:    { label: 'Para enamorar',    sub: 'pareja, aniversario…' },
      impresionar: { label: 'Para impresionar', sub: 'jefe, médico, favor…' },
      compartir:   { label: 'Para compartir',   sub: 'amigos, familia…' },
      celebrar:    { label: 'Para celebrar',    sub: 'cumpleaños, ascenso…' },
      capricho:    { label: 'Un capricho',      sub: 'para ti o alguien especial' },
    },
    cestaPresups: { '30': 'Hasta 30€', '50': 'Hasta 50€', '75': 'Hasta 75€', '100': 'Hasta 100€', libre: 'Importe libre' },
    cestaFrases: {
      enamorar:    ['Una cesta para decirlo sin palabras', 'El regalo que enamora', 'Para vuestro próximo momento juntos'],
      impresionar: ['Una selección que habla por ti', 'Para ese momento en que el detalle importa', 'El regalo que deja huella'],
      compartir:   ['Para convertir cualquier plan en noche épica', 'Para compartir lo mejor', 'La cesta de los grandes momentos juntos'],
      celebrar:    ['Para brindar por lo que llega', 'Que suenen los corchos', 'La cesta de las grandes ocasiones'],
      capricho:    ['Porque tú también te lo mereces', 'Para el placer sin excusas', 'Tu momento, tu selección'],
    },
  },
  en: {
    explorar: 'Explore wines', elegir: 'Help me\nchoose', maridaje: 'What goes\nwith it?', cesta: 'Gift\nbasket',
    volver: '← Back', inicio: 'Home', atras: 'Back', nuevaBusqueda: 'Start over',
    referencias: n => `${n} wines`, disponibles: n => `${n} available`, destacados: '★ Featured',
    pairingTitle: 'What are you looking for?',
    pairingSub: 'Tell us the dish, occasion or moment and we\'ll recommend the perfect wine from our selection',
    pairingPlaceholder: 'E.g: grilled prawns, roast lamb, aged cheese, special celebration…',
    buscando: '⏳ Searching…', buscar: '🔍 Find wines', ideasRapidas: 'Quick ideas:',
    intentarDeNuevo: 'Try again',
    wizardTitle: 'Help me choose',
    q0: 'What occasion are you shopping for?', q1: 'What style do you prefer?', q2: 'What\'s your budget?',
    browseInicio: '← Home', buscarPlaceholder: 'Search wine, winery, grape…',
    vinos: n => `${n} wines`, todos: 'All', pais: 'Country', region: 'Region', precio: 'Price',
    sinResultados: 'No wines match these filters.', limpiarFiltros: 'Clear filters', limpiar: 'Clear',
    destacado: '★ Featured wine', uva: 'Grape', anada: 'Vintage', do: 'Region', paisLabel: 'Country',
    encuentraEn: 'Find it at', maridaCon: 'Pairs with',
    tipoLabels: { tinto:'Red', blanco:'White', rosado:'Rosé', espumoso:'Sparkling', generoso:'Fortified', dulce:'Sweet', naranja:'Orange', sin_alcohol:'Alcohol-free' },
    ocasionLabels: { regalo:'A gift', celebracion:'Celebration\nor aperitif', casa:'Drink at\nhome' },
    estiloLabels: { afrutado:'🍓 Fruity', seco:'🍂 Dry & elegant', cuerpo:'💪 Full-bodied', ligero:'☁️ Light & fresh', espumoso:'✨ Sparkling', dulce:'🍯 Sweet or fortified' },
    sinLimite: 'No limit', miRango: '🎯 My range', elegirPresupuesto: 'Choose your budget',
    buscarRango: '🔍 Search this range →', cancelar: 'Cancel',
    buscandoVino: '⏳ Finding the perfect wine for you…',
    cestaTitle: 'Build your gift basket', cestaBack3: 'Change preferences',
    cestaQ0: 'Who is the gift for?', cestaQ1: 'What is your budget?', cestaQ2: 'Any special preferences?',
    cestaInputLabel: 'Enter your budget in euros', cestaInputPh: 'e.g. 85',
    cestaContinuar: 'Continue →', cestaVerOpciones: '← See preset options',
    cestaSinAlcohol: 'Alcohol-free', cestaVegano: 'Vegan-friendly', cestaSinGluten: 'Gluten-free',
    cestaCrear: 'Create my basket →', cestaArmando: 'Preparing your basket…',
    cestaProductos: n => `${n} items · Total:`, cestaPresupuesto: n => `/ €${n} budget`,
    cestaVacia: 'Not enough products for this budget and preferences.',
    cestaCambiarPresup: 'Change budget', cestaOtraCombi: '↺ Try another combination', cestaNueva: 'New basket',
    cestaOcasiones: {
      enamorar:    { label: 'To impress',          sub: 'partner, anniversary…' },
      impresionar: { label: 'To make a statement', sub: 'boss, doctor, favour…' },
      compartir:   { label: 'To share',            sub: 'friends, family…' },
      celebrar:    { label: 'To celebrate',        sub: 'birthday, promotion…' },
      capricho:    { label: 'A treat',             sub: 'for you or someone special' },
    },
    cestaPresups: { '30': 'Up to €30', '50': 'Up to €50', '75': 'Up to €75', '100': 'Up to €100', libre: 'Custom amount' },
    cestaFrases: {
      enamorar:    ['A basket that speaks without words', 'The gift that enchants', 'For your next special moment together'],
      impresionar: ['A selection that speaks for you', 'For when every detail matters', 'The gift that leaves a mark'],
      compartir:   ['Turn any night into an epic one', 'Share the very best', 'The basket for great moments together'],
      celebrar:    ["Toast to what's coming", 'Let the corks fly', 'The basket for big occasions'],
      capricho:    ['Because you deserve it too', 'Pleasure, no excuses', 'Your moment, your selection'],
    },
  },
  fr: {
    explorar: 'Explorer les vins', elegir: 'Aidez-moi\nà choisir', maridaje: 'Avec quoi\nle servir ?', cesta: 'Panier\ncadeau',
    volver: '← Retour', inicio: 'Accueil', atras: 'Retour', nuevaBusqueda: 'Recommencer',
    referencias: n => `${n} vins`, disponibles: n => `${n} disponibles`, destacados: '★ En vedette',
    pairingTitle: 'Pour quel plat cherchez-vous ?',
    pairingSub: 'Dites-nous le plat, le moment ou l\'occasion et nous vous recommandons le vin parfait',
    pairingPlaceholder: 'Ex : homard grillé, agneau rôti, fromage affiné, occasion spéciale…',
    buscando: '⏳ Recherche…', buscar: '🔍 Trouver des vins', ideasRapidas: 'Idées rapides :',
    intentarDeNuevo: 'Réessayer',
    wizardTitle: 'Aidez-moi à choisir',
    q0: 'Pour quelle occasion cherchez-vous ?', q1: 'Quel style préférez-vous ?', q2: 'Quel est votre budget ?',
    browseInicio: '← Accueil', buscarPlaceholder: 'Chercher vin, domaine, cépage…',
    vinos: n => `${n} vins`, todos: 'Tous', pais: 'Pays', region: 'Région', precio: 'Prix',
    sinResultados: 'Aucun vin ne correspond à ces filtres.', limpiarFiltros: 'Effacer les filtres', limpiar: 'Effacer',
    destacado: '★ Vin vedette', uva: 'Cépage', anada: 'Millésime', do: 'Région', paisLabel: 'Pays',
    encuentraEn: 'Trouvez-le au', maridaCon: 'S\'accompagne avec',
    tipoLabels: { tinto:'Rouge', blanco:'Blanc', rosado:'Rosé', espumoso:'Pétillant', generoso:'Fortifié', dulce:'Doux', naranja:'Orange', sin_alcohol:'Sans alcool' },
    ocasionLabels: { regalo:'Un cadeau', celebracion:'Fête ou\napéritif', casa:'À déguster\nchez soi' },
    estiloLabels: { afrutado:'🍓 Fruité', seco:'🍂 Sec et élégant', cuerpo:'💪 Corsé', ligero:'☁️ Léger et frais', espumoso:'✨ Pétillant', dulce:'🍯 Doux ou fortifié' },
    sinLimite: 'Sans limite', miRango: '🎯 Ma fourchette', elegirPresupuesto: 'Choisissez votre budget',
    buscarRango: '🔍 Rechercher cette fourchette →', cancelar: 'Annuler',
    buscandoVino: '⏳ Nous cherchons le vin parfait pour vous…',
    cestaTitle: 'Composez votre panier cadeau', cestaBack3: 'Changer les préférences',
    cestaQ0: 'Pour qui est le cadeau ?', cestaQ1: 'Quel est votre budget ?', cestaQ2: 'Des préférences particulières ?',
    cestaInputLabel: 'Entrez votre budget en euros', cestaInputPh: 'ex. 85',
    cestaContinuar: 'Continuer →', cestaVerOpciones: '← Voir les options prédéfinies',
    cestaSinAlcohol: 'Sans alcool', cestaVegano: 'Convient aux véganes', cestaSinGluten: 'Sans gluten',
    cestaCrear: 'Créer mon panier →', cestaArmando: 'Préparation du panier…',
    cestaProductos: n => `${n} produits · Total :`, cestaPresupuesto: n => `/ ${n} € de budget`,
    cestaVacia: 'Pas assez de produits pour ce budget et ces préférences.',
    cestaCambiarPresup: 'Changer le budget', cestaOtraCombi: '↺ Une autre combinaison', cestaNueva: 'Nouveau panier',
    cestaOcasiones: {
      enamorar:    { label: 'Pour séduire',       sub: 'couple, anniversaire…' },
      impresionar: { label: 'Pour impressionner', sub: 'patron, médecin, service…' },
      compartir:   { label: 'Pour partager',      sub: 'amis, famille…' },
      celebrar:    { label: 'Pour fêter',         sub: 'anniversaire, promotion…' },
      capricho:    { label: 'Un plaisir',         sub: "pour soi ou quelqu'un de spécial" },
    },
    cestaPresups: { '30': "Jusqu'à 30 €", '50': "Jusqu'à 50 €", '75': "Jusqu'à 75 €", '100': "Jusqu'à 100 €", libre: 'Montant libre' },
    cestaFrases: {
      enamorar:    ['Un panier qui parle sans mots', 'Le cadeau qui enchante', 'Pour votre prochain moment ensemble'],
      impresionar: ['Une sélection qui parle pour vous', 'Pour les moments où chaque détail compte', 'Le cadeau qui laisse une trace'],
      compartir:   ["Transformez n'importe quelle soirée en soirée épique", 'Pour partager le meilleur', 'Le panier des grands moments'],
      celebrar:    ['Trinquer à ce qui arrive', 'Que les bouchons sautent', 'Le panier des grandes occasions'],
      capricho:    ['Parce que vous le méritez aussi', 'Le plaisir sans excuses', 'Votre moment, votre sélection'],
    },
  },
  de: {
    explorar: 'Weine entdecken', elegir: 'Hilf mir\nwählen', maridaje: 'Womit\nkombinieren?', cesta: 'Geschenk-\nkorb',
    volver: '← Zurück', inicio: 'Start', atras: 'Zurück', nuevaBusqueda: 'Neu starten',
    referencias: n => `${n} Weine`, disponibles: n => `${n} verfügbar`, destacados: '★ Empfohlen',
    pairingTitle: 'Für welches Gericht suchen Sie?',
    pairingSub: 'Sagen Sie uns das Gericht oder den Anlass und wir empfehlen den perfekten Wein',
    pairingPlaceholder: 'Z.B.: Gegrillte Garnelen, Lammbraten, gereifter Käse, besonderer Anlass…',
    buscando: '⏳ Suche…', buscar: '🔍 Weine suchen', ideasRapidas: 'Schnelle Ideen:',
    intentarDeNuevo: 'Erneut versuchen',
    wizardTitle: 'Hilf mir wählen',
    q0: 'Für welchen Anlass suchen Sie?', q1: 'Welchen Stil bevorzugen Sie?', q2: 'Was ist Ihr Budget?',
    browseInicio: '← Start', buscarPlaceholder: 'Wein, Weingut, Traube suchen…',
    vinos: n => `${n} Weine`, todos: 'Alle', pais: 'Land', region: 'Region', precio: 'Preis',
    sinResultados: 'Keine Weine mit diesen Filtern.', limpiarFiltros: 'Filter löschen', limpiar: 'Löschen',
    destacado: '★ Empfohlener Wein', uva: 'Traube', anada: 'Jahrgang', do: 'Region', paisLabel: 'Land',
    encuentraEn: 'Finden Sie es bei', maridaCon: 'Passt zu',
    tipoLabels: { tinto:'Rotwein', blanco:'Weißwein', rosado:'Rosé', espumoso:'Schaumwein', generoso:'Likörwein', dulce:'Süßwein', naranja:'Orangenwein', sin_alcohol:'Alkoholfrei' },
    ocasionLabels: { regalo:'Ein Geschenk', celebracion:'Feier oder\nAperitif', casa:'Für zu\nHause' },
    estiloLabels: { afrutado:'🍓 Fruchtig', seco:'🍂 Trocken & elegant', cuerpo:'💪 Vollmundig', ligero:'☁️ Leicht & frisch', espumoso:'✨ Schaumwein', dulce:'🍯 Süß oder likör' },
    sinLimite: 'Kein Limit', miRango: '🎯 Mein Bereich', elegirPresupuesto: 'Budget wählen',
    buscarRango: '🔍 In diesem Bereich suchen →', cancelar: 'Abbrechen',
    buscandoVino: '⏳ Wir suchen den perfekten Wein für Sie…',
    cestaTitle: 'Stellen Sie Ihren Geschenkkorb zusammen', cestaBack3: 'Einstellungen ändern',
    cestaQ0: 'Für wen ist das Geschenk?', cestaQ1: 'Was ist Ihr Budget?', cestaQ2: 'Besondere Vorlieben?',
    cestaInputLabel: 'Budget in Euro eingeben', cestaInputPh: 'z.B. 85',
    cestaContinuar: 'Weiter →', cestaVerOpciones: '← Vordefinierte Optionen',
    cestaSinAlcohol: 'Alkoholfrei', cestaVegano: 'Veganfreundlich', cestaSinGluten: 'Glutenfrei',
    cestaCrear: 'Meinen Korb erstellen →', cestaArmando: 'Korb wird zusammengestellt…',
    cestaProductos: n => `${n} Produkte · Gesamt:`, cestaPresupuesto: n => `/ ${n} € Budget`,
    cestaVacia: 'Nicht genug Produkte für dieses Budget und diese Präferenzen.',
    cestaCambiarPresup: 'Budget ändern', cestaOtraCombi: '↺ Andere Kombination', cestaNueva: 'Neuer Korb',
    cestaOcasiones: {
      enamorar:    { label: 'Zum Verlieben',    sub: 'Partner, Jubiläum…' },
      impresionar: { label: 'Zum Beeindrucken', sub: 'Chef, Arzt, Gefallen…' },
      compartir:   { label: 'Zum Teilen',       sub: 'Freunde, Familie…' },
      celebrar:    { label: 'Zum Feiern',       sub: 'Geburtstag, Beförderung…' },
      capricho:    { label: 'Eine Verwöhnung',  sub: 'für dich oder jemand Besonderes' },
    },
    cestaPresups: { '30': 'Bis 30 €', '50': 'Bis 50 €', '75': 'Bis 75 €', '100': 'Bis 100 €', libre: 'Freier Betrag' },
    cestaFrases: {
      enamorar:    ['Ein Korb, der ohne Worte spricht', 'Das Geschenk, das verzaubert', 'Für Euren nächsten besonderen Moment'],
      impresionar: ['Eine Auswahl, die für Sie spricht', 'Wenn jedes Detail zählt', 'Das Geschenk, das bleibt'],
      compartir:   ['Machen Sie jeden Abend unvergesslich', 'Teilen Sie das Beste', 'Der Korb für großartige Momente'],
      celebrar:    ['Anstoßen auf das, was kommt', 'Die Korken knallen lassen', 'Der Korb für besondere Anlässe'],
      capricho:    ['Denn Sie haben es sich verdient', 'Genuss ohne Ausreden', 'Ihr Moment, Ihre Auswahl'],
    },
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizarTexto(t = '') {
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
function stripEmoji(s) {
  return String(s).replace(/\p{Extended_Pictographic}\ufe0f?/gu, '').trim()
}
function iconoMaridaje(texto = '') {
  const normal = normalizarTexto(texto)
  return MARIDAJE_ICONOS.find(item => item.terms.some(term => normal.includes(term)))?.icon || '🍴'
}
function inicialesTienda(nombre = '') {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return 'V'
  return partes.slice(0, 2).map(p => p[0]).join('').toUpperCase()
}
function formatPrecio(p) {
  if (!p) return ''
  return Number(p).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function precioActual(vino) {
  return Number(vino?.precio_oferta || vino?.precio_pvp || 0)
}
function extraerValoresUnicos(vinos, campo) {
  return [...new Set(vinos.map(v => v[campo]).filter(Boolean))].sort()
}
function esColorClaro(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return false
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return (r*299 + g*587 + b*114)/1000 > 145
}
const ESTILO_ES = {
  afrutado: 'Afrutado', seco: 'Seco y elegante', cuerpo: 'Con mucho cuerpo',
  ligero: 'Ligero y fresco', espumoso: 'Espumoso', dulce: 'Dulce o generoso',
}
function buildWizardQuery(w, regionLabel) {
  const parts = []
  if (w.ocasion === 'regalo')           parts.push('Es un regalo')
  else if (w.ocasion === 'celebracion') parts.push('Para una celebración o aperitivo')
  else if (w.ocasion === 'casa')        parts.push('Para tomar en casa tranquilamente')
  if (w.estilo && ESTILO_ES[w.estilo])  parts.push(`Estilo preferido: ${ESTILO_ES[w.estilo]}`)
  if (w.presupuesto === 'bajo')         parts.push('Presupuesto: hasta 15€')
  if (w.presupuesto === 'medio')        parts.push('Presupuesto: entre 15 y 30€')
  if (w.presupuesto === 'alto')         parts.push('Presupuesto: entre 30 y 60€')
  if (w.presupuesto === 'custom' && w.precioMin != null)
    parts.push(`Presupuesto: entre ${w.precioMin}€ y ${w.precioMax}€`)
  if (w.soloRegion && regionLabel) parts.push(`Solo vinos de ${regionLabel}`)
  return parts.join('. ')
}

// ── Widget de satisfacción ────────────────────────────────────────────────────

const FEEDBACK_EMOJIS = [
  { emoji: '😢', label: 'Muy malo'   },
  { emoji: '😟', label: 'Malo'       },
  { emoji: '😐', label: 'Regular'    },
  { emoji: '🙂', label: 'Bueno'      },
  { emoji: '😄', label: 'Excelente'  },
]

function FeedbackWidget({ slug }) {
  const [rating,      setRating]      = useState(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [sugerencia,  setSugerencia]  = useState('')
  const [enviando,    setEnviando]    = useState(false)
  const [enviado,     setEnviado]     = useState(false)

  async function enviar(r, sug) {
    setEnviando(true)
    try {
      await fetch(`/api/kiosko/${slug}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: r, sugerencia: sug }),
      })
    } catch {}
    setEnviando(false)
    setEnviado(true)
  }

  async function votar(r) {
    setRating(r)
    if (r <= 2) { setMostrarForm(true) }
    else { await enviar(r, '') }
  }

  if (enviado) return (
    <div className={styles.feedbackThanks}>¡Gracias por tu opinión! 🙏</div>
  )

  return (
    <div className={styles.feedbackWidget}>
      {!mostrarForm ? (
        <>
          <p className={styles.feedbackLabel}>¿Cómo ha sido tu experiencia?</p>
          <div className={styles.feedbackEmojis}>
            {FEEDBACK_EMOJIS.map((f, i) => (
              <button key={i} type="button" className={styles.feedbackEmoji}
                onClick={() => votar(i + 1)} title={f.label} aria-label={f.label}>
                {f.emoji}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className={styles.feedbackForm}>
          <p className={styles.feedbackFormTitle}>¿Qué podría mejorar?</p>
          <textarea
            className={styles.feedbackTextarea}
            value={sugerencia}
            onChange={e => setSugerencia(e.target.value)}
            placeholder="Cuéntanos tu experiencia…"
            rows={3}
            autoFocus
          />
          <div className={styles.feedbackFormBtns}>
            <button type="button" className={styles.feedbackCancel}
              onClick={() => { setMostrarForm(false); setRating(null) }}>
              Cancelar
            </button>
            <button type="button" className={styles.feedbackSubmit}
              disabled={enviando || !sugerencia.trim()}
              onClick={() => enviar(rating, sugerencia)}>
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Slider de precio doble ────────────────────────────────────────────────────

function PriceRangeSlider({ minAll, maxAll, valueMin, valueMax, onChangeMin, onChangeMax, acento }) {
  const range = maxAll - minAll || 1
  const pct1 = ((valueMin - minAll) / range) * 100
  const pct2 = ((valueMax - minAll) / range) * 100

  return (
    <div className={styles.priceSlider}>
      <div className={styles.priceSliderTrack}>
        <div className={styles.priceSliderFill} style={{ left: `${pct1}%`, width: `${pct2 - pct1}%`, background: acento }} />
      </div>
      <div className={styles.priceSliderInputs}>
        <input type="range" min={minAll} max={maxAll} value={valueMin}
          className={styles.priceSliderInput}
          style={{ '--thumb': acento }}
          onChange={e => { const v = Number(e.target.value); if (v < valueMax) onChangeMin(v) }}
        />
        <input type="range" min={minAll} max={maxAll} value={valueMax}
          className={styles.priceSliderInput}
          style={{ '--thumb': acento }}
          onChange={e => { const v = Number(e.target.value); if (v > valueMin) onChangeMax(v) }}
        />
      </div>
      <div className={styles.priceSliderValues}>
        <span>{valueMin} €</span>
        <span>{valueMax} €</span>
      </div>
    </div>
  )
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function KioskIcon({ name }) {
  if (name === 'choose') return (
    <svg className={styles.welcomeActionSvg} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="17" />
      <path d="M28.5 19.5 20 22l-2.5 8.5 8.5-2.5 2.5-8.5Z" />
      <circle cx="24" cy="24" r="2" />
    </svg>
  )

  if (name === 'pairing') return (
    <svg className={styles.welcomeActionSvg} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M16 8v16" />
      <path d="M11 8v9c0 4 2 7 5 7s5-3 5-7V8" />
      <path d="M16 24v16" />
      <path d="M31 8c4 3 6 8 5 14-.5 3-2 5-5 6v12" />
      <path d="M29 8v32" />
    </svg>
  )

  if (name === 'cesta') return (
    <svg className={styles.welcomeActionSvg} viewBox="0 0 48 48" aria-hidden="true">
      {/* caja */}
      <rect x="8" y="23" width="32" height="19" rx="2"/>
      {/* tapa */}
      <rect x="6" y="16" width="36" height="8" rx="2"/>
      {/* lazo vertical */}
      <path d="M24 16v26"/>
      {/* lazo izquierdo */}
      <path d="M24 16 C18 5 8 10 14 16 C18 19 24 16"/>
      {/* lazo derecho */}
      <path d="M24 16 C30 5 40 10 34 16 C30 19 24 16"/>
    </svg>
  )

  return (
    <svg className={styles.welcomeActionSvg} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M21 7h6" />
      <path d="M22 7v9l-5 7v15c0 2 1.5 3 3 3h8c1.5 0 3-1 3-3V23l-5-7V7" />
      <path d="M17 28h14" />
      <path d="M18 35h12" />
    </svg>
  )
}

function WelcomeActionIcon({ name, variant }) {
  if (variant === 'lineal') return <KioskIcon name={name} />
  return <span className={styles.welcomeActionEmoji} aria-hidden="true">{WELCOME_ACTION_EMOJIS[name]}</span>
}

function WizardOcasionIcon({ id }) {
  if (id === 'regalo') return (
    <svg className={styles.wizardOcasionSvg} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="20" width="36" height="6" rx="1" />
      <path d="M10 26v16h28V26" />
      <path d="M24 20V42" />
      <path d="M24 20c0-5-5-9-9-5s0 9 9 5Z" />
      <path d="M24 20c0-5 5-9 9-5s0 9-9 5Z" />
    </svg>
  )
  if (id === 'celebracion') return (
    <svg className={styles.wizardOcasionSvg} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M17 8l-5 20c0 5 5 9 12 9s12-4 12-9l-5-20" />
      <path d="M12 22h24" />
      <path d="M17 8h14" />
      <path d="M21 37v7" />
      <path d="M27 37v7" />
      <path d="M15 44h18" />
    </svg>
  )
  if (id === 'casa') return (
    <svg className={styles.wizardOcasionSvg} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 24L24 10l16 14" />
      <path d="M14 22v18h20V22" />
      <path d="M20 40V28h8v12" />
    </svg>
  )
  return null
}

function SafeImage({ src, alt, className, fallback, ...props }) {
  const [failedSrc, setFailedSrc] = useState('')
  const failed = Boolean(src && failedSrc === src)

  if (!src || failed) return fallback ?? null

  return (
    <img
      src={src}
      alt={alt || ''}
      className={className}
      onError={() => setFailedSrc(src)}
      {...props}
    />
  )
}

function LogoFallback({ nombre }) {
  return (
    <div className={styles.welcomeLogoFallback} aria-hidden="true">
      {inicialesTienda(nombre)}
    </div>
  )
}

function MobileQrModal({
  selection,
  onClose,
  onRemove,
  colorAcento,
  ordersEnabled = false,
  order,
}) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [counterMode, setCounterMode] = useState('options')
  const vinos = selection?.vinos || (selection?.vino ? [selection.vino] : [])
  const total = vinos.reduce((sum, vino) => sum + precioActual(vino), 0)

  useEffect(() => {
    if (!selection?.url || ordersEnabled) {
      queueMicrotask(() => setQrDataUrl(''))
      return
    }
    queueMicrotask(() => setQrDataUrl(''))
    QRCode.toDataURL(selection.url, {
      width: 760,
      margin: 2,
      color: { dark: '#171416', light: '#ffffff' },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(''))
  }, [ordersEnabled, selection?.url])

  useEffect(() => {
    queueMicrotask(() => {
      setCounterMode('options')
      setCopiado(false)
    })
  }, [selection?.url])

  if (!selection || vinos.length === 0) return null

  async function copiar() {
    try {
      await navigator.clipboard.writeText(selection.url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1600)
    } catch {}
  }

  return (
    <div className={styles.mobileQrOverlay} onClick={onClose}>
      <div className={styles.mobileQrPanel} onClick={e => e.stopPropagation()}>
        <button className={styles.mobileQrClose} type="button" onClick={onClose} aria-label="Cerrar">&times;</button>
        <p className={styles.mobileQrEyebrow}>Carrito de vinos</p>
        <h3>{vinos.length} {vinos.length === 1 ? 'vino guardado' : 'vinos guardados'}</h3>
        <p className={styles.mobileQrBodega}>
          {ordersEnabled
            ? 'Elige cómo quieres terminar esta selección en tienda.'
            : 'Cuando termines, escanea este QR para llevarte la lista al móvil.'}
        </p>
        {total > 0 && (
          <div className={styles.mobileQrTotal}>
            <span>Total orientativo</span>
            <strong>{formatPrecio(total)}</strong>
          </div>
        )}
        <div className={styles.mobileQrWineList}>
          {vinos.map(vino => (
            <div key={vino.id} className={styles.mobileQrWineRow}>
              <span>
                <strong>{vino.nombre}</strong>
                {vino.bodega && <small>{vino.bodega}</small>}
              </span>
              {precioActual(vino) > 0 && <em>{formatPrecio(precioActual(vino))}</em>}
              {onRemove && (
                <button type="button" onClick={() => onRemove(vino.id)} aria-label={`Quitar ${vino.nombre}`}>
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
        {ordersEnabled && (
          <div className={styles.counterOrderBox}>
            {order ? (
              <div className={styles.counterOrderSuccess}>
                <span>Pendiente de pago</span>
                <strong>{order.order_code}</strong>
                <p>Ya aparece en caja para cobrar, confirmar disponibilidad y preparar los vinos.</p>
              </div>
            ) : (
              <>
                <div className={styles.counterChoiceList}>
                  <button
                    type="button"
                    className={`${styles.counterChoiceBtn} ${counterMode === 'show' ? styles.counterChoiceActive : ''}`}
                    onClick={() => setCounterMode('show')}
                  >
                    <span>1</span>
                    <strong>Mostrar en caja</strong>
                    <em>El dependiente termina el pedido.</em>
                  </button>
                  <button
                    type="button"
                    className={`${styles.counterChoiceBtn} ${styles.counterChoiceDevelopment}`}
                    disabled
                  >
                    <span>2</span>
                    <strong>
                      Pedir en caja
                      <small>En desarrollo</small>
                    </strong>
                    <em>Estamos pausando esta funcion hasta cerrar bien el flujo operativo.</em>
                  </button>
                  <button
                    type="button"
                    className={`${styles.counterChoiceBtn} ${counterMode === 'payment' ? styles.counterChoiceActive : ''}`}
                    onClick={() => setCounterMode('payment')}
                  >
                    <span>3</span>
                    <strong>Pagar ahora</strong>
                    <em>Pasarela de pago de la tienda.</em>
                  </button>
                </div>
                {counterMode === 'show' && (
                  <div className={styles.counterChoiceNotice}>
                    <strong>Modo caja listo</strong>
                    <p>Enseña esta pantalla al equipo. Puede revisar los vinos de arriba, confirmar precio y terminar la venta.</p>
                  </div>
                )}
                {counterMode === 'payment' && (
                  <div className={styles.counterChoiceNotice}>
                    <strong>Pago online pendiente</strong>
                    <p>Esta opción queda reservada para abrir la pasarela de pago de la tienda cuando la conectemos.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {!ordersEnabled && (
          <>
            <div className={styles.mobileQrBox}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR para abrir la seleccion en el movil" className={styles.mobileQrImg} />
                : <div className={styles.mobileQrLoading}>Generando QR...</div>}
            </div>
            <p className={styles.mobileQrHint}>La lista conserva nombres, precios, ubicaciones y notas para enseñarla en caja o guardarla.</p>
            <div className={styles.mobileQrActions}>
              <button type="button" onClick={copiar} style={{ background: colorAcento }}>
                {copiado ? 'Enlace copiado' : 'Copiar enlace'}
              </button>
              <button type="button" onClick={onClose} className={styles.mobileQrSecondary}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function WineCartIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M14 18h20l-2 21H16L14 18Z" />
      <path d="M18 18c0-5 2.8-8 6-8s6 3 6 8" />
      <path d="M23 22h4" />
      <path d="M24 22v5l-3 4v5h10v-5l-3-4v-5" />
      <path d="M22 32h8" />
    </svg>
  )
}

function MobileSelectionTray({ vinos, notice, onOpen, onClear, colorAcento, ordersEnabled = false }) {
  if (!vinos.length) return null
  const total = vinos.reduce((sum, vino) => sum + precioActual(vino), 0)

  return (
    <div className={styles.mobileSelectionTray}>
      <div className={styles.mobileSelectionCartIcon} aria-hidden="true">
        <WineCartIcon className={styles.mobileSelectionCartSvg} />
        <span>{vinos.length}</span>
      </div>
      <div className={styles.mobileSelectionInfo}>
        <span>Carrito de vinos</span>
        <strong>{notice || `${vinos.length} ${vinos.length === 1 ? 'vino guardado' : 'vinos guardados'}`}</strong>
      </div>
      <div className={styles.mobileSelectionNames}>
        {vinos.slice(0, 3).map(vino => vino.nombre).join(' · ')}
        {vinos.length > 3 ? ` · +${vinos.length - 3}` : ''}
      </div>
      {total > 0 && <div className={styles.mobileSelectionTotal}>{formatPrecio(total)}</div>}
      <button className={styles.mobileSelectionQrBtn} type="button" onClick={onOpen} style={{ background: colorAcento }}>
        {ordersEnabled ? 'Ver opciones' : 'Ver carrito y QR'}
      </button>
      <button className={styles.mobileSelectionClearBtn} type="button" onClick={onClear} aria-label="Vaciar carrito">
        &times;
      </button>
    </div>
  )
}

function BottleMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M21 7h6" />
      <path d="M22 7v9l-5 7v15c0 2 1.5 3 3 3h8c1.5 0 3-1 3-3V23l-5-7V7" />
      <path d="M18 29h12" />
      <path d="M19 36h10" />
    </svg>
  )
}

function LocationMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.4" />
    </svg>
  )
}

function TipoChip({ tipo, size = 'sm' }) {
  return (
    <span className={`${styles.tipoChip} ${size === 'lg' ? styles.tipoChipLg : ''}`} style={{ background: TIPO_COLORS[tipo] || '#666' }}>
      {TIPO_LABELS[tipo] || tipo}
    </span>
  )
}

function WineCardPlaceholder({ tipo }) {
  const color = TIPO_COLORS[tipo] || '#2a2a2a'
  return (
    <div className={styles.cardImgPlaceholder} style={{ background: `linear-gradient(135deg, ${color}33, ${color}88)` }}>
      <BottleMark className={styles.cardImgIcon} />
    </div>
  )
}

function WineCard({ vino, onClick }) {
  return (
    <button className={styles.wineCard} onClick={() => onClick(vino)} type="button">
      <div className={styles.cardImg}>
        <SafeImage
          src={vino.foto_url}
          alt={vino.nombre}
          className={styles.cardImgPhoto}
          loading="lazy"
          fallback={<WineCardPlaceholder tipo={vino.tipo} />}
        />
        {vino.destacado && <span className={styles.cardDestacado}>★ Destacado</span>}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          {vino.tipo && <TipoChip tipo={vino.tipo} />}
          {vino.puntuacion && <span className={styles.cardPuntuacion}>{vino.puntuacion} pts</span>}
        </div>
        <p className={styles.cardNombre}>{vino.nombre}</p>
        {vino.bodega && <p className={styles.cardBodega}>{vino.bodega}</p>}
        <p className={styles.cardMeta}>{[vino.uva, vino.anada, vino.region].filter(Boolean).join(' · ')}</p>
        <div className={styles.cardFooter}>
          {vino.precio_oferta
            ? <span className={styles.cardPrecioOferta}>
                <s className={styles.cardPrecioTachado}>{formatPrecio(vino.precio_pvp)}</s>
                <span className={styles.cardPrecioOfertaValor}>{formatPrecio(vino.precio_oferta)}</span>
                <span className={styles.ofertaBadge}>OFERTA</span>
              </span>
            : vino.precio_pvp && <span className={styles.cardPrecio}>{formatPrecio(vino.precio_pvp)}</span>}
          {vino.ubicacion_estanteria && (
            <span className={styles.cardUbicacion}>
              <LocationMark className={styles.locationIcon} />
              {vino.ubicacion_estanteria}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Ficha de vino enriquecida ─────────────────────────────────────────────────

function WineDetail({ vino, slug, colorAcento, onClose, onMobile, lang = 'es' }) {
  const fichaInicial = useMemo(() => {
    if (!vino?.ficha_ia) return null
    try { return typeof vino.ficha_ia === 'string' ? JSON.parse(vino.ficha_ia) : vino.ficha_ia }
    catch { return null }
  }, [vino?.ficha_ia])

  const [ficha, setFicha] = useState(fichaInicial)
  const [fichaReady, setFichaReady] = useState(!!fichaInicial)
  useEffect(() => {
    // La ficha cacheada es en español — si el idioma es distinto, regeneramos
    if (fichaInicial && lang === 'es') {
      queueMicrotask(() => {
        setFicha(fichaInicial)
        setFichaReady(true)
      })
      return
    }
    queueMicrotask(() => setFichaReady(false))
    fetch(`/api/kiosko/${slug}/ficha/${vino.id}?lang=${lang}`)
      .then(r => r.json())
      .then(d => { if (d.ficha) setFicha(d.ficha) })
      .catch(() => {})
      .finally(() => setFichaReady(true))
  }, [vino?.id, slug, fichaInicial, lang])

  const notasMostrar = ficha?.notas || vino.descripcion || vino.notas_cata

  return (
    <div className={styles.detailOverlay}>
      <div className={styles.detailPanel}>
        {/* Barra superior sticky en móvil */}
        <div className={styles.detailTopBar}>
          <div className={styles.detailHandle} />
          <button className={`${styles.detailClose} ${styles.detailCloseMobile}`} onClick={onClose} type="button" aria-label="Cerrar">✕</button>
        </div>
        {/* Botón de cierre para escritorio */}
        <button className={`${styles.detailClose} ${styles.detailCloseDesktop}`} onClick={onClose} type="button" aria-label="Cerrar">✕</button>
        <div className={styles.detailContent}>
          <div className={styles.detailLeft}>
            <SafeImage
              src={vino.foto_url}
              alt={vino.nombre}
              className={styles.detailPhoto}
              fallback={
                <div className={styles.detailPhotoPlaceholder} style={{ background: `linear-gradient(135deg, ${TIPO_COLORS[vino.tipo] || '#2a2a2a'}44, ${TIPO_COLORS[vino.tipo] || '#2a2a2a'}99)` }}>
                  <BottleMark className={styles.detailPhotoIcon} />
                </div>
              }
            />
            {vino.destacado && <div className={styles.detailDestacado} style={{ color: colorAcento }}>{T[lang].destacado}</div>}
          </div>

          <div className={styles.detailRight}>
            <div className={styles.detailHeader}>
              {vino.tipo && <TipoChip tipo={vino.tipo} size="lg" />}
              {vino.puntuacion && <span className={styles.detailPuntuacion} style={{ color: colorAcento }}>{vino.puntuacion} pts</span>}
            </div>
            <h2 className={styles.detailNombre}>{vino.nombre}</h2>
            {vino.bodega && <p className={styles.detailBodega}>{vino.bodega}</p>}

            <div className={styles.detailMeta}>
              {vino.uva   && <span><strong>{T[lang].uva}</strong> {vino.uva}</span>}
              {vino.anada && <span><strong>{T[lang].anada}</strong> {vino.anada}</span>}
              {vino.region && <span><strong>{T[lang].do}</strong> {vino.region}</span>}
              {vino.pais && vino.pais !== 'España' && <span><strong>{T[lang].paisLabel}</strong> {vino.pais}</span>}
            </div>

            {vino.precio_oferta
              ? <div className={styles.detailPrecioOferta}>
                  <s className={styles.detailPrecioTachado}>{formatPrecio(vino.precio_pvp)}</s>
                  <span className={styles.detailPrecioOfertaValor} style={{ color: colorAcento }}>{formatPrecio(vino.precio_oferta)}</span>
                  <span className={styles.ofertaBadgeLg}>OFERTA</span>
                </div>
              : vino.precio_pvp && <div className={styles.detailPrecio} style={{ color: colorAcento }}>{formatPrecio(vino.precio_pvp)}</div>}

            {vino.ubicacion_estanteria && (
              <div className={styles.detailUbicacion}>
                <span className={styles.detailUbicacionLabel}>{T[lang].encuentraEn}</span>
                <span className={styles.detailUbicacionValor} style={{ color: colorAcento }}>
                  <LocationMark className={styles.locationIcon} />
                  {vino.ubicacion_estanteria}
                </span>
              </div>
            )}

            <button className={styles.mobileCarryBtn} type="button" onClick={() => onMobile?.(vino, 'detail')}>
              <span aria-hidden="true">+</span>
              Añadir al carrito
            </button>

            {/* Notas de cata — skeleton mientras carga */}
            {!fichaReady ? (
              <div className={styles.skelNotas}>
                <div className={styles.skelLine} />
                <div className={styles.skelLine} style={{ width: '82%' }} />
                <div className={styles.skelLine} style={{ width: '68%' }} />
              </div>
            ) : notasMostrar ? (
              <p className={styles.detailNotas + ' ' + styles.detailNotasFadeIn}>{notasMostrar}</p>
            ) : null}

            {/* Datos extra de la ficha IA */}
            {fichaReady && ficha && (
              <div className={styles.fichaExtra}>
                {(ficha.temperatura || ficha.copa) && (
                  <div className={styles.fichaServicio}>
                    {ficha.temperatura && <span>🌡️ {ficha.temperatura}</span>}
                    {ficha.copa && <span>Copa {ficha.copa}</span>}
                  </div>
                )}
                {ficha.maridajes?.length > 0 && (
                  <div className={styles.fichaMaridajes}>
                    <p className={styles.fichaMaridajesLabel}>{T[lang].maridaCon}</p>
                    <div className={styles.fichaMaridajesGrid}>
                      {ficha.maridajes.map((m, i) => (
                        <span key={i} className={styles.fichaMaridajeTag}>
                          <span className={styles.foodPairingTagIcon} aria-hidden="true">{iconoMaridaje(m)}</span>
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {ficha.curiosidad && (
                  <p className={styles.fichaCuriosidad}>💡 {ficha.curiosidad}</p>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Cesta regalo ──────────────────────────────────────────────────────────────

// Detecta la categoría gastronómica de un producto gourmet por su nombre/descripción.
// IMPORTANTE: embutido y queso se detectan solo por nombre — las descripciones suelen decir
// "marida con embutido/queso" sin que el producto lo sea (falso positivo como con Vermell/vermut).
function detectarCatGourmet(nombre = '', descripcion = '') {
  const n = normalizarTexto(nombre)
  const t = normalizarTexto(`${nombre} ${descripcion}`)
  const d = normalizarTexto(descripcion)

  if (/vermut|vermouth|vermell\b|aperitivo\b|sidra\b|cerveza\b|kombucha/.test(n)) return 'bebida'
  if (/jamon|iberic|paleta|lomo\b|chorizo|salchich|fuet|sobrasada|cecina|morcill|embutido|presa\b|butifarra|longaniz|salami|bresaola|copa\s*iberic|panceta|bacon|tocino|fiambre|oreja\b|pulled\s*pork/.test(n)) return 'embutido'
  if (/queso|manchego|brie|camembert|gorgonzola|parmesano|gouda|idiazabal|tetilla|rulo\b|cabra\b|ricota|ricotta|burrata|mozzarell|mozarell|feta\b|halloumi|roquefort|stilton|cheddar|emmental|gruyere|raclette|pecorino|requesón|requesó|cottage|torta\s*del\s*casar|torta\s*extremena|queso\s*fresco|mahon/.test(n)) return 'queso'
  // Snack antes que foie_pate — evita falsos positivos con "trufa" en crackers
  if (/galleta|cookie|cracker|snack|papas?\s*fritas?|\bpapas\b|patata\s*fritas?|chips\b|nachos|batatito/.test(n)) return 'snack'
  if (/conserva|chipiron|calamar|pulpo|ventresca|bonito|caballa|sardin|anchoa|navaja|navajas|almeja|mejillon|berberecho|zamburina|necora|gamba|langostin|bogavante|centollo|atun|bacalao|ahumado|escabeche|txangurro|boquer/.test(t)) return 'conserva'
  if (/foie|pate\b|trufa|almogrote|hummus|tahini|mousse\b|rillet|crema\s+de\b/.test(t)) return 'foie_pate'
  if (/aceituna|olivada|tapenade/.test(n)) return 'aceituna'
  if (/esparrago|alcachofa|pimiento|piquillo|tomate\b|seta|hongo|puerro|banderilla|guindilla/.test(n)) return 'conserva_vegetal'
  if (/chocolate|bombon|turron|mazapan|nougat|polvoron|mantecado/.test(t)) return 'dulce'
  if (/fruto\s*seco|almendra|nuez\b|pistacho|avellana|anacardo/.test(t)) return 'fruto_seco'
  if (/miel|mermelada/.test(t)) return 'miel_mermelada'
  // Aceite: solo si el nombre identifica el producto, no si es un ingrediente en la descripción
  if (/^aceite|virgen\s*extra|\baove\b|aceite\s+de\s+oliva|vinagre|balsamic/.test(n)) return 'aceite_oliva'
  if (/aceite\s+de\s+oliva\s+virgen|\baove\b/.test(d)) return 'aceite_oliva'
  return 'otro'
}

// Afinidad vino→gourmet (invierte la lógica Chartier/WSET): qué gourmet potencia cada tipo de vino
const AFINIDAD_VINO_GOURMET = {
  tinto:       { embutido: 9, queso: 7, conserva_vegetal: 6, fruto_seco: 5, aceite_oliva: 4, aceituna: 4, snack: 3, bebida: 2 },
  blanco:      { conserva: 10, queso: 7, aceite_oliva: 7, conserva_vegetal: 6, aceituna: 5, snack: 4, fruto_seco: 4, bebida: 3 },
  rosado:      { embutido: 8, conserva: 7, queso: 6, aceituna: 5, snack: 5, fruto_seco: 5, aceite_oliva: 4, bebida: 5 },
  espumoso:    { conserva: 10, foie_pate: 9, queso: 8, aceituna: 5, embutido: 6, fruto_seco: 5, snack: 4, aceite_oliva: 4, bebida: 4 },
  generoso:    { embutido: 10, fruto_seco: 9, conserva: 8, aceituna: 8, queso: 7, aceite_oliva: 6, bebida: 4 },
  dulce:       { foie_pate: 10, dulce: 9, queso: 8, fruto_seco: 7, miel_mermelada: 7, aceite_oliva: 3 },
  naranja:     { queso: 9, embutido: 8, conserva_vegetal: 7, aceituna: 6, fruto_seco: 6, aceite_oliva: 6, bebida: 4 },
  sin_alcohol: { snack: 8, fruto_seco: 7, queso: 6, aceituna: 6, conserva: 5, dulce: 5, aceite_oliva: 5, bebida: 3 },
}

// Boost por ocasión — qué tipos de gourmet encajan con el momento
const OCASION_GOURMET_BOOST = {
  enamorar:    { dulce: 4, foie_pate: 4, queso: 2, miel_mermelada: 2 },
  impresionar: { foie_pate: 6, embutido: 5, queso: 4, aceite_oliva: 3 },
  compartir:   { conserva: 3, snack: 4, embutido: 2, fruto_seco: 2, bebida: 4 },
  celebrar:    { foie_pate: 5, conserva: 3, fruto_seco: 2, dulce: 2, bebida: 3, aceite_oliva: 2 },
  capricho:    { foie_pate: 3, dulce: 3, fruto_seco: 2, queso: 2, aceite_oliva: 2 },
}

// Explicación legible de por qué este gourmet acompaña ese vino
const RAZON_MARIDAJE_GOURMET = {
  tinto:       { embutido: 'El tanino del tinto abraza la grasa del ibérico', queso: 'Potencia los quesos curados y semicurados', conserva_vegetal: 'La intensidad del tinto complementa la conserva', fruto_seco: 'Aromas tostados compartidos', aceituna: 'El punto salado de las aceitunas realza los taninos del tinto' },
  blanco:      { conserva: 'La acidez levanta los matices del mar en conserva', queso: 'Corta la untuosidad del queso con frescura', aceite_oliva: 'Acento mineral con el AOVE', conserva_vegetal: 'Frescura que equilibra el sabor concentrado', aceituna: 'Acidez y sal: el aperitivo perfecto junto a un blanco' },
  rosado:      { embutido: 'El rosado equilibra la grasa del embutido', conserva: 'Armoniza con la salinidad de las conservas', queso: 'Frescura frutal que redondea los quesos', fruto_seco: 'Elegancia que realza los frutos secos', aceituna: 'La frescura del rosado armoniza con las aceitunas aliñadas' },
  espumoso:    { conserva: 'La burbuja levanta los sabores yodados del mar', foie_pate: 'La acidez equilibra la untuosidad del foie', queso: 'La burbuja seca limpia la grasa del queso', embutido: 'Contraste clásico: burbuja y sal del ibérico', aceituna: 'La burbuja limpia y eleva el sabor de las aceitunas' },
  generoso:    { embutido: 'La lectura clásica: fino con ibérico', fruto_seco: 'Comparte aromas secos y tostados', conserva: 'La salinidad abraza los sabores del mar', queso: 'Profundidad oxidativa que enriquece el queso', aceituna: 'Fino con aceitunas: el maridaje más clásico de Andalucía' },
  dulce:       { foie_pate: 'El dulzor potencia la riqueza del foie', dulce: 'Dulce con dulce: armonía de postres', queso: 'Contraste clásico con quesos azules', miel_mermelada: 'Matices dulces que se fusionan' },
  naranja:     { queso: 'El tanino del naranja convive con la textura del queso', embutido: 'Profundidad que realza los curados', conserva_vegetal: 'Acidez oxidativa que complementa la conserva', aceituna: 'Los taninos del naranja conviven con la grasa vegetal de la aceituna' },
  sin_alcohol: { snack: 'Aperitivo perfecto para compartir en cualquier momento', fruto_seco: 'Combinación ligera, equilibrada y llena de textura', queso: 'Los quesos suaves ganan protagonismo sin el vino', embutido: 'El ibérico es un placer que no necesita excusas', conserva: 'La salinidad del mar brilla sola, sin vino de por medio', foie_pate: 'La untuosidad del paté, apreciada en todo su esplendor', dulce: 'El punto dulce que convierte cualquier momento en celebración', miel_mermelada: 'Un toque natural y artesano que endulza la ocasión', aceite_oliva: 'El mejor AOVE merece protagonismo propio', conserva_vegetal: 'Sabores de temporada en su estado más puro', aceituna: 'La aceituna: aperitivo eterno, sin necesidad de copa', bebida: 'La mejor compañía para un momento sin alcohol' },
}

const CAT_LABEL_GOURMET = {
  embutido: 'Embutido', queso: 'Queso', conserva: 'Conserva del mar', dulce: 'Dulce artesano',
  foie_pate: 'Foie · Paté', fruto_seco: 'Frutos secos', snack: 'Snack',
  aceite_oliva: 'Aceite oliva', miel_mermelada: 'Miel · Mermelada', conserva_vegetal: 'Conserva vegetal',
  aceituna: 'Aceituna', bebida: 'Vermut · Sidra', otro: 'Gourmet',
}

function razonGourmetItem(cat, tiposVinos) {
  for (const tipo of tiposVinos) {
    const r = RAZON_MARIDAJE_GOURMET[tipo]?.[cat]
    if (r) return r
  }
  return 'Complemento gourmet para la cesta'
}

// Detecta ingredientes con connotaciones afrodisíacas o especialmente románticas
function esAfrodisiaco(nombre = '', descripcion = '') {
  const t = normalizarTexto(`${nombre} ${descripcion}`)
  return /ostra|anchoa|caviar|trufa|foie|chocolate|fresa|frambuesa|granada|higo|datil|miel|vainilla|canela|jengibre|azafran|pistacho|almendra|champan|cava/.test(t)
}

const RAZON_AFRODISIACO = {
  dulce:         'El chocolate es el clásico aliado del romanticismo',
  foie_pate:     'La trufa y el foie despiertan todos los sentidos',
  miel_mermelada:'La miel suaviza el momento y el paladar',
  conserva:      'Las anchoas son símbolo de seducción desde la Antigüedad',
  fruto_seco:    'Los pistachos y almendras, afrodisíacos de siempre',
  queso:         'Un queso suave y cremoso para compartir en intimidad',
  conserva_vegetal: 'El espárrago, afrodisíaco reconocido desde el Renacimiento',
}

const CESTA_OCASIONES = [
  { id: 'enamorar',    emoji: '❤️',  label: 'Para enamorar',    sub: 'pareja, aniversario…',      tipos: ['rosado', 'espumoso', 'dulce', 'naranja'] },
  { id: 'impresionar', emoji: '🎁',  label: 'Para impresionar', sub: 'jefe, médico, favor…',       tipos: ['tinto', 'espumoso', 'generoso'] },
  { id: 'compartir',   emoji: '🥂',  label: 'Para compartir',   sub: 'amigos, familia…',           tipos: ['tinto', 'blanco', 'rosado', 'espumoso'] },
  { id: 'celebrar',    emoji: '🎉',  label: 'Para celebrar',    sub: 'cumpleaños, ascenso…',       tipos: ['espumoso', 'tinto'] },
  { id: 'capricho',    emoji: '🍾',  label: 'Un capricho',      sub: 'para ti o alguien especial', tipos: [] },
]

const CESTA_FRASES = {
  enamorar:    ['Una cesta para decirlo sin palabras', 'El regalo que enamora', 'Para vuestro próximo momento juntos'],
  impresionar: ['Una selección que habla por ti', 'Para ese momento en que el detalle importa', 'El regalo que deja huella'],
  compartir:   ['Para convertir cualquier plan en noche épica', 'Para compartir lo mejor', 'La cesta de los grandes momentos juntos'],
  celebrar:    ['Para brindar por lo que llega', 'Que suenen los corchos', 'La cesta de las grandes ocasiones'],
  capricho:    ['Porque tú también te lo mereces', 'Para el placer sin excusas', 'Tu momento, tu selección'],
}

const CESTA_PRESUPUESTOS = [
  { id: '30',  label: 'Hasta 30€',  max: 30 },
  { id: '50',  label: 'Hasta 50€',  max: 50 },
  { id: '75',  label: 'Hasta 75€',  max: 75 },
  { id: '100', label: 'Hasta 100€', max: 100 },
  { id: 'otro', label: 'Otro…',     max: null },
]

const ADMIN_TO_KIOSKO_CAT = {
  'Embutido': 'embutido', 'Queso': 'queso', 'Conserva mar': 'conserva',
  'Foie·Paté': 'foie_pate', 'Snack': 'snack', 'Aceite·AOVE': 'aceite_oliva',
  'Miel·Mermelada': 'miel_mermelada', 'Dulce': 'dulce', 'Frutos secos': 'fruto_seco',
  'Verdura': 'conserva_vegetal', 'Aceituna·Olivada': 'aceituna',
  'Vermut·Sidra': 'bebida', 'Vinagre·Balsámico': 'aceite_oliva',
  'Condimento': 'aceite_oliva', 'Panadería': 'snack',
}

function generarCestaAlgoritmo(vinos, gourmet, { ocasionId, presupuesto, sinAlcohol, vegano, sinGluten = false, semilla = 0 }) {
  const ocasion = CESTA_OCASIONES.find(o => o.id === ocasionId)
  const tiposOk = ocasion?.tipos ?? []
  const tolerance = 0.001  // solo para imprecisión de punto flotante, no margen comercial

  // Filter wines: must fit within 80% of budget so gourmet always gets room
  let wines = vinos.filter(v => v.activo && Number(v.stock) > 0 && Number(v.precio_pvp) > 0 && Number(v.precio_pvp) <= presupuesto * 0.80)

  if (sinAlcohol) {
    wines = wines.filter(v => v.tipo === 'sin_alcohol')
  }
  // vegano en vinos: no se puede garantizar sin etiqueta explícita — se omite el filtro de vino

  // Score wines using index-based shuffle (id is UUID, not numeric)
  wines = wines.map((v, i) => {
    let score = 0
    if (tiposOk.includes(v.tipo)) score += 10
    if (ocasionId === 'enamorar') {
      const txt = normalizarTexto(`${v.nombre || ''} ${v.descripcion || ''} ${v.notas_cata || ''}`)
      // Nombres o etiquetas con carga romántica
      if (/amor|amour|enamorar|pasion|passion|seducc|tentac|encanto|deseo|noche|luna|beso|venus|eros|roman|intim|secret|magia|magico|misterio|capricho|placer|atardecer|medianoch|flor\b|florido|primaver/.test(txt)) score += 7
      // Notas de cata florales o de fruta roja delicada
      if (/floral|petalo|rosa\b|violeta|lavanda|jazmin|nectar|fresa|frambuesa|cereza|frutos\s*rojos/.test(txt)) score += 4
    }
    if (ocasionId === 'impresionar') {
      const txt = normalizarTexto(`${v.nombre || ''} ${v.notas_cata || ''} ${v.descripcion || ''}`)
      if (/crianza|reserva|gran reserva|barrica|roble/.test(txt)) score += 6
      score += Math.min(Number(v.precio_pvp), presupuesto * 0.5) * 0.15  // dentro del presupuesto, más caro mejor
    }
    if (ocasionId === 'capricho') score += Number(v.precio_pvp)
    score += ((i * 7 + semilla * 13) % 100) / 14
    return { ...v, _score: score, _kind: 'vino' }
  }).sort((a, b) => b._score - a._score)

  // Cap wine slots and budget: reserve at least 40% for gourmet items
  const maxWines = presupuesto <= 30 ? 1 : presupuesto <= 60 ? 2 : 3
  const wineBudgetCap = presupuesto * 0.60

  const basket = []
  let total = 0

  for (const wine of wines) {
    if (basket.filter(b => b._kind === 'vino').length >= maxWines) break
    if (total + Number(wine.precio_pvp) <= wineBudgetCap + tolerance) {
      basket.push(wine)
      total += Number(wine.precio_pvp)
    }
  }

  // Types of wines selected — used to score gourmet by pairing affinity
  const tiposVinos = basket.filter(b => b._kind === 'vino').map(v => v.tipo).filter(Boolean)
  // When no wines (sin_alcohol basket), use 'sin_alcohol' so pairing notes stay varied
  const tiposParaMaridaje = tiposVinos.length > 0 ? tiposVinos : sinAlcohol ? ['sin_alcohol'] : []
  const ocasionBoost = OCASION_GOURMET_BOOST[ocasionId] || {}

  // Score gourmet items: affinity with wine types + occasion boost + aphrodisiac boost + shuffle noise
  const scoredGourmet = [...gourmet]
    .map((g, i) => {
      const cat = (g.cat_gourmet && ADMIN_TO_KIOSKO_CAT[g.cat_gourmet]) || detectarCatGourmet(g.nombre, g.descripcion)
      return { ...g, _cat: cat }
    })
    .filter(g => {
      if (Number(g.precio_pvp) <= 0) return false
      // Filtro sin alcohol: excluir bebidas con alcohol (flag manual o categoría bebida)
      if (sinAlcohol) {
        if (g.con_alcohol === true) return false
        if (g.con_alcohol === null && g._cat === 'bebida') return false
      }
      // Filtro vegano: estricto — solo productos con es_vegano === true confirmado
      if (vegano && g.es_vegano !== true) return false
      // Filtro sin gluten: estricto — solo productos con sin_gluten === true confirmado
      if (sinGluten && g.sin_gluten !== true) return false
      return true
    })
    .map((g, i) => {
      const afinidad = tiposVinos.reduce((sum, tipo) => sum + (AFINIDAD_VINO_GOURMET[tipo]?.[g._cat] || 0), 0)
      const boost = ocasionBoost[g._cat] || 0
      const afroBoost = (ocasionId === 'enamorar' && esAfrodisiaco(g.nombre, g.descripcion)) ? 6 : 0
      const noise = ((i * 7 + semilla * 11) % 100) / 1000
      return { ...g, _afinidad: afinidad + boost + afroBoost + noise, _esAfro: afroBoost > 0 }
    })
    .sort((a, b) => b._afinidad - a._afinidad)

  // Max 1 item per gourmet category to guarantee variety (no basket full of trufa)
  const catsUsadas = new Set()
  for (const item of scoredGourmet) {
    if (catsUsadas.has(item._cat)) continue
    if (total + Number(item.precio_pvp) <= presupuesto + tolerance) {
      const razon = (item._esAfro && RAZON_AFRODISIACO[item._cat])
        ? RAZON_AFRODISIACO[item._cat]
        : razonGourmetItem(item._cat, tiposParaMaridaje)
      basket.push({ ...item, _kind: 'gourmet', _razon: razon })
      total += Number(item.precio_pvp)
      catsUsadas.add(item._cat)
    }
  }

  // Second pass: if budget still has room, allow a second item per cat (no repeating same product)
  const usadosIds = new Set(basket.map(b => b.id))
  for (const item of scoredGourmet) {
    if (usadosIds.has(item.id)) continue
    if (total + Number(item.precio_pvp) <= presupuesto + tolerance) {
      const razon = (item._esAfro && RAZON_AFRODISIACO[item._cat])
        ? RAZON_AFRODISIACO[item._cat]
        : razonGourmetItem(item._cat, tiposParaMaridaje)
      basket.push({ ...item, _kind: 'gourmet', _razon: razon })
      total += Number(item.precio_pvp)
      usadosIds.add(item.id)
    }
  }

  // Dynamic description: what actually ended up in the basket
  const vinosCesta = basket.filter(b => b._kind === 'vino')
  const gourmetCesta = basket.filter(b => b._kind === 'gourmet')
  const catLabels = [...new Set(gourmetCesta.map(g => CAT_LABEL_GOURMET[g._cat] || 'gourmet'))]
  let descripcion = ''
  if (catLabels.length) {
    const tiposUnicos = [...new Set(vinosCesta.map(v => v.tipo).filter(Boolean))]
    const tipoLabel = tiposUnicos.length > 0
      ? tiposUnicos.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' y ')
      : sinAlcohol ? 'Sin alcohol' : 'Selección'
    descripcion = `${tipoLabel} con ${catLabels.slice(0, 2).join(' y ').toLowerCase()}`
    if (vinosCesta.length > 1) descripcion += ` — ${vinosCesta.length} botellas`
  }

  const frase = (CESTA_FRASES[ocasionId] || CESTA_FRASES.capricho)[semilla % 3]
  return { items: basket, total: Math.round(total * 100) / 100, frase, descripcion }
}

function CestaIcon({ name, className }) {
  const cls = className || styles.cestaLinealIcon

  // Corazón — enamorar
  if (name === 'enamorar') return (
    <svg viewBox="0 0 48 48" className={cls} aria-hidden="true">
      <path d="M24 36C16 29 8 22 8 15a8 8 0 0 1 16-2 8 8 0 0 1 16 2c0 7-8 14-16 21Z" />
    </svg>
  )

  // Caja de regalo con lazo — impresionar
  if (name === 'impresionar') return (
    <svg viewBox="0 0 48 48" className={cls} aria-hidden="true">
      <rect x="10" y="22" width="28" height="18" rx="2" />
      <path d="M8 16h32v6H8Z" />
      <path d="M24 16V40" />
      <path d="M24 16c-1-5-7-7-8-3 0 2 3 4 8 3" />
      <path d="M24 16c1-5 7-7 8-3 0 2-3 4-8 3" />
    </svg>
  )

  // Dos personas (compartir/amigos) — compartir
  if (name === 'compartir') return (
    <svg viewBox="0 0 48 48" className={cls} aria-hidden="true">
      <circle cx="17" cy="14" r="5" />
      <path d="M6 38c0-8 5-13 11-13h1" />
      <circle cx="31" cy="14" r="5" />
      <path d="M42 38c0-8-5-13-11-13h-1" />
      <path d="M18 25h12" />
    </svg>
  )

  // Copa de champán con burbujas — celebrar
  if (name === 'celebrar') return (
    <svg viewBox="0 0 48 48" className={cls} aria-hidden="true">
      <path d="M16 10h16L27 28h-6L16 10Z" />
      <path d="M24 28v10M18 38h12" />
      <circle cx="32" cy="12" r="2" />
      <circle cx="35" cy="8" r="1.5" />
      <circle cx="30" cy="7" r="1.5" />
    </svg>
  )

  // Botella de vino — capricho
  if (name === 'capricho') return (
    <svg viewBox="0 0 48 48" className={cls} aria-hidden="true">
      <path d="M20 6h8l2 9H18L20 6Z" />
      <path d="M18 15v3c0 3 3 5 6 5s6-2 6-5v-3" />
      <rect x="18" y="23" width="12" height="19" rx="3" />
    </svg>
  )

  // Tenedor y cuchillo — placeholder gourmet
  if (name === 'gourmet') return (
    <svg viewBox="0 0 48 48" className={cls} aria-hidden="true">
      <path d="M16 8v10M13 10h6M16 18v22" />
      <path d="M32 8v32" />
      <path d="M28 8v10a4 4 0 0 0 8 0V8" />
    </svg>
  )

  // Copa tachada — sin alcohol
  if (name === 'sin-alcohol') return (
    <svg viewBox="0 0 48 48" className={cls} aria-hidden="true">
      <path d="M17 9h14l-5 19v10M16 38h16" />
      <path d="M10 10L38 38" />
    </svg>
  )

  // Hoja — vegano
  if (name === 'vegano') return (
    <svg viewBox="0 0 48 48" className={cls} aria-hidden="true">
      <path d="M36 12C24 10 12 16 12 30c0 4 2 7 5 9" />
      <path d="M36 12C38 24 32 36 18 40" />
      <path d="M18 40L36 12" />
    </svg>
  )

  return null
}

function CestaView({ slug, vinos = [], colorAcento, colorPrimario, onBack, onAddToCart, iconStyle = 'emoji', lang = 'es' }) {
  const [step, setStep]               = useState(0)  // 0=ocasion 1=presupuesto 2=prefs 3=resultado
  const [ocasionId, setOcasionId]     = useState('')
  const [presupuesto, setPresupuesto] = useState(50)
  const [inputPresup, setInputPresup] = useState('')
  const [modoInput, setModoInput]     = useState(false)
  const [sinAlcohol, setSinAlcohol]   = useState(false)
  const [vegano, setVegano]           = useState(false)
  const [sinGluten, setSinGluten]     = useState(false)
  const [gourmet, setGourmet]         = useState([])
  const [cesta, setCesta]             = useState(null)
  const [semilla, setSemilla]         = useState(0)
  const [cargando, setCargando]       = useState(false)

  useEffect(() => {
    fetch(`/api/kiosko/${slug}/gourmet`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => setGourmet(d.items || []))
      .catch(() => {})
  }, [slug])

  const hayVeganos    = useMemo(() => gourmet.some(g => g.es_vegano === true), [gourmet])
  const hayGlutenFree = useMemo(() => gourmet.some(g => g.sin_gluten === true), [gourmet])

  function elegirOcasion(id) { setOcasionId(id); setStep(1) }

  function elegirPresupuesto(preset) {
    if (preset.max === null) { setModoInput(true); return }
    setModoInput(false)
    setPresupuesto(preset.max)
    setStep(2)
  }

  function confirmarPresupuestoLibre() {
    const v = parseFloat(inputPresup)
    if (!v || v < 10) return
    setPresupuesto(v)
    setStep(2)
  }

  function generarCesta(s = semilla) {
    setCargando(true)
    const resultado = generarCestaAlgoritmo(vinos, gourmet, { ocasionId, presupuesto, sinAlcohol, vegano, sinGluten, semilla: s })
    setTimeout(() => { setCesta(resultado); setCargando(false); setStep(3) }, 380)
  }

  function regenerar() {
    const s = semilla + 1
    setSemilla(s)
    setCesta(null)
    setCargando(true)
    const resultado = generarCestaAlgoritmo(vinos, gourmet, { ocasionId, presupuesto, sinAlcohol, vegano, sinGluten, semilla: s })
    setTimeout(() => { setCesta(resultado); setCargando(false) }, 380)
  }

  function reiniciar() {
    setStep(0); setOcasionId(''); setPresupuesto(50); setInputPresup(''); setModoInput(false)
    setSinAlcohol(false); setVegano(false); setSinGluten(false); setCesta(null); setSemilla(0)
  }

  const volvAtras = step === 0 ? onBack : () => {
    if (step === 3) { setCesta(null); setStep(2) }
    else setStep(s => s - 1)
  }

  return (
    <div className={styles.cestaView}>
      <div className={styles.wizardHeader}>
        <button className={styles.backBtn} onClick={volvAtras} type="button">
          ← {step === 0 ? T[lang].inicio : step === 3 ? T[lang].cestaBack3 : T[lang].atras}
        </button>
        <h2 className={styles.wizardTitle}>
          {iconStyle === 'lineal'
            ? <CestaIcon name="impresionar" className={styles.cestaLinealIconTitle} />
            : '🎁 '}
          {T[lang].cestaTitle}
        </h2>
      </div>

      {/* Paso 0 — Ocasión */}
      {step === 0 && (
        <div className={styles.wizardStep}>
          <p className={styles.wizardQuestion}>{T[lang].cestaQ0}</p>
          <div className={styles.cestaOcasiones}>
            {CESTA_OCASIONES.map(o => (
              <button key={o.id} type="button" className={styles.cestaOcasionBtn}
                style={{ '--acento': colorAcento }} onClick={() => elegirOcasion(o.id)}>
                <span className={styles.cestaOcasionEmoji}>
                  {iconStyle === 'lineal'
                    ? <CestaIcon name={o.id} />
                    : o.emoji}
                </span>
                <span className={styles.cestaOcasionLabel}>{T[lang].cestaOcasiones?.[o.id]?.label || o.label}</span>
                {o.sub && <span className={styles.cestaOcasionSub}>{T[lang].cestaOcasiones?.[o.id]?.sub || o.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Paso 1 — Presupuesto */}
      {step === 1 && (
        <div className={styles.wizardStep}>
          <p className={styles.wizardQuestion}>{T[lang].cestaQ1}</p>
          {!modoInput ? (
            <div className={styles.cestaPresupuestos}>
              {CESTA_PRESUPUESTOS.map(p => (
                <button key={p.id} type="button" className={styles.cestaPresupuestoBtn}
                  style={{ '--acento': colorAcento }} onClick={() => elegirPresupuesto(p)}>
                  {T[lang].cestaPresups?.[p.id] || p.label}
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.cestaInputWrap}>
              <p className={styles.cestaInputLabel}>{T[lang].cestaInputLabel}</p>
              <div className={styles.cestaInputRow}>
                <input
                  type="number"
                  className={styles.cestaInputNum}
                  placeholder={T[lang].cestaInputPh}
                  value={inputPresup}
                  min="10" max="500"
                  onChange={e => setInputPresup(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmarPresupuestoLibre()}
                  autoFocus
                  style={{ borderColor: colorAcento }}
                />
                <span className={styles.cestaInputEuro}>€</span>
              </div>
              <button type="button" className={styles.cestaGenerarBtn}
                style={{ background: colorAcento }}
                onClick={confirmarPresupuestoLibre}
                disabled={!inputPresup || parseFloat(inputPresup) < 10}>
                {T[lang].cestaContinuar}
              </button>
              <button type="button" className={styles.cestaVolver}
                onClick={() => setModoInput(false)}>
                {T[lang].cestaVerOpciones}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Paso 2 — Preferencias */}
      {step === 2 && (
        <div className={styles.wizardStep}>
          <p className={styles.wizardQuestion}>{T[lang].cestaQ2}</p>
          <div className={styles.cestaPrefs}>
            <label className={styles.cestaPrefToggle}>
              <input type="checkbox" checked={sinAlcohol} onChange={e => setSinAlcohol(e.target.checked)} />
              <span className={styles.cestaPrefLabel}>
                {iconStyle === 'lineal' ? <CestaIcon name="sin-alcohol" className={styles.cestaLinealIconPref} /> : '🫗 '}
                {T[lang].cestaSinAlcohol}
              </span>
            </label>
            {hayVeganos && (
              <label className={styles.cestaPrefToggle}>
                <input type="checkbox" checked={vegano} onChange={e => setVegano(e.target.checked)} />
                <span className={styles.cestaPrefLabel}>
                  {iconStyle === 'lineal' ? <CestaIcon name="vegano" className={styles.cestaLinealIconPref} /> : '🌱 '}
                  {T[lang].cestaVegano}
                </span>
              </label>
            )}
            {hayGlutenFree && (
              <label className={styles.cestaPrefToggle}>
                <input type="checkbox" checked={sinGluten} onChange={e => setSinGluten(e.target.checked)} />
                <span className={styles.cestaPrefLabel}>
                  {iconStyle !== 'lineal' && '🌾 '}
                  {T[lang].cestaSinGluten}
                </span>
              </label>
            )}
          </div>
          <button type="button" className={styles.cestaGenerarBtn}
            style={{ background: colorAcento }}
            onClick={() => generarCesta()}>
            {T[lang].cestaCrear}
          </button>
        </div>
      )}

      {/* Cargando */}
      {cargando && (
        <div className={styles.cestaLoading}>
          <div className={styles.cestaSpinner} style={{ borderTopColor: colorAcento }} />
          <p>{T[lang].cestaArmando}</p>
        </div>
      )}

      {/* Paso 3 — Resultado */}
      {step === 3 && cesta && !cargando && (
        <div className={styles.cestaResultado}>
          <div className={styles.cestaResultHeader}>
            <p className={styles.cestaFrase} style={{ color: colorAcento }}>
              {(T[lang].cestaFrases?.[ocasionId] || T[lang].cestaFrases?.capricho || [])[semilla % 3] || cesta.frase}
            </p>
            {cesta.descripcion && (
              <p className={styles.cestaDescripcion}>{cesta.descripcion}</p>
            )}
            <p className={styles.cestaResumen}>
              {T[lang].cestaProductos(cesta.items.length)}{' '}
              <strong style={{ color: colorAcento }}>{cesta.total.toFixed(2)} €</strong>
              {' '}{T[lang].cestaPresupuesto(presupuesto)}
            </p>
          </div>

          {cesta.items.length === 0 ? (
            <div className={styles.cestaVacia}>
              <p>{T[lang].cestaVacia}</p>
              <button type="button" className={styles.cestaVolver} onClick={() => setStep(1)}>
                {T[lang].cestaCambiarPresup}
              </button>
            </div>
          ) : (
            <>
              <div className={styles.cestaItems}>
                {cesta.items.map((item, i) => (
                  <div key={item.id ?? i} className={styles.cestaItem}>
                    {item.foto_url ? (
                      <img src={item.foto_url} alt={item.nombre} className={styles.cestaItemFoto} />
                    ) : (
                      <div className={styles.cestaItemFotoPlaceholder}>
                        {item._kind === 'vino'
                          ? (iconStyle === 'lineal' ? <BottleMark className={styles.cestaPlaceholderIcon} /> : '🍷')
                          : (iconStyle === 'lineal' ? <CestaIcon name="gourmet" className={styles.cestaPlaceholderIcon} /> : '🧺')}
                      </div>
                    )}
                    <div className={styles.cestaItemInfo}>
                      <p className={styles.cestaItemNombre}>{item.nombre}</p>
                      {item.bodega && <p className={styles.cestaItemMeta}>{item.bodega}</p>}
                      {item._kind === 'vino' && item.tipo && (
                        <span className={styles.cestaItemTipo}>{item.tipo.charAt(0).toUpperCase() + item.tipo.slice(1)}</span>
                      )}
                      {item._kind === 'gourmet' && item._cat && (
                        <span className={styles.cestaItemCat}>{CAT_LABEL_GOURMET[item._cat] || 'Gourmet'}</span>
                      )}
                      {item._kind === 'gourmet' && item._razon && (
                        <span className={styles.cestaItemRazon}>{item._razon}</span>
                      )}
                    </div>
                    <p className={styles.cestaItemPrecio} style={{ color: colorAcento }}>
                      {Number(item.precio_pvp).toFixed(2)} €
                    </p>
                  </div>
                ))}
              </div>

              <div className={styles.cestaAcciones}>
                <button type="button" className={styles.cestaRegenerarBtn}
                  style={{ borderColor: colorAcento, color: colorAcento }}
                  onClick={regenerar}>
                  {T[lang].cestaOtraCombi}
                </button>
                <button type="button" className={styles.cestaGenerarBtn}
                  style={{ background: colorAcento }}
                  onClick={reiniciar}>
                  {iconStyle !== 'lineal' && '🎁 '}{T[lang].cestaNueva}
                </button>
              </div>
              {onAddToCart && (
                <button type="button" className={styles.cestaComprarBtn}
                  style={{ background: colorAcento }}
                  onClick={() => onAddToCart(cesta.items, 'cesta', cesta.frase)}>
                  {iconStyle !== 'lineal' && '🛒 '}
                  {lang === 'en' ? 'Add to cart' : lang === 'fr' ? 'Ajouter au panier' : 'Añadir al carrito'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Wizard "Ayúdame a elegir" ─────────────────────────────────────────────────

function WizardView({ slug, tienda, colorAcento, colorPrimario, onWineSelect, onMobile, onBack, vinos = [], lang = 'es', iconStyle = 'emoji' }) {
  const [step, setStep]       = useState(0)
  const [wizard, setWizard]   = useState({ ocasion: '', estilo: '', presupuesto: '', soloRegion: true })
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError]     = useState('')
  const [mostrarRango, setMostrarRango] = useState(false)

  const regionLabel = useMemo(() => dominantCCAA(vinos), [vinos])

  const wizardPrecios = useMemo(() => {
    const ps = vinos.map(v => v.precio_pvp).filter(Boolean)
    return ps.length ? { min: Math.floor(Math.min(...ps)), max: Math.ceil(Math.max(...ps)) } : { min: 5, max: 200 }
  }, [vinos])
  const [wPrecioMin, setWPrecioMin] = useState(wizardPrecios.min)
  const [wPrecioMax, setWPrecioMax] = useState(wizardPrecios.max)

  function selOcasion(id) { setWizard(w => ({ ...w, ocasion: id })); setStep(1) }
  function selPresupuesto(id) {
    const next = { ...wizard, presupuesto: id }
    if (id === 'custom') {
      next.precioMin = wPrecioMin
      next.precioMax = wPrecioMax
    }
    setWizard(next)
    consultar(next)
  }
  function selEstilo(id) {
    const next = { ...wizard, estilo: id }
    setWizard(next)
    setStep(2)
  }

  async function consultar(w = wizard) {
    const q = buildWizardQuery(w, regionLabel)
    if (!q) return
    setCargando(true)
    setError('')
    setResultado(null)
    setStep(99)
    try {
      const res = await fetch(`/api/kiosko/${slug}/maridaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consulta: q, mode: 'wizard', lang, ...(w.soloRegion && regionLabel ? { regionCCAA: regionLabel } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error en la consulta')
      setResultado(data)
    } catch (err) {
      setError(err.message)
      setStep(2)
    } finally {
      setCargando(false)
    }
  }

  function reset() { setStep(0); setWizard({ ocasion: '', estilo: '', presupuesto: '', soloRegion: true }); setResultado(null); setError('') }

  return (
    <div className={styles.wizardView}>
      <div className={styles.wizardHeader}>
        <button className={styles.backBtn} onClick={resultado ? reset : (step === 0 ? onBack : () => setStep(s => s - 1))} type="button">
          ← {resultado ? T[lang].nuevaBusqueda : step === 0 ? T[lang].inicio : T[lang].atras}
        </button>
        <h2 className={styles.wizardTitle}>{T[lang].wizardTitle}</h2>
      </div>

      {/* Paso 0 — Ocasión */}
      {step === 0 && (
        <div className={styles.wizardStep}>
          <p className={styles.wizardQuestion}>{T[lang].q0}</p>
          <div className={styles.wizardOcasiones}>
            {OCASIONES_IDS.map(o => (
              <button key={o.id} className={styles.wizardOcasionBtn} onClick={() => selOcasion(o.id)} type="button"
                style={{ '--acento': colorAcento }}>
                {iconStyle === 'lineal'
                  ? <WizardOcasionIcon id={o.id} />
                  : <span className={styles.wizardOcasionIcon}>{o.emoji}</span>
                }
                <span className={styles.wizardOcasionLabel}>{T[lang].ocasionLabels[o.id]}</span>
              </button>
            ))}
          </div>
          {regionLabel && (
            <label className={styles.wizardCanariasToggle}>
              <input type="checkbox" checked={wizard.soloRegion}
                onChange={e => setWizard(w => ({ ...w, soloRegion: e.target.checked }))} />
              <span>📍 Solo vinos de {regionLabel}</span>
            </label>
          )}
        </div>
      )}

      {/* Paso 1 — Estilo */}
      {step === 1 && (
        <div className={styles.wizardStep}>
          <p className={styles.wizardQuestion}>{T[lang].q1}</p>
          <div className={styles.wizardEstilos}>
            {ESTILOS_IDS.map(e => (
              <button key={e.id} className={styles.wizardEstiloBtn} onClick={() => selEstilo(e.id)} type="button"
                style={{ '--acento': colorAcento }}>
                {iconStyle === 'lineal'
                  ? stripEmoji(T[lang].estiloLabels[e.id])
                  : T[lang].estiloLabels[e.id]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Paso 2 — Presupuesto */}
      {step === 2 && (
        <div className={styles.wizardStep}>
          <p className={styles.wizardQuestion}>{T[lang].q2}</p>
          <div className={styles.wizardPresupuestos}>
            {PRESUPUESTOS_IDS.map(p => (
              <button key={p.id} className={styles.wizardPresupuestoBtn} onClick={() => selPresupuesto(p.id)} type="button"
                style={{ '--acento': colorAcento }}>
                {p.label ?? T[lang].sinLimite}
              </button>
            ))}
            <button className={`${styles.wizardPresupuestoBtn} ${styles.wizardPresupuestoBtnCustom}`}
              onClick={() => setMostrarRango(true)} type="button"
              style={{ '--acento': colorAcento }}>
              {iconStyle === 'lineal' ? stripEmoji(T[lang].miRango) : T[lang].miRango}
            </button>
          </div>

          {mostrarRango && (
            <div className={styles.rangoOverlay} onClick={e => { if (e.target === e.currentTarget) setMostrarRango(false) }}>
              <div className={styles.rangoSheet}>
                <p className={styles.rangoSheetTitle}>{T[lang].elegirPresupuesto}</p>
                <PriceRangeSlider
                  minAll={wizardPrecios.min} maxAll={wizardPrecios.max}
                  valueMin={wPrecioMin} valueMax={wPrecioMax}
                  onChangeMin={setWPrecioMin} onChangeMax={setWPrecioMax}
                  acento={colorAcento}
                />
                <p className={styles.rangoSheetDisplay} style={{ color: colorAcento }}>
                  {wPrecioMin} € — {wPrecioMax} €
                </p>
                <button className={styles.rangoSheetBtn}
                  style={{ background: colorAcento, color: colorPrimario }}
                  onClick={() => { setMostrarRango(false); selPresupuesto('custom') }}
                  type="button">
                  {iconStyle === 'lineal' ? stripEmoji(T[lang].buscarRango) : T[lang].buscarRango}
                </button>
                <button className={styles.rangoSheetCancel} onClick={() => setMostrarRango(false)} type="button">
                  {T[lang].cancelar}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cargando */}
      {step === 99 && cargando && (
        <div className={styles.wizardLoading}>
          <div className={styles.wizardSpinner} style={{ borderTopColor: colorAcento }} />
          <p style={{ color: colorAcento }}>{iconStyle === 'lineal' ? stripEmoji(T[lang].buscandoVino) : T[lang].buscandoVino}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={styles.pairingError}>
          <p>{error}</p>
          <button onClick={reset} type="button">{T[lang].intentarDeNuevo}</button>
        </div>
      )}

      {/* Resultados */}
      {resultado && (
        <div className={styles.pairingResultados}>
          {resultado.intro && <p className={styles.pairingIntro}>{resultado.intro}</p>}
          <div className={styles.pairingWines}>
            {resultado.recomendaciones.map(vino => (
              <article key={vino.id} className={styles.pairingWineCard}>
                <div className={styles.pairingWineLeft}>
                  <SafeImage
                    src={vino.foto_url}
                    alt={vino.nombre}
                    className={styles.pairingWinePhoto}
                    fallback={<div className={styles.pairingWinePhotoPlaceholder} style={{ background: `${TIPO_COLORS[vino.tipo] || '#333'}66` }}><BottleMark className={styles.pairingWineIcon} /></div>}
                  />
                </div>
                <div className={styles.pairingWineInfo}>
                  <div className={styles.pairingWineTop}>
                    {vino.tipo && <TipoChip tipo={vino.tipo} />}
                    {vino.precio_pvp && <span className={styles.pairingWinePrecio}>{formatPrecio(vino.precio_pvp)}</span>}
                  </div>
                  <p className={styles.pairingWineNombre}>{vino.nombre}</p>
                  {vino.bodega && <p className={styles.pairingWineBodega}>{vino.bodega}</p>}
                  <p className={styles.pairingWineRazon}>{iconStyle === 'lineal' ? stripEmoji(vino.razon) : vino.razon}</p>
                  {vino.ubicacion_estanteria && (
                    <p className={styles.pairingWineUbicacion}>
                      <LocationMark className={styles.locationIcon} />
                      {vino.ubicacion_estanteria}
                    </p>
                  )}
                  <div className={styles.pairingWineActions}>
                    <button className={styles.pairingWineOpenBtn} type="button" onClick={() => onWineSelect(vino)}>
                      Ver ficha
                    </button>
                    <button className={styles.pairingWineMobileBtn} type="button" onClick={() => onMobile?.(vino, 'wizard', vino.razon)}>
                      Añadir al carrito
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <button className={styles.pairingReiniciarBtn} onClick={reset} type="button">Nueva búsqueda</button>
        </div>
      )}
      {tienda?.nombre && (
        <div className={styles.viewBrandBar}>
          {tienda.logo_url
            ? <img src={tienda.logo_url} alt={tienda.nombre} className={styles.viewBrandLogo} />
            : <div className={styles.viewBrandLogoFallback}>{tienda.nombre[0]}</div>
          }
          <span className={styles.viewBrandCredit}>× @cataconjuanjo</span>
        </div>
      )}
    </div>
  )
}

// ── Modo Mostrador ─────────────────────────────────────────────────────────────

function ShowcaseView({ vinos, tienda, colorAcento, colorPrimario, onExit }) {
  const [idx, setIdx] = useState(0)
  const [fade, setFade] = useState(true)
  const [hora, setHora] = useState('')

  const lista = useMemo(() => {
    const dest = vinos.filter(v => v.destacado && v.foto_url)
    return dest.length >= 3 ? dest : vinos.filter(v => v.foto_url).slice(0, 12)
  }, [vinos])

  useEffect(() => {
    function tick() { setHora(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })) }
    tick()
    const t = setInterval(tick, 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!lista.length) return
    const t = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setIdx(i => (i + 1) % lista.length)
        setFade(true)
      }, 400)
    }, SHOWCASE_INTERVAL_MS)
    return () => clearInterval(t)
  }, [lista.length])

  const vino = lista[idx]
  if (!vino) return null

  return (
    <div className={styles.showcaseView} onClick={onExit} style={{ '--acento': colorAcento, '--primario': colorPrimario }}>
      {/* Fondo con foto */}
      <div className={`${styles.showcaseBg} ${fade ? styles.showcaseFadeIn : styles.showcaseFadeOut}`}>
        <SafeImage
          src={vino.foto_url}
          alt={vino.nombre}
          className={styles.showcaseBgImg}
          fallback={
            <div className={styles.showcaseBgFallback} style={{ background: `radial-gradient(circle at 50% 30%, ${TIPO_COLORS[vino.tipo] || '#333'}55, transparent 42%), linear-gradient(135deg, #11111a, #050506)` }}>
              <BottleMark className={styles.showcaseBgIcon} />
            </div>
          }
        />
        <div className={styles.showcaseBgOverlay} />
      </div>

      {/* Cabecera */}
      <div className={styles.showcaseTop}>
        <p className={styles.showcaseTienda}>{tienda?.nombre}</p>
        {hora && <p className={styles.showcaseHora}>{hora}</p>}
      </div>

      {/* Info del vino */}
      <div className={`${styles.showcaseInfo} ${fade ? styles.showcaseFadeIn : styles.showcaseFadeOut}`}>
        {vino.destacado && <p className={styles.showcaseDestacado} style={{ color: colorAcento }}>★ Destacado</p>}
        {vino.tipo && (
          <span className={styles.showcaseTipo} style={{ background: TIPO_COLORS[vino.tipo] || '#666' }}>
            {TIPO_LABELS[vino.tipo]}
          </span>
        )}
        <h2 className={styles.showcaseNombre}>{vino.nombre}</h2>
        {vino.bodega && <p className={styles.showcaseBodega}>{vino.bodega}</p>}
        <div className={styles.showcaseMeta}>
          {vino.uva   && <span>{vino.uva}</span>}
          {vino.anada && <span>{vino.anada}</span>}
          {vino.region && <span>{vino.region}</span>}
        </div>
        {vino.precio_pvp && (
          <p className={styles.showcasePrecio} style={{ color: colorAcento }}>{formatPrecio(vino.precio_pvp)}</p>
        )}
        {vino.ubicacion_estanteria && (
          <p className={styles.showcaseUbicacion}>
            <LocationMark className={styles.showcaseLocationIcon} />
            Estantería {vino.ubicacion_estanteria}
          </p>
        )}
      </div>

      {/* Pie */}
      <div className={styles.showcaseBottom}>
        <div className={styles.showcaseDots}>
          {lista.map((_, i) => (
            <span key={i} className={`${styles.showcaseDot} ${i === idx ? styles.showcaseDotActive : ''}`}
              style={i === idx ? { background: colorAcento } : {}} />
          ))}
        </div>
        <p className={styles.showcaseTap}>Toca la pantalla para explorar</p>
      </div>
    </div>
  )
}

// ── Vista Pairing ─────────────────────────────────────────────────────────────

function PairingView({ tienda, slug, colorAcento, vinos = [], gourmet = [], onWineSelect, onMobile, onBack, lang = 'es', iconStyle = 'emoji' }) {
  const [consulta, setConsulta] = useState('')
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const textareaRef = useRef(null)

  const sugerencias = useMemo(() => {
    if (!gourmet.length) return SUGERENCIAS_MARIDAJE_FALLBACK
    const sorted = [...gourmet].sort((a, b) => (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0))
    return sorted.slice(0, 9).map(g => g.nombre)
  }, [gourmet])

  // No autoFocus: opening keyboard immediately would exit fullscreen on some devices

  async function consultar(texto) {
    const q = texto || consulta
    if (!q.trim()) return
    setCargando(true); setError(''); setResultado(null)
    try {
      const res = await fetch(`/api/kiosko/${slug}/maridaje`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consulta: q, lang }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error en la consulta')
      setResultado(data)
    } catch (err) { setError(err.message) }
    finally { setCargando(false) }
  }

  return (
    <div className={styles.pairingView}>
      <div className={styles.pairingHeader}>
        <button className={styles.backBtn} onClick={onBack} type="button">{T[lang].volver}</button>
        <h2 className={styles.pairingTitle}>{T[lang].pairingTitle}</h2>
        <p className={styles.pairingSubtitle}>{T[lang].pairingSub}</p>
      </div>
      <div className={styles.pairingInputArea}>
        <textarea ref={textareaRef} className={styles.pairingTextarea} value={consulta}
          onChange={e => setConsulta(e.target.value)}
          placeholder={T[lang].pairingPlaceholder}
          rows={3} maxLength={400}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); consultar() } }}
        />
        <button className={styles.pairingSubmitBtn} style={{ background: colorAcento }}
          onClick={() => consultar()} disabled={cargando || !consulta.trim()} type="button">
          {iconStyle === 'lineal'
            ? stripEmoji(cargando ? T[lang].buscando : T[lang].buscar)
            : (cargando ? T[lang].buscando : T[lang].buscar)}
        </button>
      </div>
      {!resultado && !cargando && !error && (
        <div className={styles.sugerencias}>
          <p className={styles.sugerenciasLabel}>{T[lang].ideasRapidas}</p>
          <div className={styles.sugerenciasGrid}>
            {sugerencias.map(s => (
              <button key={s} className={styles.sugerenciaBtn} onClick={() => { setConsulta(s); consultar(s) }} type="button">{s}</button>
            ))}
          </div>
        </div>
      )}
      {error && <div className={styles.pairingError}><p>{error}</p><button onClick={() => setError('')} type="button">{T[lang].intentarDeNuevo}</button></div>}
      {resultado && (
        <div className={styles.pairingResultados}>
          {resultado.intro && <p className={styles.pairingIntro}>{resultado.intro}</p>}
          <div className={styles.pairingWines}>
            {resultado.recomendaciones.map(vino => (
              <article key={vino.id} className={styles.pairingWineCard}>
                <div className={styles.pairingWineLeft}>
                  <SafeImage
                    src={vino.foto_url}
                    alt={vino.nombre}
                    className={styles.pairingWinePhoto}
                    fallback={<div className={styles.pairingWinePhotoPlaceholder} style={{ background: `${TIPO_COLORS[vino.tipo] || '#333'}66` }}><BottleMark className={styles.pairingWineIcon} /></div>}
                  />
                </div>
                <div className={styles.pairingWineInfo}>
                  <div className={styles.pairingWineTop}>
                    {vino.tipo && <TipoChip tipo={vino.tipo} />}
                    {vino.precio_pvp && <span className={styles.pairingWinePrecio}>{formatPrecio(vino.precio_pvp)}</span>}
                  </div>
                  <p className={styles.pairingWineNombre}>{vino.nombre}</p>
                  {vino.bodega && <p className={styles.pairingWineBodega}>{vino.bodega}</p>}
                  <p className={styles.pairingWineRazon}>{iconStyle === 'lineal' ? stripEmoji(vino.razon) : vino.razon}</p>
                  {vino.ubicacion_estanteria && (
                    <p className={styles.pairingWineUbicacion}>
                      <LocationMark className={styles.locationIcon} />
                      {vino.ubicacion_estanteria}
                    </p>
                  )}
                  <div className={styles.pairingWineActions}>
                    <button className={styles.pairingWineOpenBtn} type="button" onClick={() => onWineSelect(vino)}>
                      Ver ficha
                    </button>
                    <button className={styles.pairingWineMobileBtn} type="button" onClick={() => onMobile?.(vino, 'pairing', vino.razon)}>
                      Añadir al carrito
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <button className={styles.pairingReiniciarBtn} onClick={() => { setResultado(null); setConsulta('') }} type="button">Nueva búsqueda</button>
        </div>
      )}
      {tienda?.nombre && (
        <div className={styles.viewBrandBar}>
          {tienda.logo_url
            ? <img src={tienda.logo_url} alt={tienda.nombre} className={styles.viewBrandLogo} />
            : <div className={styles.viewBrandLogoFallback}>{tienda.nombre[0]}</div>
          }
          <span className={styles.viewBrandCredit}>× @cataconjuanjo</span>
        </div>
      )}
    </div>
  )
}

// ── Vista Browse ──────────────────────────────────────────────────────────────

function BrowseView({ vinos, colorAcento, onWineSelect, onBack, lang = 'es' }) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroPais, setFiltroPais] = useState('')
  const [filtroRegion, setFiltroRegion] = useState('')

  const tipos    = useMemo(() => TIPO_ORDER.filter(t => vinos.some(v => v.tipo === t)), [vinos])
  const paises   = useMemo(() => extraerValoresUnicos(vinos, 'pais'), [vinos])
  const regiones = useMemo(() => extraerValoresUnicos(vinos, 'region'), [vinos])

  const preciosAll = useMemo(() => {
    const ps = vinos.map(v => v.precio_pvp).filter(Boolean)
    if (!ps.length) return null
    return { min: Math.floor(Math.min(...ps)), max: Math.ceil(Math.max(...ps)) }
  }, [vinos])

  const [precioMin, setPrecioMin] = useState(0)
  const [precioMax, setPrecioMax] = useState(9999)
  useEffect(() => {
    if (!preciosAll) return
    queueMicrotask(() => {
      setPrecioMin(preciosAll.min)
      setPrecioMax(preciosAll.max)
    })
  }, [preciosAll])

  const sliderActivo = preciosAll && (precioMin > preciosAll.min || precioMax < preciosAll.max)

  const vinosFiltrados = useMemo(() => {
    const qNorm = normalizarTexto(busqueda)
    return vinos.filter(v => {
      if (filtroTipo !== 'todos' && v.tipo !== filtroTipo) return false
      if (filtroPais && v.pais !== filtroPais) return false
      if (filtroRegion && v.region !== filtroRegion) return false
      if (preciosAll && v.precio_pvp != null) {
        if (v.precio_pvp < precioMin || v.precio_pvp > precioMax) return false
      }
      if (qNorm) {
        const txt = normalizarTexto([v.nombre, v.bodega, v.uva, v.region].filter(Boolean).join(' '))
        if (!txt.includes(qNorm)) return false
      }
      return true
    })
  }, [vinos, filtroTipo, busqueda, filtroPais, filtroRegion, precioMin, precioMax, preciosAll])

  function limpiar() {
    setBusqueda(''); setFiltroTipo('todos'); setFiltroPais(''); setFiltroRegion('')
    if (preciosAll) { setPrecioMin(preciosAll.min); setPrecioMax(preciosAll.max) }
  }
  const filtroActivo = filtroTipo !== 'todos' || busqueda || filtroPais || filtroRegion || sliderActivo

  return (
    <div className={styles.browseView}>
      <div className={styles.browseTopBar}>
        <div className={styles.browseTopRow}>
          <button className={styles.backBtn} onClick={onBack} type="button">{T[lang].browseInicio}</button>
          <div className={styles.searchWrap}>
            <input className={styles.searchInput} type="search" value={busqueda}
              onChange={e => setBusqueda(e.target.value)} placeholder={T[lang].buscarPlaceholder} />
            {busqueda && <button className={styles.searchClear} onClick={() => setBusqueda('')} type="button">✕</button>}
          </div>
          <span className={styles.resultCount}>{T[lang].vinos(vinosFiltrados.length)}</span>
          {filtroActivo && <button className={styles.clearBtn} onClick={limpiar} type="button">{T[lang].limpiar}</button>}
        </div>
        <div className={styles.tipoBar}>
          <button className={`${styles.tipoChipBtn} ${filtroTipo === 'todos' ? styles.tipoChipBtnActive : ''}`}
            onClick={() => setFiltroTipo('todos')}
            style={filtroTipo === 'todos' ? { background: colorAcento, borderColor: colorAcento, color: '#fff' } : {}}
            type="button">{T[lang].todos}</button>
          {tipos.map(tipo => (
            <button key={tipo} className={`${styles.tipoChipBtn} ${filtroTipo === tipo ? styles.tipoChipBtnActive : ''}`}
              onClick={() => setFiltroTipo(tipo === filtroTipo ? 'todos' : tipo)}
              style={filtroTipo === tipo ? { background: TIPO_COLORS[tipo], borderColor: TIPO_COLORS[tipo], color: '#fff' } : {}}
              type="button">{T[lang].tipoLabels[tipo] || tipo}</button>
          ))}
          {paises.length > 1 && (
            <select className={styles.paisSelect} value={filtroPais} onChange={e => setFiltroPais(e.target.value)}>
              <option value="">{T[lang].pais}</option>
              {paises.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {regiones.length > 1 && (
            <select className={styles.doSelect} value={filtroRegion} onChange={e => setFiltroRegion(e.target.value)}>
              <option value="">{T[lang].region}</option>
              {regiones.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </div>

        {preciosAll && preciosAll.min < preciosAll.max && (
          <div className={styles.priceRow}>
            <span className={styles.priceRowLabel}>{T[lang].precio}</span>
            <PriceRangeSlider
              minAll={preciosAll.min} maxAll={preciosAll.max}
              valueMin={precioMin} valueMax={precioMax}
              onChangeMin={setPrecioMin} onChangeMax={setPrecioMax}
              acento={colorAcento}
            />
          </div>
        )}
      </div>
      <div className={styles.browseResults}>
        {vinosFiltrados.length === 0
          ? <div className={styles.noResults}><p>{T[lang].sinResultados}</p><button onClick={limpiar} style={{ color: colorAcento }} type="button">{T[lang].limpiarFiltros}</button></div>
          : <div className={styles.wineGrid}>{vinosFiltrados.map(v => <WineCard key={v.id} vino={v} onClick={onWineSelect} />)}</div>
        }
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function KioskoPage() {
  const { slug }       = useParams()
  const searchParams   = useSearchParams()
  const modoMostrador  = searchParams.get('mostrador') === '1'

  const [tienda, setTienda]         = useState(null)
  const [vinos, setVinos]           = useState([])
  const [gourmet, setGourmet]       = useState([])
  const [cargando, setCargando]     = useState(true)
  const [error, setError]           = useState('')
  const [view, setView]             = useState(modoMostrador ? VIEWS.SHOWCASE : VIEWS.WELCOME)
  const [vinoDetalle, setVinoDetalle] = useState(null)
  const [mobileVinos, setMobileVinos] = useState([])
  const [mobileSelection, setMobileSelection] = useState(null)
  const [cartNotice, setCartNotice] = useState('')
  const [kioskOrder, setKioskOrder] = useState(null)
  const [longPressTimer, setLongPressTimer] = useState(null)
  const [lang, setLang]             = useState('es')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const idleTimer = useRef(null)
  const cartNoticeTimer = useRef(null)
  const stripRef = useRef(null)

  useEffect(() => {
    if (!slug) return
    async function cargar(silencioso = false) {
      if (!silencioso) { setCargando(true); setError('') }
      try {
        const [r1, r2] = await Promise.all([
          fetch(`/api/kiosko/${slug}/vinos`),
          fetch(`/api/kiosko/${slug}/meta`),
        ])
        const d1 = await r1.json()
        if (!r1.ok) throw new Error(d1.error || 'Tienda no encontrada')
        setVinos(d1.vinos || [])
        if (r2.ok) { const d2 = await r2.json(); setTienda(d2.tienda) }
      } catch (err) { if (!silencioso) setError(err.message) }
      finally { if (!silencioso) setCargando(false) }
    }
    cargar()
    const intervalo = setInterval(() => cargar(true), 5 * 60 * 1000)
    return () => clearInterval(intervalo)
  }, [slug])

  useEffect(() => {
    if (!slug) return
    fetch(`/api/kiosko/${slug}/gourmet`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => setGourmet(d.items || []))
      .catch(() => {})
  }, [slug])

  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (view !== VIEWS.WELCOME && view !== VIEWS.SHOWCASE) {
      idleTimer.current = setTimeout(() => {
        setView(VIEWS.WELCOME)
        setVinoDetalle(null)
        setMobileVinos([])
        setMobileSelection(null)
        setCartNotice('')
      }, IDLE_TIMEOUT_MS)
    }
  }, [view])

  useEffect(() => { resetIdle(); return () => { if (idleTimer.current) clearTimeout(idleTimer.current) } }, [resetIdle])
  useEffect(() => {
    const events = ['touchstart','touchmove','click','keydown','mousemove']
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, resetIdle))
  }, [resetIdle])

  const destacadosLen = vinos.filter(v => v.destacado).length

  useEffect(() => {
    const el = stripRef.current
    if (!el || !window.matchMedia('(pointer: fine)').matches) return
    const onWheel = e => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      if (el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [view, destacadosLen])

  useEffect(() => {
    const fontDef = FONT_CSS[tienda?.font_family]
    if (fontDef?.google) {
      const id = 'gfont-kiosko'
      if (!document.getElementById(id)) {
        const link = document.createElement('link')
        link.id = id; link.rel = 'stylesheet'
        link.href = `https://fonts.googleapis.com/css2?family=${fontDef.google}&display=swap`
        document.head.appendChild(link)
      }
    }
  }, [tienda?.font_family])

  useEffect(() => {
    let keyboardCausedExit = false

    function onFsChange() {
      const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement)
      setIsFullscreen(inFs)
      if (!inFs) {
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          keyboardCausedExit = true
        }
      } else {
        keyboardCausedExit = false
      }
    }

    function onTouchStart() {
      if (!keyboardCausedExit) return
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
      keyboardCausedExit = false
      const el = document.documentElement
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {})
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
    }

    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
      document.removeEventListener('touchstart', onTouchStart)
    }
  }, [])

  function entrarPantallaCompleta() {
    const el = document.documentElement
    if (el.requestFullscreen) el.requestFullscreen()
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
  }

  function abrirDetalle(vino) { setVinoDetalle(vino); setView(VIEWS.DETAIL) }
  function volverDeDetalle() { setView(VIEWS.BROWSE); setVinoDetalle(null) }
  function abrirPairingDesdeDetalle() { setVinoDetalle(null); setView(VIEWS.PAIRING) }
  function normalizarMobileVinos(lista) {
    const vistos = new Set()
    return lista
      .filter(vino => vino?.id && !vistos.has(vino.id) && vistos.add(vino.id))
      .slice(0, MOBILE_SELECTION_MAX)
  }
  function mobileUrl(lista, source = 'selection', reason = '') {
    const seleccion = normalizarMobileVinos(Array.isArray(lista) ? lista : [lista])
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.cataconjuanjo.com'
    const params = new URLSearchParams({
      ids: seleccion.map(vino => vino.id).join(','),
      from: source,
      lang,
    })
    if (reason) params.set('motivo', String(reason).slice(0, 320))
    return `${origin}/kiosko/${slug}/movil?${params.toString()}`
  }
  function abrirMobileQrLista(lista = mobileVinos, source = 'selection', reason = '') {
    const seleccion = normalizarMobileVinos(lista)
    if (!seleccion.length) return
    setMobileVinos(seleccion)
    setKioskOrder(null)
    setMobileSelection({ vinos: seleccion, source, reason, url: mobileUrl(seleccion, source, reason) })
  }
  function abrirMobileQr(vino) {
    const estaba = mobileVinos.some(v => v.id === vino.id)
    const seleccion = normalizarMobileVinos([...mobileVinos, vino])
    setMobileVinos(seleccion)
    setMobileSelection(null)
    setCartNotice(estaba ? 'Este vino ya estaba en el carrito' : `${vino.nombre} añadido`)
    if (cartNoticeTimer.current) clearTimeout(cartNoticeTimer.current)
    cartNoticeTimer.current = setTimeout(() => setCartNotice(''), 1800)
  }
  function quitarMobileVino(id) {
    const seleccion = mobileVinos.filter(vino => vino.id !== id)
    setMobileVinos(seleccion)
    setCartNotice('')
    setKioskOrder(null)
    if (!seleccion.length) {
      setMobileSelection(null)
      return
    }
    setMobileSelection(prev => prev
      ? { ...prev, vinos: seleccion, url: mobileUrl(seleccion, prev.source, prev.reason) }
      : prev
    )
  }
  function vaciarMobileVinos() {
    setMobileVinos([])
    setMobileSelection(null)
    setCartNotice('')
    setKioskOrder(null)
  }

  // Long press en el logo → modo mostrador
  function onLogoPress()   { setLongPressTimer(setTimeout(() => setView(VIEWS.SHOWCASE), 2000)) }
  function onLogoRelease() { if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null) } }

  const colorPrimario = tienda?.color_primario || '#0d0d1a'
  const colorAcento   = tienda?.color_acento   || '#c9a96e'
  const temaClaro     = esColorClaro(colorPrimario)
  const fontCss       = FONT_CSS[tienda?.font_family]?.css || FONT_CSS.clasica.css
  const iconStyle      = tienda?.kiosko_icon_style === 'lineal' ? 'lineal' : 'emoji'
  const cestaActiva    = tienda?.cesta_activa === true
  const pedidosMostradorActivos = tienda?.kiosko_orders_enabled === true && !COUNTER_ORDERS_IN_DEVELOPMENT
  const themeVars = {
    '--color-primario': colorPrimario, '--color-acento': colorAcento, '--font-family': fontCss,
    '--texto':    temaClaro ? '#141413'            : '#f0ede8',
    '--texto-m':  temaClaro ? 'rgba(20,20,19,.6)'  : 'rgba(240,237,232,.6)',
    '--texto-d':  temaClaro ? 'rgba(20,20,19,.38)' : 'rgba(240,237,232,.4)',
    '--sup1':     temaClaro ? 'rgba(0,0,0,.03)'    : 'rgba(255,255,255,.05)',
    '--sup2':     temaClaro ? '#F7F7F7'            : 'rgba(255,255,255,.08)',
    '--sup3':     temaClaro ? 'rgba(0,0,0,.07)'    : 'rgba(255,255,255,.12)',
    '--borde':    temaClaro ? '#EEEEEE'            : 'rgba(255,255,255,.1)',
    '--borde-f':  temaClaro ? '#AAAAAA'            : 'rgba(255,255,255,.35)',
    '--panel':    temaClaro ? '#FFFFFF'            : '#141420',
    '--sidebar':  temaClaro ? '#F7F7F7'            : 'rgba(0,0,0,.35)',
    '--sidebar-b':temaClaro ? '#EEEEEE'            : 'rgba(255,255,255,.08)',
    '--overlay':  temaClaro ? 'rgba(0,0,0,.55)'    : 'rgba(0,0,0,.75)',
    '--spinner-t':temaClaro ? 'rgba(0,0,0,.1)'     : 'rgba(255,255,255,.15)',
    '--btn-back': temaClaro ? 'rgba(0,0,0,.05)'    : 'rgba(255,255,255,.08)',
    '--btn-back-b':temaClaro? '#DDDDDD'            : 'rgba(255,255,255,.15)',
    '--select-bg':temaClaro ? '#FFFFFF'            : '#1a1a2e',
    '--featured-b':temaClaro? '#EEEEEE'            : 'rgba(255,255,255,.08)',
  }

  if (cargando) return (
    <div className={styles.loadingScreen} style={themeVars}>
      <div className={styles.loadingSpinner} />
      <p style={{ color: colorAcento }}>Cargando...</p>
    </div>
  )
  if (error) return (
    <div className={styles.errorScreen} style={themeVars}>
      <p className={styles.errorMsg}>{error}</p>
      <button onClick={() => window.location.reload()} style={{ color: colorAcento }} type="button">Reintentar</button>
    </div>
  )

  return (
    <div className={styles.kiosko} style={themeVars}>
      <MobileQrModal
        selection={mobileSelection}
        onClose={() => setMobileSelection(null)}
        onRemove={kioskOrder ? null : quitarMobileVino}
        colorAcento={colorAcento}
        ordersEnabled={pedidosMostradorActivos}
        order={kioskOrder}
      />
      {view !== VIEWS.SHOWCASE && !mobileSelection && (
        <MobileSelectionTray
          vinos={mobileVinos}
          notice={cartNotice}
          onOpen={() => abrirMobileQrLista(mobileVinos)}
          onClear={vaciarMobileVinos}
          colorAcento={colorAcento}
          ordersEnabled={pedidosMostradorActivos}
        />
      )}

      {/* MODO MOSTRADOR */}
      {view === VIEWS.SHOWCASE && (
        <ShowcaseView vinos={vinos} tienda={tienda} colorAcento={colorAcento} colorPrimario={colorPrimario}
          onExit={() => setView(VIEWS.WELCOME)} />
      )}

      {/* BIENVENIDA */}
      {view === VIEWS.WELCOME && (
        <div className={styles.welcomeView}>
          {/* Cabecera: logo, nombre, descripción */}
          <div className={styles.welcomeContent}>
            {tienda?.logo_url ? (
              <SafeImage
                src={tienda.logo_url}
                alt={tienda?.nombre}
                className={styles.welcomeLogoHero}
                fallback={<LogoFallback nombre={tienda?.nombre} />}
              />
            ) : (
              <h1
                className={styles.welcomeNombre}
                style={{ color: colorAcento }}
                onMouseDown={onLogoPress}
                onMouseUp={onLogoRelease}
                onTouchStart={onLogoPress}
                onTouchEnd={onLogoRelease}
              >
                {tienda?.nombre || 'Nuestra Selección de Vinos'}
              </h1>
            )}
            {tienda?.descripcion && <p className={styles.welcomeDesc}>{tienda.descripcion}</p>}
            <div className={styles.welcomeStats}>
              <span>{T[lang].referencias(vinos.length)}</span>
              {(() => { const d = vinos.filter(v => v.stock > 0).length; return d > 0 && d < vinos.length ? <span>{T[lang].disponibles(d)}</span> : null })()}
            </div>
          </div>

          {/* Acciones — tarjetas con icono grande centradas en el kiosko */}
          <div className={styles.welcomeActions}>
            <button className={styles.welcomeActionCard} onClick={() => setView(VIEWS.BROWSE)} type="button"
              style={{ '--acento': colorAcento }}>
              <span className={`${styles.welcomeActionIcon} ${iconStyle === 'emoji' ? styles.welcomeActionIconEmoji : ''}`}>
                <WelcomeActionIcon name="browse" variant={iconStyle} />
              </span>
              <span className={styles.welcomeActionLabel} style={{ color: colorAcento }}>{T[lang].explorar}</span>
            </button>
            <button className={styles.welcomeActionCard} onClick={() => setView(VIEWS.WIZARD)} type="button"
              style={{ '--acento': colorAcento }}>
              <span className={`${styles.welcomeActionIcon} ${iconStyle === 'emoji' ? styles.welcomeActionIconEmoji : ''}`}>
                <WelcomeActionIcon name="choose" variant={iconStyle} />
              </span>
              <span className={styles.welcomeActionLabel} style={{ color: colorAcento }}>{T[lang].elegir}</span>
            </button>
            <button className={styles.welcomeActionCard} onClick={() => setView(VIEWS.PAIRING)} type="button"
              style={{ '--acento': colorAcento }}>
              <span className={`${styles.welcomeActionIcon} ${iconStyle === 'emoji' ? styles.welcomeActionIconEmoji : ''}`}>
                <WelcomeActionIcon name="pairing" variant={iconStyle} />
              </span>
              <span className={styles.welcomeActionLabel} style={{ color: colorAcento }}>{T[lang].maridaje}</span>
            </button>
            {cestaActiva && (
              <button className={styles.welcomeActionCard} onClick={() => setView(VIEWS.CESTA)} type="button"
                style={{ '--acento': colorAcento }}>
                <span className={`${styles.welcomeActionIcon} ${iconStyle === 'emoji' ? styles.welcomeActionIconEmoji : ''}`}>
                  <WelcomeActionIcon name="cesta" variant={iconStyle} />
                </span>
                <span className={styles.welcomeActionLabel} style={{ color: colorAcento }}>{T[lang].cesta}</span>
              </button>
            )}
          </div>

          <div className={styles.langSelector}>
            {IDIOMAS.map(i => (
              <button key={i.id} type="button"
                className={`${styles.langBtn} ${lang === i.id ? styles.langBtnActive : ''}`}
                onClick={() => setLang(i.id)}
                title={i.label}
                aria-label={i.label}
                style={lang === i.id ? { borderColor: colorAcento } : {}}>
                <span className={`${styles.langFlag} ${styles[i.flagClass]}`} aria-hidden="true" />
              </button>
            ))}
          </div>

          {!isFullscreen && (
            <button
              type="button"
              onClick={entrarPantallaCompleta}
              className={styles.fullscreenBtn}
              aria-label="Pantalla completa"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          )}

          <span className={styles.kioskoCredit}>
            Kiosko Virtual <span aria-hidden="true">×</span> @cataconjuanjo
          </span>

          {vinos.filter(v => v.destacado).length > 0 && (
            <div className={styles.welcomeFeatured}>
              <p className={styles.featuredLabel} style={{ color: colorAcento }}>{T[lang].destacados}</p>
              <div className={styles.featuredStripWrap}>
                <button className={styles.featuredArrowBtn} onClick={() => stripRef.current?.scrollBy({ left: -280, behavior: 'smooth' })} type="button" aria-label="Anterior">‹</button>
                <div className={styles.featuredStrip} ref={stripRef}>
                  {vinos.filter(v => v.destacado).slice(0, 8).map(v => (
                    <button key={v.id} className={styles.featuredCard} onClick={() => abrirDetalle(v)} type="button">
                      <SafeImage
                        src={v.foto_url}
                        alt={v.nombre}
                        className={styles.featuredPhoto}
                        loading="lazy"
                        fallback={<div className={styles.featuredPhotoPlaceholder} style={{ background: `${TIPO_COLORS[v.tipo] || '#333'}88` }}><BottleMark className={styles.featuredPhotoIcon} /></div>}
                      />
                      <p className={styles.featuredNombre}>{v.nombre}</p>
                      {v.precio_pvp && <p className={styles.featuredPrecio} style={{ color: colorAcento }}>{formatPrecio(v.precio_pvp)}</p>}
                    </button>
                  ))}
                </div>
                <button className={styles.featuredArrowBtn} onClick={() => stripRef.current?.scrollBy({ left: 280, behavior: 'smooth' })} type="button" aria-label="Siguiente">›</button>
              </div>
            </div>
          )}

          <FeedbackWidget slug={slug} />
        </div>
      )}

      {/* WIZARD */}
      {view === VIEWS.WIZARD && (
        <WizardView slug={slug} tienda={tienda} colorAcento={colorAcento} colorPrimario={colorPrimario}
          onWineSelect={abrirDetalle} onMobile={abrirMobileQr} onBack={() => setView(VIEWS.WELCOME)} vinos={vinos} lang={lang} iconStyle={iconStyle} />
      )}

      {/* EXPLORAR */}
      {view === VIEWS.BROWSE && (
        <BrowseView vinos={vinos} colorAcento={colorAcento}
          onWineSelect={abrirDetalle} onBack={() => setView(VIEWS.WELCOME)} lang={lang} />
      )}

      {/* MARIDAJE */}
      {view === VIEWS.PAIRING && (
        <PairingView tienda={tienda} slug={slug} colorAcento={colorAcento} vinos={vinos} gourmet={gourmet}
          onWineSelect={abrirDetalle} onMobile={abrirMobileQr} onBack={() => setView(VIEWS.WELCOME)} lang={lang} iconStyle={iconStyle} />
      )}

      {/* CESTA REGALO — solo si la tienda la tiene activada en ajustes */}
      {cestaActiva && view === VIEWS.CESTA && (
        <CestaView slug={slug} vinos={vinos} colorAcento={colorAcento} colorPrimario={colorPrimario}
          onBack={() => setView(VIEWS.WELCOME)} iconStyle={iconStyle} lang={lang}
          onAddToCart={abrirMobileQrLista} />
      )}

      {/* DETALLE */}
      {view === VIEWS.DETAIL && vinoDetalle && (
        <WineDetail vino={vinoDetalle} slug={slug} colorAcento={colorAcento}
          onClose={volverDeDetalle} onMobile={abrirMobileQr} lang={lang} />
      )}
    </div>
  )
}
