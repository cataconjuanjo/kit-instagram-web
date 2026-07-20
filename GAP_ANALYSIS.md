# GAP ANALYSIS - Wine Business App

Fecha de auditoria: 2026-06-06  
Alcance revisado: aplicacion Next.js, rutas `app/`, APIs, scripts de importacion y migraciones Supabase incluidas en `supabase/`.

## Resumen ejecutivo

La aplicacion ya ha evolucionado bastante mas alla de un inventario simple. Tiene carta de vinos/platos, bodega operativa, inventario rapido, modo sala/camarero, propuestas del consultor, catalogos de proveedores, arquitectura de precios por ticket medio, reequilibrio de gamas, menu engineering y diagnosticos por restaurante.

El gap principal no es visual ni de flujo: es de producto analitico. Muchas recomendaciones existen como logica calculada en frontend, pero no hay todavia un motor central persistente de KPI, alertas, forecasts, clasificaciones historicas ni oportunidades economicas anualizadas. Para comportarse como plataforma de consultoria de rentabilidad, la app necesita convertir esos calculos en entidades guardadas, comparables en el tiempo y accionables.

Estado global contra la especificacion:

| Area | Estado | Lectura |
|---|---|---|
| Auditoria estado actual | Existe parcialmente | Hay modulos y datos suficientes; este documento cubre la auditoria. |
| Modelo de datos consultivo | Parcial | Existen `vinos`, `platos`, `restaurantes`, `estadisticas`, `movimientos_stock`, `consultor_propuestas`, proveedores/catalogos. Faltan tablas analiticas. |
| KPI Engine | Parcial bajo | Hay margen, valor de bodega, stock, ventas marcadas y arquitectura de precios; faltan KPIs financieros/inventario/equipo/cliente formalizados. |
| Menu Engineering | Parcial medio/alto | Existe clasificacion por popularidad y margen, pero no se persiste como STAR/PLOWHORSE/PUZZLE/DOG ni genera ciclo completo de accion. |
| Inventory Intelligence | Parcial medio | Hay bajo minimo, stock alto sin salida, pedido sugerido y movimientos. Falta dead stock con antiguedad, dependencia proveedor, perdidas y capital atrapado formal. |
| Wine List Intelligence | Parcial medio | Hay equilibrio por tipos, regiones, estilos, ticket medio, gamas y reequilibrio. Faltan Pareto, productividad por referencia y bottom 10%. |
| BTG Engine | Parcial bajo | Se detecta si hay poca estrategia por copa y se priorizan vinos por copa; falta simulador economico BTG/Coravin. |
| Alert Engine | Parcial | Hay alertas calculadas en pantallas; no hay tabla `Alert`, severidad normalizada, estado, asignacion ni historial. |
| Consultant Mode | Parcial alto | Hay radar, informe, score, prioridades, propuestas y siguiente movimiento. Falta estructurar Quick Wins/Medium/Strategic y guardar diagnosticos. |
| Opportunity Engine | Falta | No hay estimacion anual de recuperacion economica, dificultad ni prioridad calculada de forma persistente. |

## Modulos ya implementados

| Modulo | Evidencia | Estado |
|---|---|---|
| Dashboard restaurante | `app/dashboard/page.js` | Vista operativa con datos de vinos, platos, estadisticas y propuestas. |
| Vinos | `app/dashboard/vinos/page.js` | CRUD, importacion, edicion, stock, bulk update, duplicado. |
| Platos | `app/dashboard/platos/page.js` | CRUD, importacion, enriquecimiento aromatico. |
| Carta publica | `app/dashboard/carta/page.js`, `app/api/public/restaurante/[slug]/route.js` | Carta de cliente con vinos/platos activos. |
| Sala / modo camarero | `app/dashboard/sala/page.js`, `app/camarero/[slug]/page.js`, `app/api/camarero/*` | Recomendacion de servicio, eventos, acceso camarero. |
| Cierre de servicio | `app/dashboard/cierre/page.js`, `app/api/cierres-servicio/route.js` | Incidencias, agotados, ajustes y cierre. |
| Bodega | `app/dashboard/bodega/page.js` | Valor de stock, margen medio, pedido sugerido, propuestas, proveedores, movimientos. |
| Inventario | `app/dashboard/inventario/page.js` | Conteo por prioridad, ajustes, impacto coste/venta y movimientos. |
| Estadisticas | `app/dashboard/estadisticas/page.js`, `app/api/estadisticas/route.js` | Eventos de venta, escaneo, sommelier y consultas agregadas. |
| Menu Engineering | `app/dashboard/menu-engineering/page.js` | Popularidad/margen con categorias Estrella, Joya oculta, Caballo de batalla, Revisar. |
| Consultoria admin | `app/admin/consultoria/page.js` | Radar por restaurante, score, prioridad, alertas y ticket medio. |
| Restaurante admin | `app/admin/restaurante/[id]/page.js` | Diagnostico profundo, arquitectura de precios, reequilibrio, candidatos a salir, propuestas. |
| Informe admin | `app/admin/informe/[id]/page.js` | Informe consultivo con plan, impacto asistido y snapshots locales. |
| Propuestas consultor | `app/admin/propuestas/page.js`, `app/api/admin/propuestas/route.js` | CRUD de propuestas comerciales. |
| Proveedores/catalogos | `app/admin/proveedores/page.js`, `app/api/admin/proveedores/route.js` | Catalogos, favoritos, precios, importacion y filtros. |
| Sugerencias cliente | `app/dashboard/sugerencias/page.js`, `app/api/sugerencias/route.js` | Feedback/sugerencias de restaurante. |
| Personalizacion/QR/hub | `app/dashboard/personalizar/page.js`, `app/dashboard/qr/page.js`, `app/api/admin/hub-links/route.js` | Marca, enlaces y experiencia publica. |

## Metricas existentes

Ya se calculan o se muestran:

| Metrica | Donde aparece | Estado |
|---|---|---|
| Valor a coste de bodega | `dashboard/bodega`, `admin/restaurante`, `admin/informe` | Existe |
| Valor potencial de venta | `dashboard/bodega`, `admin/restaurante`, `admin/informe` | Existe |
| Margen medio % | `dashboard/bodega`, `admin/restaurante`, `admin/consultoria` | Existe |
| Margen bruto potencial | `dashboard/bodega` | Existe |
| Vinos bajo minimo | `dashboard/bodega`, `dashboard/inventario`, `admin/restaurante` | Existe |
| Vinos sin coste/precio/proveedor/stock minimo | `dashboard/bodega`, `admin/restaurante`, `admin/consultoria` | Existe |
| Stock alto sin ventas marcadas | `dashboard/bodega`, `dashboard/inventario` | Parcial |
| Ventas marcadas | `estadisticas`, `menu-engineering`, `admin/*` | Parcial |
| Incidencias de stock/dudas sala | `dashboard/cierre`, `dashboard/bodega`, `admin/*` | Existe |
| Arquitectura de precios por ticket | `admin/restaurante`, `admin/consultoria`, `camarero` | Existe |
| Numero recomendado de referencias por ticket | `admin/restaurante`, `admin/consultoria` | Existe |
| Equilibrio por tipo/por copa/locales | `admin/restaurante` | Existe |
| Clasificacion popularidad/margen | `dashboard/menu-engineering` | Parcial |
| Impacto asistido/minutos ahorrados/riesgos | `admin/informe` | Parcial |

Falta convertir estas metricas en una capa comun de KPI con versionado, historico y trazabilidad.

## Entidades de datos actuales

| Entidad actual | Evidencia | Comentario |
|---|---|---|
| `restaurantes` | Uso general; migraciones `add_ticket_medio.sql`, `add_personalizacion.sql`, `add_hub_links.sql` | Incluye datos comerciales, personalizacion, ticket medio, estado suscripcion. |
| `vinos` | Uso general; `add_bodega_control.sql` | Base principal de carta/bodega. Tiene coste, stock minimo, proveedor, referencia. |
| `platos` | Uso general; `add_precio_to_platos.sql`, `add_familias_aromaticas_platos.sql` | Base de carta de comida y maridaje. |
| `estadisticas` | `app/api/estadisticas/route.js`, `app/api/maridaje/route.js` | Event log generico con `tipo` y `detalle` JSON. Sirve como ventas/escaneos/sommelier, pero no sustituye a transacciones normalizadas. |
| `movimientos_stock` | `supabase/add_bodega_control.sql` | InventoryMovement real. Guarda tipo, cantidad, stock anterior/nuevo, motivo. |
| `consultor_propuestas` | `supabase/add_consultor_propuestas.sql` | Propuestas con estado, prioridad, coste/precio/margen objetivo. |
| `proveedores_vino` | `supabase/add_proveedores_catalogos.sql` | Supplier parcial. |
| `proveedor_catalogo_vinos` | `supabase/add_proveedores_catalogos.sql` | Catalogo de proveedor con costes y PVP recomendado. |
| `cierres_servicio` | `supabase/add_cierres_servicio.sql` | Cierres operativos. |
| `sesiones_uso`, `consumos_ia` | `supabase/add_sesiones_uso.sql`, `supabase/add_consumos_ia.sql` | Uso y consumo IA. |
| `sugerencias_restaurante` | `supabase/add_sugerencias.sql` | Feedback/sugerencias. |
| `restaurante_links`, `seleccion_especial` | `add_hub_links.sql`, uso en seleccion/carta | Links publicos y seleccion destacada. |

## Comparativa del modelo de datos pedido

| Entidad requerida | Estado | Equivalente actual | Gap exacto |
|---|---|---|---|
| Wine | Existe | `vinos` | Falta capa analitica separada de performance/clasificacion. |
| WineCategory | Parcial | Campos `tipo`, `region`, `uva`, familias aromaticas | No hay tabla normalizada de categorias/estilos. |
| Supplier | Parcial | `proveedores_vino`, texto `vinos.proveedor` | Falta relacion formal `vinos.proveedor_id`; hoy muchos vinos usan texto libre. |
| InventoryMovement | Existe | `movimientos_stock` | Correcto para movimientos basicos; faltan costes unitarios historicos por movimiento. |
| InventorySnapshot | Falta | Snapshots locales en `admin/informe`, no BD | Crear tabla para cierres periodicos de stock/valor. |
| PurchaseOrder | Parcial | Pedido sugerido en `dashboard/bodega` | No hay orden de compra persistente ni estado por proveedor. |
| SalesTransaction | Parcial | `estadisticas` tipo `venta` | Falta tabla normalizada con linea, importe, canal, fecha, usuario. |
| GlassSale | Parcial | `precio_copa`, eventos JSON | Falta venta por copa normalizada. |
| BottleSale | Parcial | Eventos JSON | Falta venta por botella normalizada. |
| StaffMember | Falta | No detectado | Necesario para KPIs de equipo. |
| WineRecommendation | Parcial | Eventos sommelier/maridaje, `consultor_propuestas` | Falta entidad de recomendacion con origen, resultado y responsable. |
| Promotion | Falta | No detectado | Necesario para acciones comerciales temporales. |
| MenuPlacement | Parcial | `seleccion_especial` | No mide posicion/visibilidad en carta completa. |
| RestaurantBenchmark | Falta | No detectado | Necesario para comparativas externas/objetivos por segmento. |
| WinePerformance | Falta | Calculo runtime en `menu-engineering` | Crear tabla con ventas, margen, rotacion, periodo. |
| WineClassification | Parcial | Categorias runtime Estrella/Joya/Caballo/Revisar | Persistir clasificacion por periodo y criterio. |
| Alert | Parcial | Alertas runtime en admin/bodega/dashboard | Crear tabla con severidad, estado, owner, fecha, entidad afectada. |
| Recommendation | Parcial | `consultor_propuestas` | Separar recomendaciones de motor vs propuestas comerciales. |
| KPIHistory | Falta | No persistido | Crear historico por restaurante/periodo/KPI. |
| Forecast | Falta | No detectado | Crear previsiones de stock, margen y ventas. |

## FASE 3 - KPI Engine

### Rentabilidad

| KPI | Estado | Comentario |
|---|---|---|
| Beverage Cost % | Falta | Se calcula margen %, pero no coste bebida sobre ventas reales. |
| Gross Profit | Parcial | Margen potencial y margen asistido existen, no GP real consolidado. |
| Gross Margin % | Existe parcial | Margen medio por referencia, no historico por periodo/ventas. |
| Prime Cost % | Falta | No hay costes laborales ni otros costes. |
| Cellar ROI | Falta | No hay beneficio generado / capital inmovilizado formal. |
| Capital Efficiency | Falta | Valor de stock existe, eficiencia no. |
| Inventory Productivity | Falta | No hay productividad por euro invertido. |

### Inventario

| KPI | Estado | Comentario |
|---|---|---|
| Inventory Turnover | Falta | Hay ventas y stock, pero no formula persistente por periodo. |
| Days Inventory Outstanding | Falta | Requiere consumo/coste ventas y stock medio. |
| Dead Stock | Parcial | `stock alto sin ventas marcadas`, sin antiguedad ni umbral configurable. |
| Dead Stock Ratio | Falta | No se calcula ratio sobre total. |
| Inventory Accuracy | Parcial | Inventario permite ajustes, pero no calcula precision. |
| Shrinkage Rate | Parcial | Movimientos `merma` existen, falta KPI sobre ventas/stock. |

### Carta

| KPI | Estado | Comentario |
|---|---|---|
| Sales Mix | Parcial | Menu engineering usa % ventas por vino. Falta mix por categoria/region/precio. |
| Category Balance | Existe parcial | Equilibrio por tipos/por copa/locales en admin. |
| Price Ladder Coverage | Parcial | Arquitectura de precios por ticket y gamas. |
| Wine List Complexity | Falta | No hay indice de complejidad. |
| Range Efficiency | Falta | Falta rendimiento por gama vs numero recomendado. |

### Venta por copas

| KPI | Estado | Comentario |
|---|---|---|
| BTG Revenue Share | Falta | No hay ventas por copa normalizadas. |
| BTG Profitability | Falta | Precios copa existen, pero no ventas/coste real. |
| BTG Coverage | Parcial | Se cuenta numero de referencias por copa. |
| Coravin Candidate Score | Falta | No existe scoring especifico. |

### Equipo

Todos faltan o estan solo insinuados por eventos de sala:

| KPI | Estado |
|---|---|
| Wine Attachment Rate | Falta |
| Upsell Conversion | Falta |
| Wine Recommendation Rate | Parcial muy bajo |

### Cliente

| KPI | Estado |
|---|---|
| Wine Penetration | Falta |
| Repeat Wine Customer Rate | Falta |
| Premium Customer Rate | Falta |

## FASE 4 - Menu Engineering Engine

Estado: parcial medio/alto.

Existe `app/dashboard/menu-engineering/page.js`, que clasifica referencias con coste y ventas suficientes usando:

- Margen por botella: `precio_botella - coste_compra`.
- Popularidad: ventas del vino / ventas totales.
- Barrera de rentabilidad: margen medio.
- Barrera de popularidad: porcentaje esperado ajustado.

La clasificacion actual es:

| Actual | Equivalente especificacion | Estado |
|---|---|---|
| Estrella | STAR | Existe |
| Caballo de batalla | PLOWHORSE | Existe |
| Joya oculta | PUZZLE | Existe |
| Revisar | DOG | Existe |

Gap:

- No se guarda en `WineClassification`.
- No hay periodo configurable ni comparativa historica.
- Las recomendaciones estan en UI, pero no se convierten automaticamente en `Recommendation`, `Alert` o tarea.
- No hay accion de "marcar implementada" asociada a cada recomendacion de menu engineering.

## FASE 5 - Inventory Intelligence

Estado: parcial medio.

Ya existe:

- Stock bajo minimo.
- Pedido sugerido agrupado por proveedor.
- Vinos sin coste, sin proveedor, sin stock minimo.
- Stock alto sin ventas marcadas.
- Movimientos de stock con motivo.
- Inventario semanal por prioridad.
- Ajustes con impacto coste/venta.

Falta:

- Dead stock con definicion temporal: sin ventas en X dias y stock/capital mayor a umbral.
- Slow movers por rotacion real.
- Excess inventory por dias de cobertura.
- Supplier dependency por porcentaje de referencias, capital y ventas.
- Inventory losses con ratio de merma/ajuste negativo.
- Alertas persistentes de capital atrapado, ruptura, dependencia o perdida.

## FASE 6 - Wine List Intelligence

Estado: parcial medio.

Ya existe:

- Cobertura por estilos basicos: tintos, blancos, espumosos, generosos, dulces, por copa, locales.
- Cobertura por regiones: deteccion de exceso Rioja/Ribera y vino local debil.
- Cobertura por precios: gamas por ticket medio.
- Reequilibrio recomendado por gamas.
- Candidatos a salir de carta marcados localmente.

Falta:

- Pareto Ratio: ventas acumuladas top 20% / total.
- Reference Productivity: ventas o margen por referencia.
- Bottom 10% por venta/margen/rotacion.
- Huecos de precio con escala mas granular que las gamas.
- Exceso de referencias conectado a accion persistente.
- Concentracion excesiva de ventas por referencia/categoria.

## FASE 7 - BTG Engine

Estado: parcial bajo.

Ya existe:

- Campo `precio_copa`.
- Deteccion de "poca estrategia por copa".
- Conteo de referencias por copa.
- Modo sala prioriza referencias por copa/premium/stock.

Falta:

- Simulador de pasar una referencia a copa.
- Estimacion de margen incremental.
- Estimacion de ventas incrementales.
- Impacto esperado en rotacion.
- Score de candidato BTG.
- Score de candidato Coravin.
- Diferenciar BTG normal, Coravin y Premium By The Glass.

## FASE 8 - Alert Engine

Estado: parcial.

Ya existen alertas runtime en:

- `app/admin/consultoria/page.js`
- `app/admin/restaurante/[id]/page.js`
- `app/admin/informe/[id]/page.js`
- `app/dashboard/bodega/page.js`
- `app/dashboard/page.js`
- `app/dashboard/inventario/page.js`

Falta:

- Tabla `Alert`.
- Severidad normalizada `CRITICAL`, `WARNING`, `INFO`.
- Estado: abierta, en progreso, resuelta, descartada.
- Entidad afectada: vino, proveedor, restaurante, KPI.
- Responsable y fecha limite.
- Historial de cambios.
- Dedupe para no generar la misma alerta cada carga.
- Motor compartido; ahora cada pantalla recalcula a su manera.

## FASE 9 - Consultant Mode

Estado: parcial alto.

Ya existe:

- Radar de consultoria por restaurante.
- Score y prioridad.
- Alertas priorizadas.
- Siguiente movimiento.
- Servicios sugeridos.
- Propuestas del consultor.
- Informe admin con plan e impacto asistido.
- Diagnostico por carta, bodega, sala y arquitectura de precios.

Falta:

- Guardar diagnosticos como entidad historica.
- Separar automaticamente:
  - Diagnostico.
  - Problemas detectados.
  - Quick Wins < 30 dias.
  - Medium Term 1-6 meses.
  - Strategic.
- Generar plan de accion persistente y asignable.
- Convertir recomendaciones en tareas/propuestas con seguimiento.
- Comparar progreso entre diagnosticos.

## FASE 10 - Opportunity Engine

Estado: falta.

Hay una base en `consultor_propuestas` con coste estimado, precio recomendado, margen objetivo, prioridad y estado. Tambien hay calculos de valor de bodega y margen asistido.

Falta el motor de oportunidad:

- Estimated Profit Recovery anual.
- Impacto esperado por recomendacion.
- Dificultad de implantacion.
- Prioridad calculada por impacto/esfuerzo/riesgo.
- Horizonte temporal.
- Confianza del calculo.
- Estado de captura del beneficio.

## Principales gaps tecnicos

1. Centralizar engines en librerias compartidas.
   - Ahora `admin/consultoria`, `admin/restaurante` e `admin/informe` duplican mucha logica de diagnostico.
   - Recomendacion: crear `app/lib/consultingEngine.js`, `app/lib/kpiEngine.js`, `app/lib/alertEngine.js`, `app/lib/menuEngineeringEngine.js`, `app/lib/opportunityEngine.js`.

2. Persistir resultados analiticos.
   - La app calcula bien, pero pierde historico si no se guarda.
   - Recomendacion: tablas `kpi_history`, `wine_performance`, `wine_classifications`, `alerts`, `recommendations`, `forecasts`, `inventory_snapshots`.

3. Normalizar ventas.
   - `estadisticas.detalle` JSON sirve para empezar, pero limita KPIs financieros.
   - Recomendacion: crear `sales_transactions` y `sales_transaction_lines` o, como minimo, `wine_sales` con canal `glass/bottle`.

4. Normalizar proveedores.
   - Hay `proveedores_vino`, pero `vinos.proveedor` sigue siendo texto.
   - Recomendacion: agregar `proveedor_id` opcional en `vinos` y migracion gradual por nombre normalizado.

5. Crear snapshots.
   - Inventario y bodega necesitan stock medio y fotos historicas para rotacion/DIO/ROI.
   - Recomendacion: snapshot diario/semanal con unidades, coste, PVP, proveedor y clasificacion.

6. Convertir candidatos y decisiones locales en datos.
   - Candidatos a salir se guardan en `localStorage`.
   - Recomendacion: crear `wine_recommendations` o usar `recommendations` con tipo `remove_candidate`.

## Roadmap recomendado

### Sprint 1: Base analitica persistente

- Crear tablas: `kpi_history`, `wine_performance`, `wine_classifications`, `alerts`, `recommendations`, `inventory_snapshots`.
- Extraer logica duplicada de diagnostico a engines compartidos.
- Crear endpoint admin para recalcular diagnostico de un restaurante.

### Sprint 2: KPI Engine minimo viable

- Implementar:
  - Gross Margin % real.
  - Gross Profit real/asistido.
  - Inventory Turnover.
  - Dead Stock Ratio.
  - Category Balance.
  - Price Ladder Coverage.
  - BTG Coverage.
- Guardar historico por restaurante y periodo.

### Sprint 3: Menu + Wine List Intelligence

- Persistir STAR/PLOWHORSE/PUZZLE/DOG.
- Calcular Pareto Ratio, Reference Productivity y Bottom 10%.
- Convertir DOG/Revisar y exceso de gama en recomendaciones accionables.

### Sprint 4: Inventory Intelligence

- Dead stock real por dias.
- Slow movers.
- Excess inventory.
- Supplier dependency.
- Shrinkage rate.
- Alertas persistentes con severidad.

### Sprint 5: BTG + Opportunity Engine

- Simulador BTG/Coravin.
- Profit Recovery anual estimado.
- Impacto, dificultad, prioridad y confianza.
- Quick Wins/Medium/Strategic automatico en Consultant Mode.

## Conclusion

La app ya tiene el esqueleto correcto y varias piezas consultivas muy valiosas: bodega, sala, menu engineering, arquitectura de precios y radar de consultoria. Lo que falta para cumplir la especificacion no es "mas pantallas", sino convertir el conocimiento actual en motores persistentes: KPIs historicos, alertas con ciclo de vida, clasificaciones guardadas, recomendaciones accionables y estimacion economica de oportunidad.

La siguiente mejora con mas retorno seria crear el `KPI Engine` y el `Alert/Recommendation Engine` compartidos. Eso permitiria que bodega, informe, consultoria y modo camarero hablen el mismo idioma y dejen de recalcular diagnosticos aislados.
