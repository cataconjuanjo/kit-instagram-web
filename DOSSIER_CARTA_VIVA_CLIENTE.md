# Dossier de presentacion - Carta Viva

## 1. Idea principal

Carta Viva no es solo una carta digital. Es un sistema para que el restaurante convierta su carta de vinos en una herramienta viva de venta, servicio y diferenciacion.

La propuesta se resume en tres capas:

1. Carta de vinos interactiva para clientes.
2. Herramientas internas para sala y gestion.
3. Acompanamiento consultivo para mejorar rentabilidad, coherencia y experiencia.

Mensaje clave:

> Mantenemos la facilidad de un QR, pero sustituimos el PDF estatico por una carta viva, editable, medible y pensada para vender mejor.

## 2. Problema actual del restaurante

Muchos restaurantes tienen ahora sus cartas en PDFs o enlaces tipo Campsite/Linktree.

Eso funciona para mostrar informacion, pero tiene limitaciones:

- El PDF no recomienda.
- No ayuda a vender.
- No se adapta al cliente.
- Es dificil de actualizar.
- No da informacion sobre escaneos o uso.
- No conecta carta de platos y carta de vinos.
- No ayuda al camarero a defender referencias.
- No detecta oportunidades de rentabilidad.

Carta Viva respeta lo que el restaurante ya tiene, pero anade inteligencia, gestion y criterio.

## 3. Que incluye Carta Viva

### Carta de vinos publica

URL de ejemplo:

```text
https://cataconjuanjo.com/carta/slug-restaurante
```

Funcionalidades:

- Carta de vinos accesible por QR.
- Filtros por tipo de vino.
- Busqueda y navegacion sencilla.
- Precios por copa y botella.
- Informacion de bodega, region, uva y anada.
- Notas de cata y venta.
- Seleccion destacada de vinos recomendados.
- Comparador de vinos.
- Vista responsive para movil.

Valor para el restaurante:

- La carta deja de ser un PDF plano.
- El cliente puede explorar mejor.
- Se facilita la venta de referencias concretas.
- Se mejora la percepcion profesional del restaurante.

### Modo camarero

URL de ejemplo:

```text
https://cataconjuanjo.com/camarero/slug-restaurante
```

Funcionalidades:

- Vista privada para sala.
- Busqueda rapida de vinos.
- Busqueda de platos.
- Recomendaciones de maridaje.
- Comparador para defender vinos ante el cliente.
- Argumentos utiles para vender sin tecnicismos excesivos.
- Gestion rapida de stock desde el servicio.

Valor para el restaurante:

- El camarero no necesita saberse toda la carta de memoria.
- La venta sugerida se vuelve mas facil.
- Se reducen respuestas genericas tipo "este esta muy bueno".
- Ayuda a formar equipo nuevo o temporal.

### Dashboard del restaurante

URL:

```text
https://cataconjuanjo.com/login
```

Funcionalidades:

- Gestion de vinos.
- Alta, edicion y ocultacion de referencias.
- Control de precios, copa, botella y stock.
- Importacion de carta desde PDF, JPG, PNG o WebP.
- Gestion de platos.
- Importacion de carta de comida.
- Personalizacion visual.
- Generacion de QR.
- Estadisticas basicas.
- Seleccion destacada de vinos.

Valor para el restaurante:

- No depende de terceros para cambiar la carta.
- Puede actualizar precios, stock o referencias al momento.
- Centraliza la informacion de sala y cliente.
- Reduce friccion operativa.

### Hub publico tipo link en bio

URL de ejemplo:

```text
https://cataconjuanjo.com/r/slug-restaurante
```

Es opcional por restaurante.

Funcionalidades:

- Sustituye o complementa herramientas tipo Campsite o Linktree.
- Botones personalizados:
  - Carta restaurante.
  - Carta de vinos.
  - Carta gintonics.
  - Reservas.
  - Menus para grupos.
  - Carta de alergenos.
  - Ubicacion.
  - PDFs o enlaces externos.
- Iconos sociales para Instagram y Facebook.
- Diseno adaptado a la marca del restaurante.

Valor para el restaurante:

- Puede mantener todo lo que ya tiene en Instagram.
- Solo cambia el enlace de la bio.
- Carta Viva se integra sin obligarle a migrar todo de golpe.

### Superadmin para Cata con Juanjo

Funcionalidades internas:

- Crear restaurantes nuevos.
- Crear usuario y contrasena de acceso.
- Editar restaurantes existentes.
- Activar o desactivar hub publico.
- Gestionar enlaces del hub.
- Entrar al dashboard de cualquier restaurante.
- Ver carta publica y modo sala.

Valor para Cata con Juanjo:

- Alta de clientes mas rapida.
- Menos dependencia de Supabase.
- Control centralizado de todos los restaurantes.

### Radar de consultoria

URL:

```text
https://cataconjuanjo.com/admin/consultoria
```

Panel privado para Cata con Juanjo.

Detecta oportunidades como:

- Falta de vino local.
- Falta de vinos dulces para postres.
- Pocos vinos por copa.
- Exceso de Rioja/Ribera.
- Tintos demasiado parecidos.
- Falta de generosos o espumosos para frituras.
- Falta de blancos gastronomicos.
- Carta premium poco defendida.
- Vinos sin perfil de cata.
- Vinos sin precio, stock o anada.

Valor:

- Convierte la app en una herramienta de deteccion de oportunidades.
- Ayuda a vender auditorias, redisenos, formacion y seleccion de proveedores.
- Permite llegar al restaurante con argumentos concretos, no con una propuesta generica.

## 4. Como seria la transicion desde su sistema actual

Si el restaurante ya usa Campsite, Linktree o PDFs:

1. Se replica su estructura actual en el hub de Carta Viva.
2. Se mantiene lo que ya funciona:
   - reservas,
   - carta restaurante,
   - menus,
   - alergenos,
   - redes sociales.
3. Se sustituye la carta de vinos PDF por Carta Viva interactiva.
4. El restaurante cambia el enlace de Instagram por:

```text
https://cataconjuanjo.com/r/slug-restaurante
```

5. El QR del local puede apuntar al hub o directamente a la carta de vinos.

Mensaje comercial:

> No os obligo a cambiar vuestra forma de trabajar de golpe. Centralizamos lo que ya teneis y mejoramos la parte del vino para que venda mas y se gestione mejor.

## 5. Guion recomendado para la demo

### Paso 1 - Enseñar el hub

Mostrar:

```text
/r/slug-restaurante
```

Explicar:

- Esto sustituye al enlace de Instagram.
- Aqui pueden vivir reservas, cartas, alergenos, menus y redes.
- Es opcional. Si no lo necesitan, no se activa.

Frase:

> La idea es no quitaros lo que ya teneis, sino ordenarlo dentro de una herramienta vuestra.

### Paso 2 - Enseñar carta de vinos publica

Mostrar:

```text
/carta/slug-restaurante
```

Explicar:

- Ya no es un PDF.
- Es una carta viva.
- El cliente puede filtrar, comparar y descubrir.
- La carta puede destacar vinos que interese vender.

Frase:

> El cliente sigue entrando por QR, pero ahora no ve un archivo muerto: ve una carta pensada para ayudarle a elegir.

### Paso 3 - Enseñar modo camarero

Mostrar:

```text
/camarero/slug-restaurante
```

Explicar:

- Herramienta interna para sala.
- Ayuda a recomendar vinos por plato.
- Mejora la venta sugerida.
- Sirve como apoyo de formacion.

Frase:

> Esto no sustituye al camarero. Le da argumentos para vender mejor.

### Paso 4 - Enseñar dashboard

Mostrar:

```text
/dashboard
```

Explicar:

- Alta y edicion de vinos.
- Importacion desde PDF o foto.
- Gestion de platos.
- QR.
- Personalizacion.

Frase:

> Si cambia una referencia, un precio o un stock, no hay que rehacer un PDF ni esperar a nadie.

### Paso 5 - Enseñar radar consultoria solo si procede

Este panel es privado. No hace falta ensenarlo completo al cliente, pero puede servir para preparar la reunion.

Usarlo para decir:

> He detectado varias oportunidades concretas en vuestra carta: aqui hay margen para vender mas vino local, mejorar maridajes con postres y ordenar mejor los estilos de tintos.

## 6. Beneficios para el restaurante

- Mejor experiencia para el cliente.
- Carta actualizable.
- Menos dependencia de PDFs.
- Mejor venta sugerida.
- Mas argumentos para sala.
- Mejor gestion de stock y referencias.
- Posibilidad de mantener sus enlaces actuales.
- Imagen mas profesional.
- Base para futuras consultorias.

## 7. Beneficios para Cata con Juanjo

- Producto digital propio.
- Entrada recurrente en restaurantes.
- Diferenciacion frente a una simple consultoria.
- Datos para detectar oportunidades.
- Relacion continua con el cliente.
- Puerta a servicios premium:
  - auditoria de carta,
  - rediseno,
  - formacion,
  - seleccion de bodegas,
  - programa de vinos por copa,
  - experiencias y catas.

## 8. Objeciones posibles y respuesta

### "Ya tenemos la carta en PDF"

Respuesta:

> Perfecto. No hace falta tirarlo todo. Podemos mantener el PDF de comida y transformar primero la carta de vinos en una herramienta viva.

### "Ya usamos Campsite"

Respuesta:

> Lo podemos replicar dentro de Carta Viva. Cambiais el enlace de Instagram y seguis teniendo reservas, cartas y redes, pero con la carta de vinos integrada.

### "No tenemos tiempo para cargar todo"

Respuesta:

> Podemos importar desde PDF o foto y dejar una primera version funcional. Luego se revisa y se afina.

### "Nuestro equipo no sabe mucho de vino"

Respuesta:

> Precisamente por eso tiene sentido. El modo camarero ayuda a defender referencias y crear venta sugerida sin depender solo de memoria o experiencia.

### "No queremos algo complicado"

Respuesta:

> Para el cliente es un QR. Para sala es una herramienta sencilla. La complejidad queda detras, no delante.

## 9. Posible cierre comercial

> Mi propuesta no es solo digitalizar vuestra carta. Es convertir vuestra oferta de vinos en una herramienta mas clara para el cliente, mas util para sala y mas rentable para el negocio. Podemos empezar manteniendo lo que ya teneis y mejorando la carta de vinos como primera fase.

## 10. Tarifas orientativas

Para un restaurante independiente:

| Plan | Precio mensual | Enfoque |
| --- | ---: | --- |
| Basico | 59 EUR/mes | Carta digital viva con QR y ArmonIA para el cliente. |
| Sala | 99 EUR/mes | Todo el plan Basico, modo camarero, bodega, inventario y seguimiento operativo. |
| Acompanado | Desde 199 EUR/mes | Software, seguimiento consultivo y ajustes profesionales continuos. |

La configuracion inicial se valora segun el volumen y el estado de la carta. En el plan Acompanado esta incluida.

Los descuentos de lanzamiento, si procede ofrecerlos durante la fase inicial, se comunican de forma privada y no forman parte de la tarifa publica.

## 11. Checklist para la demo

- Abrir `/r/slug` si el hub esta activado.
- Abrir `/carta/slug`.
- Mostrar filtros y comparador.
- Mostrar seleccion destacada.
- Abrir `/camarero/slug`.
- Buscar un plato y recomendar vino.
- Entrar al dashboard.
- Mostrar importador de PDF/JPG.
- Mostrar gestion de vinos.
- Mostrar QR.
- Mencionar que el hub es opcional.
- Preparar 2 o 3 oportunidades concretas del restaurante antes de la reunion.
