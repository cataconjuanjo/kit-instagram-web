# Carta Viva - Exportación fiel desde lámina aprobada

Fuente utilizada: `source/imagen-aprobada-original.png`.

Criterio de producción:
- No se ha rediseñado el logo.
- Los PNG se han extraído de la lámina aprobada y se han limpiado para uso transparente donde procede.
- Los SVG/PDF se han generado por trazado vectorial de la imagen aprobada. El texto queda convertido a contornos/trazados: no depende de fuentes instaladas.
- Ningún SVG contiene imágenes raster incrustadas.

Limitación técnica honesta:
Al partir de una imagen PNG aprobada, no existe una fuente vectorial original perfecta. Por tanto, los SVG son vectorizados desde píxeles: visualmente siguen la lámina aprobada, pero no son el archivo maestro original que tendría un diseñador en Illustrator/Figma.

Texto revisado en la lámina aprobada:
- Carta Viva
- LA CARTA DE VINOS QUE VIVE Y VENDE
- CARTA DIGITAL, SALA Y BODEGA BAJO CONTROL
- LA CARTA DE VINOS QUE VIVE, RECOMIENDA Y VENDE

Carpetas:
- vector/: SVG vectorial real, con texto trazado.
- pdf/: PDF vectorial generado desde SVG.
- web/: PNG para web.
- icons/: favicons y app icons.
- comparison/: lámina comparativa y render SVG.
- source/: imagen aprobada original y crops de referencia.
