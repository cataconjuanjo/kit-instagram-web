---
name: Cata con Juanjo · Carta Viva
description: Sistema editorial de vino para restaurantes — criterio de sumiller con inteligencia de datos
colors:
  borgona-guardia: "#74223d"
  borgona-profundo: "#2b101b"
  borgona-suave: "#f1e4e7"
  oro-anada: "#af8b52"
  tinta-base: "#17120f"
  piedra-caliza: "#756d63"
  papel-crema: "#fffaf0"
  arena-calida: "#fbf6ec"
  arena-suave: "#f3eee5"
  arena-dashboard: "#f8f3eb"
  noche-cata: "#11100e"
  verde-bodega: "#385f4f"
  ambar-foco: "#F59E0B"
  estado-exito: "#4CAF50"
  estado-alerta: "#FF9800"
  estado-error: "#F44336"
  chart-tintos: "#6b1a2e"
  chart-blancos: "#c4a84a"
  chart-espumosos: "#a08c72"
  chart-rosados: "#c4707a"
typography:
  display:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "clamp(3.2rem, 6.8vw, 7rem)"
    fontWeight: 500
    lineHeight: 0.95
    letterSpacing: "-0.028em"
    fontFeature: "'kern' 1, 'liga' 1"
  headline:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "clamp(2rem, 4.2vw, 4rem)"
    fontWeight: 500
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.18
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, Manrope, Arial, sans-serif"
    fontSize: "clamp(1.05rem, 1.8vw, 1.28rem)"
    lineHeight: 1.82
  label:
    fontFamily: "Inter, Manrope, Arial, sans-serif"
    fontSize: "0.63rem"
    fontWeight: 700
    letterSpacing: "0.2em"
rounded:
  pill: "999px"
  md: "8px"
  sm: "6px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "28px"
  lg: "44px"
  xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.borgona-guardia}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "#5d1c31"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-base}"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
    height: "52px"
  button-secondary-hover:
    backgroundColor: "rgba(23, 18, 15, 0.05)"
    textColor: "{colors.tinta-base}"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
  chip-selected:
    backgroundColor: "{colors.borgona-suave}"
    textColor: "{colors.borgona-guardia}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  chip-unselected:
    backgroundColor: "transparent"
    textColor: "{colors.piedra-caliza}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
---

# Design System: Cata con Juanjo · Carta Viva

## Overview

**Creative North Star: "La Contreetiqueta del Gran Cru"**

El sistema visual de Cata con Juanjo tiene dos caras, como una gran botella: el frente —la web pública— es editorial, impresa, con Cormorant Garamond en cuerpos grandes sobre papel crema y oro discreto. El reverso —el dashboard Carta Viva— es técnico, denso, una herramienta de trabajo con Geist Sans, topbar oscuro y fondo de arena cálida. La misma mano de sumiller firma los dos.

La filosofía es **calidez con criterio**: el sistema usa cremas, borgoña y oro no por decoración sino porque son materiales propios de su mundo. El vino es sensorial y humano; el diseño lo refleja sin volverse vacuamente lujoso. Cada decisión tiene un porqué funcional. Nada brilla sin razón; nada sobra.

Visualmente, el sistema rechaza el tecno-genérico (azules corporativos, blancos fríos, sombras Material escalonadas), el lujo vacío (dorados en todo, serif en todas partes) y el dashboard hipster (oscuro total, neon, micro-animaciones decorativas). Su punto de equilibrio: autoridad en el papel impreso, eficiencia densa pero cálida en la pantalla de trabajo.

**Key Characteristics:**
- Dos registros que conviven sin conflicto: editorial público + herramienta operativa
- Paleta de bodega: papel crema, borgoña de guardia, oro de añada, tinta profunda
- Tipografía dual con frontera clara: Cormorant Garamond para identidad; Inter/Geist para la herramienta
- Calidez visible sin ornamento vacío — el blanco frío no existe en este sistema
- Datos densos pero legibles; el fondo de arena amortigua la densidad sin restarle seriedad
- Bordes cálidos ocres, sombras de vino, sin elevación Material Design

## Colors

La paleta viene del mundo físico del vino: cremas de papel de bodega, el borgoña profundo del acento, el oro de las etiquetas de añada y la tinta oscura de las anotaciones de cata.

### Primary
- **Borgoña de Guardia** (#74223d): CTA principal, navegación activa, detalles de identidad. Profundo, sin florituras — el color de un Pinot Noir de añada en la copa.
- **Borgoña Profundo** (#2b101b): Fondo del hero panel en modo consultoría, capa más oscura cuando se necesita máxima profundidad.
- **Borgoña Suave** (#f1e4e7): Fondo de chips seleccionados, tintes de hover en superficies claras.

### Secondary
- **Oro de Añada** (#af8b52): Eyebrows, labels de categoría, subtítulos de marca. Calidez que señala jerarquía editorial sin competir con el borgoña.

### Tertiary
- **Verde Bodega** (#385f4f): Estado positivo con matiz natural, maridajes vegetales o blancos. Aparece raramente — su escasez lo hace efectivo.

### Neutral
- **Tinta de Fondo** (#17120f): Color de texto principal. Casi negro con calor marrón; nunca frío.
- **Piedra Caliza** (#756d63): Texto secundario, labels en reposo, muted. Gris cálido.
- **Papel Crema** (#fffaf0): Fondo del cuerpo en la web pública. Base del sistema público.
- **Arena Cálida** (#fbf6ec): Fondo de secciones alternadas, canvas de la web pública.
- **Arena Suave** (#f3eee5): Secciones de contraste suave, fondo de cards ligeras.
- **Arena Dashboard** (#f8f3eb): Fondo del shell del dashboard. Más saturado que el papel crema; transmite herramienta de trabajo.
- **Noche de Cata** (#11100e): Topbar del dashboard y hero panels oscuros. Near-black con calor, nunca carbón frío.
- **Línea Cálida** (rgba(52, 35, 23, 0.14)): Divisores y bordes en superficies claras. Nunca gris neutro.
- **Ámbar de Foco** (#F59E0B): Ring de foco universal — única excepción a la paleta de vino; garantiza contraste de accesibilidad.

### Named Rules
**The Borgoña Raro Rule.** El borgoña de guardia es el acento de acción: CTAs, estados activos, identidad de marca. No como fondo de sección ni de card. Su rareza en pantalla es el punto; si aparece en todo, pierde fuerza.

**The Oro Secundario Rule.** El oro no decora; señala categoría y jerarquía editorial (eyebrows, labels). Nunca en un botón, nunca en texto corrido largo.

## Typography

**Display Font:** Cormorant Garamond (with Georgia, serif)
**Body/App Font:** Inter, Manrope (with Arial, sans-serif)
**Dashboard Runtime Font:** Geist Sans (with system-ui, sans-serif)

**Character:** Dos voces tipográficas deliberadas y con frontera clara. Cormorant Garamond domina la identidad pública: grandes cuerpos, tracking negativo agresivo, peso medio. Inter y Geist Sans toman el control en la herramienta: densos, legibles, sin personalidad que distraiga del dato.

### Hierarchy
- **Display** (500, clamp(3.2rem, 6.8vw, 7rem), line-height 0.95, tracking -0.028em): Titulares héroe en la web pública. Solo Cormorant Garamond. Line-height intencionalmente bajo para bloques masivos de texto serif.
- **Headline** (500, clamp(2rem, 4.2vw, 4rem), line-height 1.04, tracking -0.02em): Titulares de sección en la web pública. Mismo tratamiento, un paso más pequeño.
- **Title** (500, 1.5rem, line-height 1.18, tracking -0.01em): Sub-secciones y nombre de restaurante en el topbar. Puede ser Cormorant en contexto editorial, Geist en el dashboard.
- **Body** (400, clamp(1.05rem, 1.8vw, 1.28rem), line-height 1.82): Párrafos en la web pública. Máximo 65ch. Inter.
- **Label** (700, 0.63rem, tracking 0.2em, uppercase): Eyebrows, categorías, versalitas de identificación. Siempre en oro de añada (#af8b52), con línea decorativa previa de 22px.

### Named Rules
**The Two Voices Rule.** Nunca mezcles Cormorant Garamond con Inter/Geist dentro del mismo componente. Cormorant es identidad pública; Inter/Geist es herramienta operativa. El nombre de un restaurante en el topbar oscuro puede llevar Cormorant; los botones de acción en esa misma barra usan Inter.

**The Tight Display Rule.** Los títulos display tienen tracking negativo y line-height por debajo de 1. No los aflojes a los valores de párrafo; su densidad óptica es parte de la identidad editorial.

## Layout

La web pública usa un modelo editorial de dos columnas fluidas con `clamp()` en todos los espaciados. Contenedor funcional de texto en 650px (lead), 760px (hero copy), sin máximo estricto en cuadrículas de sección. El padding horizontal es `clamp(20px, 5vw, 64px)` en todos los niveles.

El dashboard usa un layout de aplicación: contenedor máximo de 1120px, padding interior 24–28px, topbar sticky de altura fija. Los módulos internos usan grids de 2 columnas para métricas y filas de tarjetas para listas de datos.

**Ritmo de espaciado** (múltiplos de 8px):
- **xs (8px):** separadores internos, gaps entre iconos y texto
- **sm (16–20px):** padding de botón, gaps internos de card
- **md (28–32px):** padding de card, gaps entre tarjetas
- **lg (44–52px):** espaciados de sección, margin-top de hero actions
- **xl (64–84px):** padding de bloques hero

**Responsive:** La web pública colapsa a columna única en mobile con `clamp()`. El dashboard tiene un overlay de advertencia en pantallas pequeñas — la herramienta está diseñada para desktop y tablet horizontal.

## Elevation & Depth

El sistema usa elevación mínima y semántica, no escalonada. La mayoría de superficies son flat. Las sombras aparecen solo donde señalan acción o jerarquía contextual, y siempre en tono de vino o tinta, nunca en gris neutro.

### Shadow Vocabulary
- **Wine Glow** (`0 4px 16px rgba(116, 34, 61, 0.22)`): Botón primario en reposo. Refuerza el acento borgoña.
- **Wine Glow Lifted** (`0 8px 28px rgba(116, 34, 61, 0.34)`): Botón primario en hover. La sombra crece, no aparece de la nada.
- **Ambient Deep** (`0 26px 70px rgba(23, 13, 8, 0.16)`): Hero panels oscuros. Difusa y ambiental, no estructural.
- **Card Subtle** (`0 2px 8px rgba(0, 0, 0, 0.06)`): Cards del dashboard en reposo.
- **Nav Blur**: `backdrop-filter: blur(18px)` con fondo semiopaco — profundidad sin sombra.

### Named Rules
**The Flat-By-Default Rule.** Superficies, cards e inputs son flat en reposo. Las sombras son respuesta al estado (hover, panel elevado) o señal de importancia (hero panel). No las uses como decoración de grid o separación de columnas.

## Shapes

El lenguaje de formas usa dos radios principales y un caso especial:

- **Píldora (999px):** Botones, nav CTA, chips de filtro. Señala acción directa o selección. Nunca en cards de contenido.
- **Panel (8px):** Cards del dashboard, inputs, panels de métricas, tooltips. Bordes redondeados pero contenidos; transmite herramienta funcional.
- **Sutil (6px):** Panels editoriales en la web pública (hero panel, tarjetas de servicios). Ligeramente más cuadrado que el panel de app.

Los bordes son siempre cálidos: `rgba(52, 35, 23, 0.14)` en superficies claras; `rgba(255, 250, 243, 0.12)` en superficies oscuras. Nunca `#e0e0e0` gris neutro.

No hay clipping geométrico, cortes oblicuos ni formas decorativas. La sobriedad del lenguaje es parte de la autoridad del sistema.

## Components

### Buttons
Funcionales con carácter: el pill button connota acción directa, no lujo.
- **Shape:** Píldora (border-radius: 999px), min-height 52px, padding 14px 28px
- **Primary:** Fondo borgoña (#74223d), texto blanco, wine glow shadow, font-weight 700
- **Hover / Focus:** Borgoña oscurecido 16% vía `color-mix`, `translateY(-2px)`, shadow lift. Focus ring ámbar (#F59E0B).
- **Secondary / Ghost:** Fondo transparente, borde warm rgba(23,18,15,0.28), texto tinta. Hover: fondo ink 5%, borde sólido tinta.
- **Disabled:** opacity 0.6, no transform, cursor not-allowed.

### Chips / Filtros
- **Selected:** Fondo borgoña suave (#f1e4e7), texto borgoña guardia (#74223d), borde borgoña a 45% opacidad. Píldora.
- **Unselected:** Fondo transparente, texto piedra caliza, borde warm.
- **State transition:** Sin animación de fondo; el cambio de borde+fondo es suficiente.

### Cards / Containers
El sistema usa dos tipos de cards según el contexto.
- **Editorial (web pública):** Border-radius 6px, borde línea cálida, fondo arena suave o papel crema. Sin sombra estructural.
- **Dashboard:** Border-radius 8px, borde #e0d4bc, fondo #fffaf3, card subtle shadow (0 2px 8px rgba(0,0,0,0.06)). Padding 20–24px.

### Inputs / Fields
- **Style:** Fondo claro, borde #e0d4bc (warm), border-radius 8px, min-height 44px
- **Focus:** Border-color borgoña (#74223d); focus ring ámbar universal via `:focus-visible`
- **Error:** Border-color estado-error (#F44336)
- **Placeholder:** Color piedra caliza

### Navigation (Web Pública)
- **Style:** Sticky, `backdrop-filter: blur(18px)`, fondo paper 94% opaco. Min-height 82px. Borde inferior línea cálida.
- **Links:** Color piedra caliza en reposo, tinta base en hover. Border-bottom 2px borgoña en estado activo.
- **CTA pill:** Fondo borgoña, texto blanco, borde-radius 999px.
- **Mobile:** Hamburger con animación crossfade a X; menú expandido sobre el contenido.

### Navigation (Dashboard)
- **Style:** Sticky, `rgba(23, 20, 22, 0.96)`, `backdrop-filter: blur(14px)`. Texto #fffaf3.
- **Botones de contexto:** Borde `rgba(255,250,243,0.18)`, border-radius 8px, fondo transparente, 12px/weight 750.
- **Nombre de restaurante:** Cormorant Garamond 17px en el topbar oscuro — la única vez que serif aparece en la app.

### Eyebrow (Signature Component)
Elemento identitario de la web pública. Una línea horizontal de 22px en oro precede siempre al texto.
- Fuente: Inter, 0.63rem, weight 700, tracking 0.2em, uppercase
- Color: Oro de añada (#af8b52)
- `::before`: inline-block, 22px × 1px, background currentColor, flex-shrink 0

## Do's and Don'ts

### Do:
- **Do** usar Cormorant Garamond para títulos de la web pública y Geist/Inter para el dashboard. Son dos voces distintas, no una con variaciones.
- **Do** limitar el borgoña a CTAs y estados activos. Un elemento de borgoña activo por viewport como máximo.
- **Do** usar tracking negativo en todos los titulares Cormorant: -0.028em en display, -0.02em en headline, -0.01em en title.
- **Do** introducir cada sección editorial con el eyebrow de línea + versalitas en oro de añada.
- **Do** usar bordes cálidos (tono ocre/crema) en lugar de grises neutros fríos en todos los elementos.
- **Do** respetar el ring de foco ámbar (#F59E0B) como única excepción a la paleta — garantiza contraste sobre fondos crema.

### Don't:
- **Don't** usar el borgoña como fondo de sección, card o panel de contenido general. Es un acento, no una superficie.
- **Don't** usar el oro de añada en botones ni como color de texto en párrafos largos. Es para labels y eyebrows.
- **Don't** mezclar tipografía editorial (Cormorant) y de herramienta (Geist/Inter) dentro del mismo componente.
- **Don't** usar sombras Material Design (elevaciones escalonadas grises). Usa wine glow o ambient deep cuando sea necesario.
- **Don't** usar fondos blancos puros (#ffffff) en la web pública. El blanco frío rompe la calidez; usa papel crema (#fffaf0) o arena cálida (#fbf6ec).
- **Don't** aplicar border-radius 999px a cards o panels de contenido. Los pills son para botones y chips; el contenido editorial lleva 6–8px.
