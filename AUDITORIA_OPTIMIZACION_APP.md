# Auditoria urgente de optimizacion - Carta Viva

## Diagnostico general

La app ha ganado mucho valor funcional, pero ahora sufre de sobreexposicion: demasiadas decisiones, metricas y bloques aparecen a la vez. El problema no es que sobren funciones, sino que funciones de distinta frecuencia y distinto usuario estan mezcladas en el mismo nivel.

Ahora mismo se mezclan tres productos:

1. Panel operativo del hostelero.
2. Herramienta diaria de sala/bodega.
3. Panel privado del consultor.

El usuario restaurante no deberia ver todo como si todo fuese igual de importante. Hay que priorizar por frecuencia de uso.

## Principio de redisenio

La app debe pasar de:

> "Todo lo que Carta Viva sabe"

a:

> "Que tengo que hacer hoy, donde lo hago y que puedo ignorar ahora"

## Auditoria por pantallas

### 1. Dashboard inicio

Estado actual:
- Muy cargado.
- Tiene dashboard ejecutivo, estado de carta, metricas, accesos rapidos, diagnostico, acciones, cobertura, ticket alto, consultoria y objetivo comercial.
- Repite informacion de Bodega, Cierre, Estadisticas y Consultoria.

Problema:
- El hostelero entra y no sabe si debe leer, decidir, corregir o vender.
- Hay demasiadas llamadas a accion compitiendo.
- La parte de consultoria aparece demasiado pronto para un usuario restaurante.

Decision:
- Convertir Inicio en una pantalla de 30 segundos.
- Mantener solo:
  - Prioridad de hoy.
  - 3 metricas maximas.
  - 3 acciones recomendadas.
  - Accesos a Carta, Sala y Bodega.
- Mover diagnostico completo a una pestana o bloque secundario "Salud de carta".
- Quitar el panel "Consultoria disponible" del dashboard restaurante o hacerlo muy sutil al final.

### 2. Sidebar / navegacion

Estado actual:
- 10 entradas principales:
  - Inicio
  - Vinos
  - Bodega
  - Cierre servicio
  - Inventario
  - Platos
  - Estadisticas
  - Seleccion destacada
  - QR de sala
  - Diseno y marca

Problema:
- Todas parecen igual de importantes.
- Mezcla tareas diarias, configuracion, analitica y marketing.
- El usuario puede perderse saltando entre pantallas que se pisan.

Decision:
- Reducir navegacion principal a 5 entradas:
  - Inicio
  - Carta
  - Sala
  - Bodega
  - Ajustes

Nueva organizacion:
- Carta:
  - Vinos
  - Platos
  - Seleccion destacada
- Sala:
  - Cierre de servicio
  - Estadisticas de uso
- Bodega:
  - Control de bodega
  - Inventario
- Ajustes:
  - QR
  - Diseno y marca
  - Hub / enlaces si aplica

### 3. Bodega

Estado actual:
- Es probablemente la pantalla con mas carga.
- Incluye:
  - Valor a coste
  - Valor a venta
  - Margen medio
  - Bajo minimo
  - Propuestas
  - Incidencias de sala
  - Acciones recomendadas
  - Pedido sugerido
  - Proveedores
  - Datos incompletos
  - Todas las referencias editables

Problema:
- Mezcla seguimiento, compra, consultoria, incidencias y edicion masiva.
- Las incidencias tambien aparecen en Cierre.
- Las propuestas tambien aparecen como parte del discurso consultor.
- La lista completa de referencias hace que la pantalla parezca interminable.

Decision:
- Bodega debe tener solo tres niveles:
  1. Resumen economico.
  2. Acciones urgentes.
  3. Gestion avanzada plegada.

Cambios recomendados:
- Mantener arriba:
  - Valor a coste
  - Margen medio
  - Bajo minimo
  - Pedido sugerido
- Mover incidencias al Cierre de servicio. En Bodega solo mostrar resumen: "2 incidencias pendientes, revisar cierre".
- Mover propuestas a un bloque secundario plegado o al final.
- Hacer "Referencias de bodega" plegable por defecto.
- No mostrar proveedores y datos incompletos como dos paneles separados si no hay accion directa; unirlos en "Datos pendientes".

### 4. Cierre de servicio

Estado actual:
- Tiene sentido.
- Es una pantalla clara: revisar la noche.
- Pero algunas incidencias tambien aparecen en Bodega.

Problema:
- Duplicidad con Bodega.
- Puede parecer otra pantalla de estadisticas.

Decision:
- Cierre debe ser el unico sitio donde se resuelven incidencias de sala.
- Bodega solo debe enlazar a Cierre si hay pendientes.
- Mantener Cierre como rutina diaria despues del servicio.

### 5. Inventario

Estado actual:
- Bien orientado: contar solo lo importante.
- No deberia estar al mismo nivel que Inicio o Carta.

Problema:
- Es una tarea semanal, no diaria.
- En sidebar compite con Bodega y Cierre.

Decision:
- Mover dentro de Bodega o a un submenu.
- Mantener como herramienta semanal.
- En dashboard solo mostrar cuando haya razon: bajo minimo, incidencias, premium o stock raro.

### 6. Estadisticas

Estado actual:
- Resume escaneos, sommelier y feedback.
- Se solapa con Cierre y Dashboard ejecutivo.

Problema:
- El hostelero medio no necesita verlo cada dia.
- Sus datos importantes ya deberian convertirse en acciones.

Decision:
- Cambiar nombre a "Insights" o "Actividad".
- Mover bajo Sala o dentro de Inicio como vista secundaria.
- Evitar que sea una pestana principal.

### 7. Vinos

Estado actual:
- Es funcional, pero demasiado denso.
- Incluye importador, alta manual, lista, edicion, stock, bodega, precios, perfiles.
- Tiene muchas acciones en la misma pagina.

Problema:
- Gestionar vinos deberia ser una tabla simple y potente.
- El importador y el alta manual deberian estar ocultos hasta que el usuario los pida.
- Los campos de bodega duplican parte de Control de bodega.

Decision:
- Mantener como "Gestion de vinos".
- Arriba solo:
  - Buscar
  - Filtro
  - Importar
  - Anadir vino
- Bodega avanzada dentro de cada vino, plegada.
- El usuario no debe ver todos los campos avanzados de golpe.

### 8. Platos

Estado actual:
- Similar a Vinos.
- Tiene importacion, rasgos, categorias y edicion.

Problema:
- Es necesario, pero no deberia competir con la gestion de vinos.
- Los rasgos son potentes pero pueden parecer tecnicos.

Decision:
- Mantener dentro de "Carta".
- Mostrar rasgos como ayuda opcional.
- Cambiar copy para que el hostelero entienda que son "pistas para recomendar vino", no configuracion tecnica.

### 9. Seleccion destacada

Estado actual:
- Es util para empujar vinos en la carta publica.

Problema:
- No es una tarea diaria.
- En sidebar parece una seccion principal.

Decision:
- Mover a Carta o Ajustes.
- Mostrar como "Vinos destacados" dentro de Carta.

### 10. QR y Diseno

Estado actual:
- Son configuraciones.

Problema:
- Estan en el mismo nivel que tareas operativas.

Decision:
- Meter en Ajustes.
- No deben estar en navegacion principal.

### 11. Admin consultor

Estado actual:
- El radar, informes y propuestas son buenos.
- Pero parte del lenguaje consultor aparece en dashboard restaurante.

Problema:
- El restaurante puede sentir que la app le "vende" constantemente o le muestra demasiado diagnostico.

Decision:
- Mantener el radar y el informe solo para superadmin.
- En el restaurante, mostrar propuestas como valor recibido, no como "consultoria" constante.
- Evitar exceso de @cataconjuanjo dentro del panel interno. Mejor sutil en carta publica y propuestas.

## Duplicidades detectadas

1. Incidencias de sala:
   - Dashboard
   - Bodega
   - Cierre
   - Estadisticas

   Decision: resolver en Cierre, resumir en Dashboard, historico en Estadisticas.

2. Stock bajo / bajo minimo:
   - Dashboard
   - Bodega
   - Inventario
   - Vinos

   Decision: editar en Vinos/Bodega, contar en Inventario, alertar en Dashboard.

3. Propuestas consultor:
   - Dashboard
   - Bodega
   - Admin propuestas
   - Radar consultor

   Decision: crear y analizar en Admin; aceptar/rechazar en Bodega; no saturar Inicio.

4. Diagnostico de carta:
   - Dashboard
   - Radar
   - Informe

   Decision: dashboard solo resumen; radar/informe profundidad.

5. Estadisticas de sala:
   - Dashboard
   - Cierre
   - Estadisticas

   Decision: Cierre para accion, Estadisticas para historico, Dashboard solo alerta.

## Nueva experiencia recomendada para hostelero

### Inicio

Debe responder:
- Que pasa hoy.
- Que tengo que hacer ahora.
- Donde entro.

Bloques:
1. Prioridad de hoy.
2. Acciones pendientes.
3. Resumen de carta/bodega/sala.
4. Accesos principales.

Nada mas.

### Carta

Debe responder:
- Que vinos y platos tengo.
- Que falta para que el motor recomiende bien.

Subsecciones:
- Vinos
- Platos
- Vinos destacados

### Sala

Debe responder:
- Que paso en servicio.
- Que tengo que corregir despues.

Subsecciones:
- Cierre de servicio
- Actividad / estadisticas

### Bodega

Debe responder:
- Cuanto dinero hay en bodega.
- Que tengo que comprar.
- Donde pierdo margen.

Subsecciones:
- Control
- Inventario

### Ajustes

Debe responder:
- Como se ve la carta.
- Como accede el cliente.

Subsecciones:
- QR
- Diseno
- Hub / enlaces

## Cambios urgentes recomendados

### Fase 1 - Limpieza sin tocar datos

Impacto alto, riesgo bajo.

1. Reducir sidebar a 5 entradas principales.
2. Simplificar dashboard de inicio.
3. Quitar del inicio:
   - panel de consultoria
   - cobertura orientativa completa
   - segunda tanda de metricas
   - diagnostico largo visible por defecto
4. Convertir diagnostico en bloque plegable "Ver salud de carta".
5. Hacer "Referencias de bodega" plegable por defecto.
6. Quitar incidencias completas de Bodega y dejar enlace a Cierre.

### Fase 2 - Reorganizacion de modulos

Impacto alto, riesgo medio.

1. Crear agrupaciones:
   - /dashboard/carta
   - /dashboard/sala
   - /dashboard/bodega como hub
   - /dashboard/ajustes
2. Mantener rutas actuales para no romper enlaces.
3. Sidebar apunta a hubs, no a todas las pantallas.

### Fase 3 - Lenguaje y densidad visual

Impacto medio, riesgo bajo.

1. Reducir subtitulos largos.
2. Cambiar textos tecnicos por acciones.
3. Evitar repetir "consultoria" en panel restaurante.
4. Mantener frases de ayuda solo donde haya una accion.

## Orden de ejecucion recomendado

1. Primero: limpiar Inicio y Sidebar.
2. Segundo: limpiar Bodega.
3. Tercero: ocultar avanzada en Vinos/Platos.
4. Cuarto: crear hubs de Carta/Sala/Bodega/Ajustes si hace falta.

## Resultado esperado

La app debe sentirse asi:

- Entro.
- Veo 1 prioridad.
- Hago 1 accion.
- Si quiero profundizar, abro el modulo.

No:

- Entro.
- Me encuentro 20 metricas.
- No se si leer, corregir, comprar, imprimir o aceptar propuestas.

