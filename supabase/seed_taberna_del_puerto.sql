-- ═══════════════════════════════════════════════════════════════════
-- SEED: La Taberna del Puerto — Demo completo Carta Viva
-- Cubre: vinos, platos, stock, estadísticas, alertas, propuestas
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_id UUID;

  -- IDs vinos (para estadísticas y movimientos)
  v_fino        UUID;
  v_manz1       UUID;
  v_manz2       UUID;
  v_amontillado UUID;
  v_oloroso     UUID;
  v_palo_cortado UUID;
  v_px          UUID;
  v_fino_rama   UUID;
  v_albarino1   UUID;
  v_albarino2   UUID;
  v_verdejo     UUID;
  v_garum       UUID;
  v_godello     UUID;
  v_txakoli     UUID;
  v_viura       UUID;
  v_cava1       UUID;
  v_cava2       UUID;
  v_bollinger   UUID;
  v_rosado1     UUID;
  v_zaco        UUID;
  v_faustino    UUID;
  v_riscal      UUID;
  v_condado     UUID;
  v_pitacum     UUID;
  v_juangil     UUID;
  v_chivite     UUID;
  v_vega        UUID;
  v_cims        UUID;
  v_rosado2     UUID;
  v_chardonnay  UUID;

BEGIN

  -- ─────────────────────────────────────────────────────────────
  -- 1. OBTENER ID DEL RESTAURANTE
  -- ─────────────────────────────────────────────────────────────
  SELECT id INTO v_id
  FROM restaurantes
  WHERE lower(nombre) LIKE '%taberna del puerto%'
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró "La Taberna del Puerto". Verifica el nombre en la tabla restaurantes.';
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- 2. ACTUALIZAR METADATOS DEL RESTAURANTE
  -- ─────────────────────────────────────────────────────────────
  UPDATE restaurantes SET
    ciudad              = 'El Puerto de Santa María',
    ticket_medio_comida = 42
  WHERE id = v_id;

  -- ─────────────────────────────────────────────────────────────
  -- 3. LIMPIAR DATOS EXISTENTES
  -- ─────────────────────────────────────────────────────────────
  DELETE FROM consultor_propuestas  WHERE restaurante_id = v_id;
  DELETE FROM estadisticas          WHERE restaurante_id = v_id;
  DELETE FROM alerts                WHERE restaurante_id = v_id;
  DELETE FROM vinos                 WHERE restaurante_id = v_id;
  DELETE FROM platos                WHERE restaurante_id = v_id;

  -- Tablas opcionales (solo si existen)
  BEGIN DELETE FROM movimientos_stock WHERE restaurante_id = v_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM recommendations   WHERE restaurante_id = v_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM kpi_history        WHERE restaurante_id = v_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM wine_performance   WHERE restaurante_id = v_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM wine_classifications WHERE restaurante_id = v_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM inventory_snapshots WHERE restaurante_id = v_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM opportunity_snapshots WHERE restaurante_id = v_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM consultant_diagnostics WHERE restaurante_id = v_id; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- ─────────────────────────────────────────────────────────────
  -- 4. VINOS (30 referencias)
  -- ─────────────────────────────────────────────────────────────

  -- ── GENEROSOS JEREZ (8) ──

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Fino Tío Pepe', 'González Byass', 'Generoso', 'Palomino Fino', NULL, 'Jerez-Xérès-Sherry', 19.50, 4.50, 6.50, 14, 6, 'González Byass', true, 'Fino seco y punzante, almendra verde, levadura fresca. El aperitivo icónico de Jerez.')
  RETURNING id INTO v_fino;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Manzanilla La Gitana', 'Hidalgo-La Gitana', 'Generoso', 'Palomino Fino', NULL, 'Manzanilla de Sanlúcar', 18.00, 4.00, 5.80, 12, 5, 'Hidalgo-La Gitana', true, 'Manzanilla clásica de Sanlúcar. Salinidad atlántica, floral, terminación seca y larga.')
  RETURNING id INTO v_manz1;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Manzanilla Solear Crianza', 'Bodegas Barbadillo', 'Generoso', 'Palomino Fino', NULL, 'Manzanilla de Sanlúcar', 21.00, 4.80, 7.20, 9, 4, 'Barbadillo', true, 'Manzanilla de crianza biológica prolongada. Mayor complejidad que una en rama, con recuerdos de pan tostado y mar.')
  RETURNING id INTO v_manz2;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Amontillado Los Arcos', 'Bodegas Lustau', 'Generoso', 'Palomino Fino', NULL, 'Jerez-Xérès-Sherry', 26.00, 6.00, 9.00, 7, 3, 'Lustau', true, 'Amontillado seco de crianza oxidativa. Nueces, caramelo seco, avellana tostada. Ideal con quesos curados.')
  RETURNING id INTO v_amontillado;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Oloroso Bailen', 'Williams & Humbert', 'Generoso', 'Palomino Fino', NULL, 'Jerez-Xérès-Sherry', 24.00, NULL, 8.50, 1, 3, 'Williams & Humbert', true, 'Oloroso seco y estructurado. Higos secos, cuero, tabaco. Perfectamente integrado con el tiempo.')
  RETURNING id INTO v_oloroso;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Palo Cortado Apostoles VORS', 'González Byass', 'Generoso', 'Palomino Fino / Pedro Ximénez', NULL, 'Jerez-Xérès-Sherry', 38.00, NULL, 14.00, 5, 2, 'González Byass', true, 'VORS de más de 30 años. Elegante encrucijada entre fino y oloroso. Complejísimo, largo y único.')
  RETURNING id INTO v_palo_cortado;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Pedro Ximénez Noé VORS', 'González Byass', 'Dulce', 'Pedro Ximénez', NULL, 'Jerez-Xérès-Sherry', 38.00, 6.50, 14.00, 6, 2, 'González Byass', true, 'PX de más de 30 años. Denso como el caramelo líquido. Pasas, chocolate negro, café. El mejor cierre de cena.')
  RETURNING id INTO v_px;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Fino en Rama La Bota Nº94', 'Equipo Navazos', 'Generoso', 'Palomino Fino', NULL, 'Jerez-Xérès-Sherry', 48.00, NULL, 18.00, 3, 2, 'Equipo Navazos', true, 'Selección especial de barrica única. Sin filtrar. La expresión más viva y auténtica del fino. Solo para amantes del género.')
  RETURNING id INTO v_fino_rama;

  -- ── BLANCOS (8) ──

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Albariño Pazo Señorans', 'Adegas Pazo Señorans', 'Blanco', 'Albariño', '2023', 'Rías Baixas', 29.00, 6.50, 9.50, 10, 4, 'Distribuciones Noroeste', true, 'El albariño de referencia. Floral, cítrico, melocotón blanco. Acidez fresca que alarga el maridaje con marisco.')
  RETURNING id INTO v_albarino1;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Albariño Martín Códax', 'Martín Códax', 'Blanco', 'Albariño', '2023', 'Rías Baixas', 24.00, NULL, 7.80, 8, 3, 'Distribuciones Noroeste', true, 'Versión más comercial y accesible. Lima, pera, toque mineral. Buena relación calidad-precio para la copa del día.')
  RETURNING id INTO v_albarino2;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Verdejo Nisia Rueda', 'Bodegas Nisia', 'Blanco', 'Verdejo', '2023', 'Rueda', 25.00, 5.50, 8.20, 7, 3, 'Castilla Vinos', true, 'Verdejo con crianza sobre lías. Herbáceo elegante, hinojo, toronja. Más complejidad que el verdejo joven de supermercado.')
  RETURNING id INTO v_verdejo;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Garum Blanco', 'Bodegas Barbadillo', 'Blanco', 'Palomino Fino', '2023', 'Cádiz', 26.00, NULL, 8.50, 5, 2, 'Barbadillo', true, 'Vino blanco seco de Palomino elaborado fuera del sistema de criaderas. Marino, cítrico, mineral. Orgullo local de Cádiz.')
  RETURNING id INTO v_garum;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Godello Guitián Sobre Lías', 'Bodegas La Tapada', 'Blanco', 'Godello', '2022', 'Valdeorras', 30.00, NULL, 10.50, 4, 2, 'Distribuciones Noroeste', true, 'Godello con 6 meses sobre lías. Mantecoso, frutas blancas maduras, mineral. Ideal con pescados a la brasa.')
  RETURNING id INTO v_godello;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Txakoli Txomin Etxaniz', 'Bodegas Txomin Etxaniz', 'Blanco', 'Hondarrabi Zuri', '2023', 'Getariako Txakolina', 27.00, NULL, 9.20, 4, 2, 'Distribuciones Norte', true, 'Txakoli con su característica efervescencia natural. Limón, hierba marina, ligerísimo toque de aguja. Aperitivo perfecto.')
  RETURNING id INTO v_txakoli;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Chardonnay Blume Penedès', 'Bodegas Blume', 'Blanco', 'Chardonnay', '2022', 'Penedès', 19.00, NULL, 6.20, 6, 3, 'Distribuciones Levante', true, 'Chardonnay sin madera, fresco y frutal. Manzana golden, albaricoque, floralidad. El blanco de entrada para quien no quiere complejidad.')
  RETURNING id INTO v_chardonnay;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Rioja Blanco Reserva 904', 'La Rioja Alta', 'Blanco', 'Viura', '2019', 'Rioja', 40.00, NULL, 14.50, 3, 2, 'La Rioja Alta Distribución', true, 'Blanco con crianza en barrica y botella. Manzana asada, vainilla, café con leche. Un blanco que evoluciona como un gran tinto.')
  RETURNING id INTO v_viura;

  -- ── ESPUMOSOS (3) ──

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Cava Brut Nature Juvé & Camps', 'Juvé & Camps', 'Espumoso', 'Xarel·lo / Macabeo / Parellada', '2021', 'Cava DO', 30.00, 7.00, 10.00, 8, 3, 'Distribuciones Levante', true, 'Cava de guarda de 24 meses. Pan tostado, manzana verde, brioche. Sin azúcar añadido. Versatil con aperitivos y mariscos.')
  RETURNING id INTO v_cava1;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Cava Terrers Brut Recaredo', 'Recaredo', 'Espumoso', 'Xarel·lo', '2019', 'Cava DO', 45.00, NULL, 16.00, 4, 2, 'Distribuciones Levante', true, 'Cava de añada larga crianza. Terroso, frutas confitadas, tostados profundos. El referente de Corpinnat para aficionados.')
  RETURNING id INTO v_cava2;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Champagne Bollinger Special Cuvée', 'Bollinger', 'Espumoso', 'Pinot Noir / Chardonnay / Pinot Meunier', NULL, 'Champagne AOC', 90.00, NULL, 42.00, 2, 1, 'Premium Imports', true, 'La gran cuvée de Bollinger. Manzana asada, brioche, nuez. Estructura y elegancia que justifican el precio.')
  RETURNING id INTO v_bollinger;

  -- ── ROSADOS (2) ──

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Rosado El Coto de Rioja', 'El Coto de Rioja', 'Rosado', 'Garnacha', '2023', 'Rioja', 16.00, 3.80, 5.20, 8, 4, 'La Rioja Alta Distribución', true, 'Rosado intenso de maceración corta. Frambuesa, sandía, fresa. El todo-terreno de la carta para quienes dudan entre blanco y tinto.')
  RETURNING id INTO v_rosado1;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Rosado Jean León 3055', 'Jean León', 'Rosado', 'Cabernet Sauvignon', '2023', 'Penedès', 22.00, NULL, 7.50, 4, 2, 'Distribuciones Levante', true, 'Rosado de cabernet sauvignon con más estructura. Granada, pétalos de rosa, toque especiado. Para paladares más exigentes.')
  RETURNING id INTO v_rosado2;

  -- ── TINTOS (9) ──

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Viña Zaco Tempranillo', 'Bodegas Bilbaínas', 'Tinto', 'Tempranillo', '2022', 'Rioja', 18.00, 4.20, 5.80, 12, 5, 'La Rioja Alta Distribución', true, 'Rioja joven sin madera. Cereza fresca, frambuesa, fácil de beber. El tinto de la casa por copas.')
  RETURNING id INTO v_zaco;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Faustino V Crianza', 'Bodegas Faustino', 'Tinto', 'Tempranillo', '2020', 'Rioja', 24.00, NULL, 8.20, 7, 3, 'La Rioja Alta Distribución', true, 'Crianza clásica riojana. Vainilla, coco, fruta roja madura. El blanco-y-negro en la sala: todo el mundo sabe lo que esperar.')
  RETURNING id INTO v_faustino;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Marqués de Riscal Reserva', 'Marqués de Riscal', 'Tinto', 'Tempranillo', '2019', 'Rioja', 36.00, NULL, 13.50, 5, 2, 'La Rioja Alta Distribución', true, 'Reserva de la casa más exportada del mundo. Cereza, tabaco, cuero. Un clásico que nunca falla para celebraciones.')
  RETURNING id INTO v_riscal;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Condado de Haza Crianza', 'Alejandro Fernández', 'Tinto', 'Tempranillo', '2020', 'Ribera del Duero', 28.00, NULL, 10.00, 5, 2, 'Ribera Distribuciones', true, 'Ribera del Duero de Alejandro Fernández. Ciruela negra, especias, taninos finos. Muy buena relación calidad-precio para la denominación.')
  RETURNING id INTO v_condado;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Pittacum Tinto', 'Bodegas Pittacum', 'Tinto', 'Mencía', '2021', 'Bierzo', 29.00, NULL, 10.50, 4, 2, 'Distribuciones Noroeste', true, 'Mencía del Bierzo. Elegante y frutal, violeta, frutas del bosque, mineral pizarroso. Para los que buscan algo diferente al rioja.')
  RETURNING id INTO v_pitacum;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Juan Gil Plata', 'Familia Gil', 'Tinto', 'Monastrell', '2022', 'Jumilla', 18.00, NULL, 6.00, 9, 3, 'Levante Vinos', true, 'Monastrell joven de Jumilla. Mora, ciruela, violeta, potente y goloso. El tinto del sur que sube notas de intensidad.')
  RETURNING id INTO v_juangil;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Chivite Colección 125 Reserva', 'Bodegas Chivite', 'Tinto', 'Tempranillo / Cabernet Sauvignon', '2018', 'Navarra', 48.00, NULL, 18.00, 3, 1, 'Premium Imports', true, 'La etiqueta de referencia de Chivite. Concentrado, elegante, largo. Cassis, cedro, especias finas. Para ocasiones especiales.')
  RETURNING id INTO v_chivite;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Vega Sicilia Valbuena 5º Año', 'Vega Sicilia', 'Tinto', 'Tempranillo / Merlot', '2018', 'Ribera del Duero', 120.00, NULL, 58.00, 2, 1, 'Premium Imports', true, 'El emblema del vino español. Crianza mínima de 5 años. Fruta negra, trufa, balsámico, eterno. La botella que cierra una gran cena.')
  RETURNING id INTO v_vega;

  INSERT INTO vinos (restaurante_id, nombre, bodega, tipo, uva, anada, region, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, activo, notas_cata)
  VALUES (v_id, 'Cims de Porrera Vi de Vila', 'Cims de Porrera', 'Tinto', 'Garnacha Negra / Cariñena', '2020', 'Priorat DOCa', 52.00, NULL, 20.00, 2, 1, 'Premium Imports', true, 'Priorat de pizarra y cariñena antigua. Mineral, profundo, licoroso. Los aficionados al Priorat lo conocen. Para los demás, es una revelación.')
  RETURNING id INTO v_cims;

  -- ─────────────────────────────────────────────────────────────
  -- 5. PLATOS (25 referencias)
  -- ─────────────────────────────────────────────────────────────
  INSERT INTO platos (restaurante_id, nombre, descripcion, precio, categoria, activo) VALUES
  -- Mariscos y moluscos
  (v_id, 'Gamba blanca de Huelva a la plancha', 'La reina del Mar Menor. Seis gambas blancas frescas, solo sal y plancha. Sin disfraces.', 28.00, 'Mariscos', true),
  (v_id, 'Navajas a la vinagreta de manzana', 'Navajas gallegas, vinagreta de manzana verde y eneldo fresco. Limpieza y salinidad.', 18.00, 'Mariscos', true),
  (v_id, 'Mejillones al vapor con fino', 'Mejillones de la ría de Galicia abiertos al vapor con fino Tío Pepe. Limón y perejil.', 14.00, 'Mariscos', true),
  (v_id, 'Media ración de ostras (3 uds)', 'Ostras atlánticas finas de Marennes-Oléron. Con hielo picado, limón y tabasco.', 22.00, 'Mariscos', true),
  -- Pescados
  (v_id, 'Urta a la roteña', 'El pescado de la bahía de Cádiz por excelencia. Horneado con tomate, pimiento y vino fino. Receta clásica del Puerto.', 32.00, 'Pescados', true),
  (v_id, 'Lenguado a la mantequilla de eneldo', 'Lenguado del Atlántico, mantequilla noisette, eneldo fresco y alcaparras. Cocina de producto puro.', 34.00, 'Pescados', true),
  (v_id, 'Boquerones fritos de la bahía', 'Boquerones frescos del día, harina de garbanzo, aceite de oliva virgen. Crujientes por fuera, tiernos por dentro.', 16.00, 'Fritos', true),
  (v_id, 'Cazón en adobo con mahonesa de ajo', 'El bienmesabe gaditano. Cazón macerado en especias y vinagre, frito en aceite de oliva.', 14.00, 'Fritos', true),
  (v_id, 'Pulpo a la brasa sobre crema de patata', 'Pulpo gallego cocido y braseado. Crema de patata con aceite de pimentón. Imprescindible.', 24.00, 'Pescados', true),
  (v_id, 'Atún rojo de almadraba a la brasa', 'Atún rojo de almadraba de Tarifa, vuelta y vuelta a la brasa. Solo con flor de sal.', 38.00, 'Pescados', true),
  (v_id, 'Lubina salvaje al horno con patatas panadera', 'Lubina salvaje atlántica entera, patatas en rodajas, cebolla confitada, vino blanco.', 36.00, 'Pescados', true),
  (v_id, 'Ceviche de corvina con leche de tigre', 'Corvina fresca marinada en lima, cilantro, jalapeño, cebolla morada. Fusión gaditana.', 18.00, 'Elaborados', true),
  -- Entrantes y tapas
  (v_id, 'Croquetas de jamón ibérico (6 uds)', 'Bechamel untuosa con jamón ibérico de bellota 100%. Crujiente. La carta de presentación de la casa.', 12.00, 'Entrantes', true),
  (v_id, 'Ensalada de tomates del huerto con ventresca', 'Tomates de temporada, ventresca de atún en aceite, aceitunas negras, alcaparras y orégano fresco.', 16.00, 'Ensaladas', true),
  (v_id, 'Alcachofas salteadas con jamón y ajo tierno', 'Alcachofas de Jerez, lonchas de jamón ibérico, ajo tierno, aceite de oliva virgen extra.', 15.00, 'Verduras', true),
  (v_id, 'Tabla de quesos andaluces (4 tipos)', 'Selección de quesos de Grazalema, oveja manchega curada, payoyo y queso fresco de cabra. Con membrillo y frutos secos.', 18.00, 'Quesos', true),
  (v_id, 'Pan de masa madre con mantequilla ahumada', 'Pan artesano de masa madre horneado cada día. Mantequilla ahumada con sal Maldon.', 4.50, 'Panadería', true),
  -- Carnes (pocas, es marisquería)
  (v_id, 'Presa ibérica a la brasa con pimientos de Padrón', 'Presa de cerdo ibérico de bellota a la brasa, pimientos de Padrón fritos, aceite de oliva.', 26.00, 'Carnes', true),
  (v_id, 'Secreto ibérico con patatas bravas caseras', 'Secreto ibérico de bellota marcado a la plancha, patatas bravas con dos salsas.', 22.00, 'Carnes', true),
  -- Postres
  (v_id, 'Tarta de queso payoyo al horno', 'Tarta de queso de cabra payoyo con base de galleta y coulis de frutos rojos. Textura cremosa perfecta.', 8.00, 'Postres', true),
  (v_id, 'Tocino de cielo de Jerez', 'El postre más icónico de la cocina jerezana. Yema de huevo caramelizada, textura sedosa.', 7.00, 'Postres', true),
  (v_id, 'Brownie de chocolate 70% con helado de vainilla', 'Brownie de chocolate de origen, crujiente por fuera, fundente por dentro. Helado artesano de vainilla.', 9.00, 'Postres', true),
  (v_id, 'Flan casero de la abuela', 'Flan de huevo y leche entera, caramelo artesano, nata montada. Sin trampa ni cartón.', 6.50, 'Postres', true),
  -- Bebidas complemento
  (v_id, 'Agua mineral (75 cl)', 'Agua mineral natural Sierra Nevada', 2.50, 'Bebidas', true),
  (v_id, 'Café espresso o cortado', 'Café de especialidad de tueste medio. Origen Etiopía-Colombia.', 2.00, 'Bebidas', true);

  -- ─────────────────────────────────────────────────────────────
  -- 6. MOVIMIENTOS DE STOCK (últimos 90 días)
  -- ─────────────────────────────────────────────────────────────
  BEGIN
    -- Entradas de mercancía (compras al proveedor)
    INSERT INTO movimientos_stock (restaurante_id, vino_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, created_at)
    VALUES
      (v_id, v_fino,        'entrada', 12, 2, 14, 'Compra mensual González Byass',          NOW() - INTERVAL '28 days'),
      (v_id, v_manz1,       'entrada', 12, 0, 12, 'Reposición Hidalgo semanal',              NOW() - INTERVAL '25 days'),
      (v_id, v_manz2,       'entrada',  6, 3,  9, 'Pedido Barbadillo',                       NOW() - INTERVAL '20 days'),
      (v_id, v_albarino1,   'entrada', 12, 0, 10, 'Pedido temporada albariño 2023',           NOW() - INTERVAL '22 days'),
      (v_id, v_cava1,       'entrada',  6, 3,  8, 'Compra espumosos para temporada alta',    NOW() - INTERVAL '18 days'),
      (v_id, v_zaco,        'entrada', 12, 2, 12, 'Reposición mensual tintos casa',          NOW() - INTERVAL '30 days'),
      (v_id, v_rosado1,     'entrada',  6, 4,  8, 'Pedido rosados verano',                   NOW() - INTERVAL '15 days'),
      (v_id, v_verdejo,     'entrada',  6, 2,  7, 'Compra rueda temporal alta',              NOW() - INTERVAL '19 days'),
      (v_id, v_px,          'entrada',  6, 1,  6, 'Reposición PX para postres',              NOW() - INTERVAL '32 days'),
      (v_id, v_amontillado, 'entrada',  6, 2,  7, 'Pedido Lustau trimestral',                NOW() - INTERVAL '45 days');

    -- Ventas registradas (los más vendidos generan muchos movimientos)
    INSERT INTO movimientos_stock (restaurante_id, vino_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, created_at)
    SELECT v_id, vino, 'venta', 1, stock_ant, stock_ant - 1, 'Venta servicio noche', ts
    FROM (
      SELECT
        CASE (i % 7)
          WHEN 0 THEN v_fino
          WHEN 1 THEN v_manz1
          WHEN 2 THEN v_albarino1
          WHEN 3 THEN v_zaco
          WHEN 4 THEN v_cava1
          WHEN 5 THEN v_verdejo
          ELSE v_rosado1
        END AS vino,
        8 + (i % 5) AS stock_ant,
        NOW() - ((i * 4) || ' hours')::INTERVAL AS ts
      FROM generate_series(1, 60) i
    ) sub;

    -- Mermas y ajustes
    INSERT INTO movimientos_stock (restaurante_id, vino_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, created_at)
    VALUES
      (v_id, v_fino,    'merma',  1, 15, 14, 'Botella rota en servicio',           NOW() - INTERVAL '10 days'),
      (v_id, v_manz2,   'merma',  1, 10,  9, 'Merma apertura copa sin terminar',   NOW() - INTERVAL '7 days'),
      (v_id, v_cava1,   'merma',  1,  9,  8, 'Cata interna staff',                 NOW() - INTERVAL '5 days'),
      (v_id, v_oloroso, 'ajuste',-2,  3,  1, 'Ajuste inventario físico — diferencia de stock', NOW() - INTERVAL '3 days');

  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- ─────────────────────────────────────────────────────────────
  -- 7. ESTADÍSTICAS DE USO (últimos 30 días)
  --    Genera ~550 eventos reales: escaneos, ventas, sommelier, sala
  -- ─────────────────────────────────────────────────────────────

  -- Escaneos QR carta digital (~15 por servicio × 30 días)
  INSERT INTO estadisticas (restaurante_id, tipo, detalle, created_at)
  SELECT
    v_id,
    'escaneo',
    jsonb_build_object(
      'vino_id', CASE ((i + 3) % 12)
        WHEN 0  THEN v_fino
        WHEN 1  THEN v_manz1
        WHEN 2  THEN v_albarino1
        WHEN 3  THEN v_cava1
        WHEN 4  THEN v_zaco
        WHEN 5  THEN v_verdejo
        WHEN 6  THEN v_manz2
        WHEN 7  THEN v_rosado1
        WHEN 8  THEN v_amontillado
        WHEN 9  THEN v_albarino2
        WHEN 10 THEN v_faustino
        ELSE         v_px
      END,
      'dispositivo', CASE (i % 3) WHEN 0 THEN 'iOS' WHEN 1 THEN 'Android' ELSE 'Web' END
    ),
    NOW() - ((i * 1.3) || ' hours')::INTERVAL
  FROM generate_series(1, 480) i;

  -- Ventas marcadas por sala (~5 por servicio × 30 días)
  INSERT INTO estadisticas (restaurante_id, tipo, detalle, created_at)
  SELECT
    v_id,
    'venta',
    jsonb_build_object(
      'vino_id', CASE ((i + 1) % 8)
        WHEN 0 THEN v_fino
        WHEN 1 THEN v_manz1
        WHEN 2 THEN v_albarino1
        WHEN 3 THEN v_zaco
        WHEN 4 THEN v_cava1
        WHEN 5 THEN v_verdejo
        WHEN 6 THEN v_manz2
        ELSE        v_rosado1
      END,
      'resultado', CASE (i % 10)
        WHEN 9 THEN 'no_stock'
        WHEN 8 THEN 'no_convence'
        ELSE        'vendida'
      END,
      'cantidad', 1
    ),
    NOW() - ((i * 4.8) || ' hours')::INTERVAL
  FROM generate_series(1, 180) i;

  -- Peticiones al sommelier IA (~1 por servicio)
  INSERT INTO estadisticas (restaurante_id, tipo, detalle, created_at)
  VALUES
    (v_id, 'sommelier', '{"pregunta":"¿Qué vino va bien con el atún de almadraba?","vino_sugerido":"Albariño Pazo Señorans","confianza":0.92}'::jsonb, NOW() - INTERVAL '1 day'),
    (v_id, 'sommelier', '{"pregunta":"Un vino para gambas blancas","vino_sugerido":"Fino Tío Pepe","confianza":0.96}'::jsonb, NOW() - INTERVAL '2 days'),
    (v_id, 'sommelier', '{"pregunta":"Algo para el cliente que pide champán pero no tiene presupuesto","vino_sugerido":"Cava Juvé & Camps","confianza":0.88}'::jsonb, NOW() - INTERVAL '3 days'),
    (v_id, 'sommelier', '{"pregunta":"Maridaje con la urta a la roteña","vino_sugerido":"Garum Blanco","confianza":0.85}'::jsonb, NOW() - INTERVAL '4 days'),
    (v_id, 'sommelier', '{"pregunta":"Vino dulce para el tocino de cielo","vino_sugerido":"Pedro Ximénez Noé","confianza":0.97}'::jsonb, NOW() - INTERVAL '5 days'),
    (v_id, 'sommelier', '{"pregunta":"¿Qué diferencia hay entre fino y manzanilla?","vino_sugerido":"Manzanilla La Gitana","confianza":0.94}'::jsonb, NOW() - INTERVAL '6 days'),
    (v_id, 'sommelier', '{"pregunta":"Tinto ligero que no mate el sabor del pulpo","vino_sugerido":"Pittacum Tinto","confianza":0.82}'::jsonb, NOW() - INTERVAL '8 days'),
    (v_id, 'sommelier', '{"pregunta":"El mejor vino de la carta para una celebración","vino_sugerido":"Vega Sicilia Valbuena","confianza":0.91}'::jsonb, NOW() - INTERVAL '10 days'),
    (v_id, 'sommelier', '{"pregunta":"¿Qué es el txakoli? Un cliente pregunta","vino_sugerido":"Txakoli Txomin Etxaniz","confianza":0.89}'::jsonb, NOW() - INTERVAL '12 days'),
    (v_id, 'sommelier', '{"pregunta":"Vino para compartir entre cuatro, mariscos variados","vino_sugerido":"Albariño Pazo Señorans","confianza":0.93}'::jsonb, NOW() - INTERVAL '14 days'),
    (v_id, 'sommelier', '{"pregunta":"Un rosado que no sea muy dulce","vino_sugerido":"Rosado Jean León 3055","confianza":0.86}'::jsonb, NOW() - INTERVAL '16 days'),
    (v_id, 'sommelier', '{"pregunta":"Alternativa al rioja para la presa ibérica","vino_sugerido":"Condado de Haza Crianza","confianza":0.84}'::jsonb, NOW() - INTERVAL '18 days'),
    (v_id, 'sommelier', '{"pregunta":"¿Tenemos algo local de Cádiz para un cliente que lo pide?","vino_sugerido":"Garum Blanco","confianza":0.95}'::jsonb, NOW() - INTERVAL '20 days'),
    (v_id, 'sommelier', '{"pregunta":"Copa de amontillado para acompañar la tabla de quesos","vino_sugerido":"Amontillado Los Arcos","confianza":0.93}'::jsonb, NOW() - INTERVAL '22 days'),
    (v_id, 'sommelier', '{"pregunta":"El champán está agotado, ¿qué ofrezco?","vino_sugerido":"Cava Recaredo Terrers","confianza":0.87}'::jsonb, NOW() - INTERVAL '24 days');

  -- Dudas de sala (clientes que preguntaron por vinos)
  INSERT INTO estadisticas (restaurante_id, tipo, detalle, created_at)
  VALUES
    (v_id, 'sala', '{"duda":"Cliente preguntó por diferencia entre palo cortado y amontillado. No sabíamos explicarlo bien.","vino_id":null}'::jsonb, NOW() - INTERVAL '2 days'),
    (v_id, 'sala', '{"duda":"Mesa pidió el Fino en Rama y no sabíamos describirlo vs el Tío Pepe","vino_id":null}'::jsonb, NOW() - INTERVAL '5 days'),
    (v_id, 'sala', '{"duda":"Cliente preguntó si el txakoli es vasco o gallego","vino_id":null}'::jsonb, NOW() - INTERVAL '9 days'),
    (v_id, 'sala', '{"duda":"No supimos explicar qué es un VORS cuando el cliente preguntó por el PX Noé","vino_id":null}'::jsonb, NOW() - INTERVAL '13 days'),
    (v_id, 'sala', '{"duda":"Mesa preguntó por maridaje del ceviche. Dudamos entre albariño y manzanilla.","vino_id":null}'::jsonb, NOW() - INTERVAL '17 days'),
    (v_id, 'sala', '{"duda":"Cliente extranjero preguntó por vinos 100% locales de Cádiz. Le pusimos el Garum pero no lo conocíamos bien.","vino_id":null}'::jsonb, NOW() - INTERVAL '21 days');

  -- ─────────────────────────────────────────────────────────────
  -- 8. ALERTAS ACTIVAS (mix de severidades)
  -- ─────────────────────────────────────────────────────────────
  INSERT INTO alerts (restaurante_id, entidad_tipo, entidad_id, severidad, clave, titulo, detalle, impacto, accion_sugerida, estado, veces_detectada, ultima_deteccion_at, created_at)
  VALUES
    -- CRÍTICAS
    (v_id, 'vino', v_oloroso, 'critica',
      'stock_bajo_minimo_oloroso',
      'Stock crítico: Oloroso Bailen',
      'Solo queda 1 botella de Oloroso Bailen (mínimo configurado: 3). Riesgo de rotura en el próximo servicio.',
      'Pérdida de ventas estimada 3-4 botellas/semana. Impacto en visibilidad del oloroso en carta.',
      'Pedir al menos 6 unidades a Williams & Humbert esta semana.',
      'abierta', 3, NOW() - INTERVAL '3 days', NOW() - INTERVAL '8 days'),

    (v_id, 'carta', NULL, 'critica',
      'sin_blanco_local_copa',
      'Ningún blanco local disponible por copa',
      'La Taberna del Puerto está en El Puerto de Santa María y no tiene ningún vino blanco de Cádiz disponible por copas. El Garum Blanco de Barbadillo no está marcado como copa disponible.',
      'Los clientes que piden copa de vino blanco no reciben una opción local. Pérdida de identidad territorial y oportunidad de diferenciación.',
      'Activar Garum Blanco como disponible por copas. Precio copa sugerido: 5.50 EUR (margen 65%).',
      'abierta', 1, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),

    -- AVISOS
    (v_id, 'carta', NULL, 'aviso',
      'postre_sin_vino_dulce_copa',
      'Postre activo sin vino dulce por copa para maridaje',
      'La carta tiene 4 postres activos (tarta de queso, tocino de cielo, brownie, flan). Solo el PX Noé está disponible por copas como opción dulce. Es la única referencia de cierre.',
      'Riesgo de upselling perdido: el 30-40% de las mesas piden postre y un maridaje de copa en ese momento puede generar +6-8 EUR por cubierto.',
      'Considerar añadir un Moscatel o un segundo vino dulce por copas. Opción inmediata: Cream Harveys a 4 EUR copa o habilitar el Amontillado para el tocino de cielo.',
      'abierta', 2, NOW() - INTERVAL '5 days', NOW() - INTERVAL '10 days'),

    (v_id, 'vino', v_bollinger, 'aviso',
      'stock_inmovilizado_champagne',
      'Champagne Bollinger sin ventas en 30 días',
      'Bollinger Special Cuvée: 2 botellas en stock, 0 ventas en los últimos 30 días. Coste inmovilizado: 84 EUR.',
      'Capital parado. Si la tendencia continúa, en 60 días habrá que rebajar o retirar.',
      'Visibilizar en carta con una descripción más atractiva. O crear una propuesta de "Celebración con champán" con precio especial para grupos. Si en 30 días sigue sin moverse, devolver al proveedor o convertir en copa en reserva.',
      'abierta', 1, NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),

    (v_id, 'carta', NULL, 'aviso',
      'staff_sin_formacion_jerez',
      'Personal necesita formación en generosos de Jerez',
      '6 dudas de sala registradas en los últimos 30 días, 4 de ellas relacionadas con generosos (amontillado vs palo cortado, VORS, fino en rama). El establecimiento está en la meca del jerez y el personal no puede explicar la carta.',
      'Pérdida de confianza del cliente cuando pregunta y no obtiene respuesta. Especialmente grave con clientes internacionales.',
      'Organizar una cata interna de 90 minutos enfocada en los 8 generosos de la carta. Priorizar: diferencias fino/manzanilla, qué es VORS, cómo describir el palo cortado. Plazo recomendado: próximas 2 semanas.',
      'abierta', 1, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),

    (v_id, 'vino', v_palo_cortado, 'aviso',
      'palo_cortado_baja_rotacion',
      'Palo Cortado Apostoles: venta muy baja',
      'Apostoles VORS: solo 1 botella vendida en los últimos 30 días. Stock 5 botellas, días de cobertura estimados: 150. Por encima del umbral de exceso (120 días).',
      'Capital inmovilizado: 70 EUR. Margen alto (63%) pero sin rotación. Riesgo de añejamiento en bodega o necesidad de ajuste de carta.',
      'Incluir en la descripción de la carta el argumento VORS (más de 30 años de solera). Sugerirlo activamente con la tabla de quesos y platos de caza. Si no mejora en 30 días, considerar reducir stock a 3 botellas y no reponer hasta salida.',
      'abierta', 2, NOW() - INTERVAL '6 days', NOW() - INTERVAL '14 days'),

    -- INFORMATIVAS
    (v_id, 'carta', NULL, 'info',
      'oportunidad_copa_generosos',
      'Oportunidad: ampliar generosos por copa',
      'Actualmente 4 generosos disponibles por copa (Fino, Manzanilla ×2, Amontillado, PX). El restaurante está en El Puerto de Santa María. Hay margen para añadir el Oloroso y el Palo Cortado como copas premium (una vez repuesto el stock).',
      'Los generosos por copa son el diferencial competitivo del establiemciento. Cada copa adicional puede generar +3-5 EUR por mesa que ya tomaba aperitivo.',
      'Propuesta concreta: una vez resuelto el stock crítico del Oloroso, activarlo como copa a 5.50 EUR. Crear una sección visible "Rincón del Jerez" en la carta con descripción de cada tipo.',
      'abierta', 1, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),

    (v_id, 'carta', NULL, 'info',
      'precio_hueco_35_50',
      'Hueco de precios entre 30-48 EUR en tintos',
      'La carta de tintos tiene un salto entre el Condado de Haza (28 EUR) y el Chivite (48 EUR). El segmento 30-45 EUR no está cubierto. Es el rango de celebración de gasto medio-alto.',
      'Clientes con presupuesto de 35-40 EUR por botella no encuentran opción óptima. O suben a 48 EUR (forzado) o bajan a 28 EUR (sin disfrutar el gasto que querían hacer).',
      'Estudiar incorporar un Ribera del Duero Reserva o un Rioja Gran Reserva en el rango 32-40 EUR. Alternativa con potencial: Raúl Pérez o algún Bierzo de guarda.',
      'abierta', 1, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),

    (v_id, 'carta', NULL, 'info',
      'concentracion_proveedor_alta',
      'Alta concentración en González Byass y Barbadillo',
      'González Byass aporta 3 referencias, Barbadillo 2 (incluyendo el Garum). Juntos representan el 37% de la carta en generosos y un alto porcentaje del valor.',
      'Dependencia moderada (cerca del umbral 40%). Si hay problemas de suministro o subida de precios, la sección de generosos queda muy expuesta.',
      'Para diversificar sin cambiar mucho: incorporar un fino o manzanilla de Lustau, Valdespino o Sánchez Romate. El catálogo de Lustau es el más fácil de conseguir.',
      'abierta', 1, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days'),

    (v_id, 'carta', NULL, 'info',
      'vega_sicilia_oportunidad_storytelling',
      'Vega Sicilia: la botella más cara necesita contexto',
      'El Valbuena está a 120 EUR en carta. Es la única botella por encima de 90 EUR. Sin descripción ni argumento de venta asociado, los clientes no lo piden.',
      'Una botella a 120 EUR que no se vende no es un problema de precio: es un problema de comunicación. En la carta actual aparece igual que cualquier otro tinto.',
      'Añadir una nota en la carta que contextualice: "Vega Sicilia: la finca más icónica de España desde 1864. Crianza mínima de 5 años. Para la cena que merece ser recordada." El storytelling justifica el precio.',
      'abierta', 1, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days');

  -- ─────────────────────────────────────────────────────────────
  -- 9. PROPUESTAS DEL CONSULTOR (oportunidades comerciales)
  -- ─────────────────────────────────────────────────────────────
  INSERT INTO consultor_propuestas (restaurante_id, titulo, vino, tipo, zona, proveedor_sugerido, coste_estimado, precio_recomendado, margen_objetivo, plato_objetivo, motivo, prioridad, estado)
  VALUES
    (v_id,
      'Manzanilla En Rama para temporada alta',
      'Manzanilla La Gitana En Rama',
      'Generoso', 'Sanlúcar de Barrameda',
      'Hidalgo-La Gitana', 8.50, 26.00, 67,
      'Gambas blancas, navajas, ostras',
      'La versión en rama es la más auténtica del generoso. En verano el cliente avanzado la busca y paga más por ella. Puede entrar como referencia de temporada a precio premium, con rotación garantizada en julio-agosto.',
      'alta', 'interesa'),

    (v_id,
      'Oloroso dulce para ampliar oferta de copas postres',
      'Medium Dry Fernando de Castilla',
      'Generoso', 'Jerez de la Frontera',
      'Bodegas Fernando de Castilla', 7.50, 22.00, 66,
      'Tocino de cielo, tarta de queso, brownie',
      'El restaurante tiene 4 postres activos y solo el PX cubre el cierre dulce. Un oloroso medium-dry a 5 EUR copa sería la alternativa para quienes no quieren algo tan denso como el PX.',
      'alta', 'propuesta'),

    (v_id,
      'Añadir Manzanilla Pasada como referencia premium de sala',
      'Manzanilla Pasada Pastora',
      'Generoso', 'Sanlúcar de Barrameda',
      'Bodegas Medina', 9.00, 28.00, 68,
      'Atún de almadraba, urta a la roteña, pulpo a la brasa',
      'La manzanilla pasada tiene crianza biológica prolongada que la acerca al amontillado pero conserva la salinidad de Sanlúcar. El perfil es ideal para platos de pescado cocinados, con más grasa o sabor. Diferencial frente a la competencia.',
      'media', 'propuesta'),

    (v_id,
      'Ribera del Duero Reserva para cubrir hueco 35-45 EUR',
      'Hacienda Monasterio Reserva',
      'Tinto', 'Ribera del Duero',
      'Bodegas Hacienda Monasterio', 16.00, 42.00, 62,
      'Presa ibérica, secreto ibérico',
      'La carta de tintos tiene un salto injustificado entre los 28 y 48 EUR. Este Reserva de Peter Sisseck cubre ese hueco con un vino de referencia con muy buena imagen. El cliente que celebra pero no llega al Chivite tiene ahora una alternativa digna.',
      'alta', 'propuesta'),

    (v_id,
      'Txakoli para aperitivo y mariscos en temporada verano',
      'Ameztoi Rubentis Txakoli Rosado',
      'Rosado', 'Getariako Txakolina',
      'Distribuciones Norte', 10.00, 28.00, 64,
      'Navajas, mejillones, ostras, aperitivo',
      'El rosado de txakoli de Ameztoi es el más vendido de España por su atractivo visual (color salmón brillante) y su acidez punzante ideal con mariscos. En verano es una referencia aspiracional que justifica el precio.',
      'media', 'propuesta'),

    (v_id,
      'Godello Sobre Lías para sustituir Chardonnay bajo margen',
      'Avancia Godello Barrica',
      'Blanco', 'Monterrei',
      'Bodegas Jorge Ordóñez', 8.00, 25.00, 68,
      'Lenguado, lubina al horno, ceviche',
      'El Chardonnay Blume tiene margen del 67% pero muy baja rotación. Un Godello con crianza en barrica tiene perfil más interesante para nuestra cocina, precio similar y mayor margen percibido por el cliente. Cambio de calidad sin cambio de precio.',
      'baja', 'propuesta'),

    (v_id,
      'Pedro Ximénez joven para copa aperitivo o vermut alternativo',
      'Pedro Ximénez Tres Miradas',
      'Dulce', 'Montilla-Moriles',
      'Bodegas Pérez Barquero', 5.50, 16.00, 66,
      'Tabla de quesos, croquetas, como aperitivo',
      'Un PX joven de Montilla-Moriles a precio accesible puede entrar como copa de aperitivo inusual. Los clientes que piden vermut serían buenos candidatos. Copa a 4 EUR, rotación alta y margen bueno.',
      'baja', 'propuesta'),

    (v_id,
      'Cava rosado para ampliar la propuesta de celebraciones',
      'Juvé & Camps Cava Rosé Brut',
      'Espumoso', 'Cava DO',
      'Juvé & Camps', 11.00, 32.00, 66,
      'Aperitivo, celebraciones, cumpleaños',
      'La carta actual tiene 2 cavas blancos. No hay rosado espumoso. En bodas, aniversarios y cumpleaños el cava rosado es la petición más frecuente de los comensales jóvenes. Un hueco fácil de cubrir.',
      'media', 'incorporada');

  -- ─────────────────────────────────────────────────────────────
  -- CONFIRMACIÓN
  -- ─────────────────────────────────────────────────────────────
  RAISE NOTICE '✓ La Taberna del Puerto actualizada correctamente.';
  RAISE NOTICE '  → Restaurante ID: %', v_id;
  RAISE NOTICE '  → Vinos cargados: 30';
  RAISE NOTICE '  → Platos cargados: 25';
  RAISE NOTICE '  → Estadísticas generadas: ~700 eventos (30 días)';
  RAISE NOTICE '  → Alertas activas: 10';
  RAISE NOTICE '  → Propuestas del consultor: 8';
  RAISE NOTICE '';
  RAISE NOTICE 'SIGUIENTE PASO: Abre el panel consultor de La Taberna del Puerto';
  RAISE NOTICE 'y pulsa "Recalcular y guardar" para generar KPIs, diagnóstico,';
  RAISE NOTICE 'clasificaciones de vinos y oportunidad económica automáticamente.';

END $$;
