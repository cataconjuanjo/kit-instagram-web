-- Tema esmeralda premium para Araboka Restaurante
-- Restaurante ID: 7af94e33-48cd-43b8-b939-4796ba58e4d8
-- Ejecutar en Supabase SQL Editor (usa service key, bypassa RLS)
--
-- Verificar estado actual antes de aplicar:
-- SELECT id, nombre, color_primario, color_acento, color_fondo, tipografia, logo_url
-- FROM restaurantes WHERE id = '7af94e33-48cd-43b8-b939-4796ba58e4d8';

UPDATE restaurantes
SET
  color_primario = '#0E4A38',  -- esmeralda oscuro: hero, header, tabs activos, comparador, nav activo
  color_acento   = '#1F7A5C',  -- esmeralda medio: precio, chips activos, CTA "Probar", burbuja sumiller
  logo_url       = 'https://arabokarestaurante.com/wp-content/uploads/2019/05/araboka-1.png',
  tipografia     = 'garamond'  -- Cormorant Garamond, la tipografía "carta de vino" del sistema
WHERE id = '7af94e33-48cd-43b8-b939-4796ba58e4d8';

-- color_fondo se deja intacto (NULL = usa el crema #fffaf0 por defecto, que es lo que pide el brief)
