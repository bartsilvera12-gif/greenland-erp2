-- =============================================================================
-- 7 datos de prueba para entregar a Bancard / Infonet Cobranzas.
-- Cubre los casos representativos: cuota pendiente, vencida, parcial, pagada,
-- y un cliente con multiples cuotas.
-- Idempotente: usa documento como llave de upsert.
-- =============================================================================

DO $do$
DECLARE
  v_empresa  uuid;
  v_cli1     uuid;
  v_cli2     uuid;
  v_cli3     uuid;
  v_cli4     uuid;
  v_cli5     uuid;
  v_cli6     uuid;
  v_cli7     uuid;
  v_venta    uuid;
BEGIN
  SELECT id INTO v_empresa FROM greenlanderp.empresas LIMIT 1;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'No hay empresa en greenlanderp.empresas'; END IF;

  -- ============ CLIENTES ============
  -- 1) Maria Lopez · 1111111 · 1 cuota pendiente
  INSERT INTO greenlanderp.clientes (empresa_id, empresa, nombre_contacto, documento, ruc)
  VALUES (v_empresa, 'Maria Lopez', 'Maria Lopez', '1111111', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_cli1 FROM greenlanderp.clientes WHERE empresa_id = v_empresa AND documento = '1111111' LIMIT 1;

  -- 2) Carlos Gimenez · 2222222 · 1 cuota vencida
  INSERT INTO greenlanderp.clientes (empresa_id, empresa, nombre_contacto, documento, ruc)
  VALUES (v_empresa, 'Carlos Gimenez', 'Carlos Gimenez', '2222222', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_cli2 FROM greenlanderp.clientes WHERE empresa_id = v_empresa AND documento = '2222222' LIMIT 1;

  -- 3) Ana Martinez · 3333333 · cuota parcialmente pagada
  INSERT INTO greenlanderp.clientes (empresa_id, empresa, nombre_contacto, documento, ruc)
  VALUES (v_empresa, 'Ana Martinez', 'Ana Martinez', '3333333', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_cli3 FROM greenlanderp.clientes WHERE empresa_id = v_empresa AND documento = '3333333' LIMIT 1;

  -- 4) Pedro Rodriguez · 4444444 · cuota ya pagada
  INSERT INTO greenlanderp.clientes (empresa_id, empresa, nombre_contacto, documento, ruc)
  VALUES (v_empresa, 'Pedro Rodriguez', 'Pedro Rodriguez', '4444444', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_cli4 FROM greenlanderp.clientes WHERE empresa_id = v_empresa AND documento = '4444444' LIMIT 1;

  -- 5) Constructora Aurora SA · RUC 80012345-6 · 3 cuotas pendientes
  INSERT INTO greenlanderp.clientes (empresa_id, empresa, nombre_contacto, documento, ruc)
  VALUES (v_empresa, 'Constructora Aurora SA', 'Juan Aurora', NULL, '80012345-6')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_cli5 FROM greenlanderp.clientes WHERE empresa_id = v_empresa AND ruc = '80012345-6' LIMIT 1;

  -- 6) Rodrigo Acosta · 5555555 · cuota chica (Gs 50.000) para probar pagos chicos
  INSERT INTO greenlanderp.clientes (empresa_id, empresa, nombre_contacto, documento, ruc)
  VALUES (v_empresa, 'Rodrigo Acosta', 'Rodrigo Acosta', '5555555', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_cli6 FROM greenlanderp.clientes WHERE empresa_id = v_empresa AND documento = '5555555' LIMIT 1;

  -- 7) Lucia Benitez · 6666666 · cuota grande (Gs 5.000.000)
  INSERT INTO greenlanderp.clientes (empresa_id, empresa, nombre_contacto, documento, ruc)
  VALUES (v_empresa, 'Lucia Benitez', 'Lucia Benitez', '6666666', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_cli7 FROM greenlanderp.clientes WHERE empresa_id = v_empresa AND documento = '6666666' LIMIT 1;

  -- ============ VENTAS + CUOTAS ============
  -- Helper inline: crear venta + cuota
  -- (las ventas requieren tipo_venta, total, moneda='GS')

  -- 1) Maria Lopez · pendiente
  INSERT INTO greenlanderp.ventas (empresa_id, cliente_id, numero_control, tipo_venta, total, moneda)
  VALUES (v_empresa, v_cli1, 'BNC-TEST-001', 'CREDITO', 1500000, 'GS') RETURNING id INTO v_venta;
  INSERT INTO greenlanderp.cuentas_por_cobrar (empresa_id, cliente_id, venta_id, numero_venta, fecha_emision, fecha_vencimiento, moneda, total, saldo, estado, numero_cuota, total_cuotas)
  VALUES (v_empresa, v_cli1, v_venta, 'BNC-TEST-001', CURRENT_DATE, CURRENT_DATE + 30, 'GS', 1500000, 1500000, 'pendiente', 1, 1)
  ON CONFLICT DO NOTHING;

  -- 2) Carlos Gimenez · vencida (vencimiento hace 10 dias)
  INSERT INTO greenlanderp.ventas (empresa_id, cliente_id, numero_control, tipo_venta, total, moneda)
  VALUES (v_empresa, v_cli2, 'BNC-TEST-002', 'CREDITO', 2000000, 'GS') RETURNING id INTO v_venta;
  INSERT INTO greenlanderp.cuentas_por_cobrar (empresa_id, cliente_id, venta_id, numero_venta, fecha_emision, fecha_vencimiento, moneda, total, saldo, estado, numero_cuota, total_cuotas)
  VALUES (v_empresa, v_cli2, v_venta, 'BNC-TEST-002', CURRENT_DATE - 40, CURRENT_DATE - 10, 'GS', 2000000, 2000000, 'pendiente', 1, 1)
  ON CONFLICT DO NOTHING;

  -- 3) Ana Martinez · parcial (pagó 800.000 de 2.000.000)
  INSERT INTO greenlanderp.ventas (empresa_id, cliente_id, numero_control, tipo_venta, total, moneda)
  VALUES (v_empresa, v_cli3, 'BNC-TEST-003', 'CREDITO', 2000000, 'GS') RETURNING id INTO v_venta;
  INSERT INTO greenlanderp.cuentas_por_cobrar (empresa_id, cliente_id, venta_id, numero_venta, fecha_emision, fecha_vencimiento, moneda, total, saldo, estado, numero_cuota, total_cuotas)
  VALUES (v_empresa, v_cli3, v_venta, 'BNC-TEST-003', CURRENT_DATE - 5, CURRENT_DATE + 25, 'GS', 2000000, 1200000, 'parcial', 1, 1)
  ON CONFLICT DO NOTHING;

  -- 4) Pedro Rodriguez · pagada
  INSERT INTO greenlanderp.ventas (empresa_id, cliente_id, numero_control, tipo_venta, total, moneda)
  VALUES (v_empresa, v_cli4, 'BNC-TEST-004', 'CREDITO', 1000000, 'GS') RETURNING id INTO v_venta;
  INSERT INTO greenlanderp.cuentas_por_cobrar (empresa_id, cliente_id, venta_id, numero_venta, fecha_emision, fecha_vencimiento, moneda, total, saldo, estado, numero_cuota, total_cuotas)
  VALUES (v_empresa, v_cli4, v_venta, 'BNC-TEST-004', CURRENT_DATE - 60, CURRENT_DATE - 30, 'GS', 1000000, 0, 'pagado', 1, 1)
  ON CONFLICT DO NOTHING;

  -- 5) Constructora Aurora · 3 cuotas (1 vencida, 2 por vencer)
  INSERT INTO greenlanderp.ventas (empresa_id, cliente_id, numero_control, tipo_venta, total, moneda)
  VALUES (v_empresa, v_cli5, 'BNC-TEST-005', 'CREDITO', 15000000, 'GS') RETURNING id INTO v_venta;
  INSERT INTO greenlanderp.cuentas_por_cobrar (empresa_id, cliente_id, venta_id, numero_venta, fecha_emision, fecha_vencimiento, moneda, total, saldo, estado, numero_cuota, total_cuotas)
  VALUES
    (v_empresa, v_cli5, v_venta, 'BNC-TEST-005-C1', CURRENT_DATE - 50, CURRENT_DATE - 5,  'GS', 5000000, 5000000, 'pendiente', 1, 3),
    (v_empresa, v_cli5, v_venta, 'BNC-TEST-005-C2', CURRENT_DATE - 50, CURRENT_DATE + 25, 'GS', 5000000, 5000000, 'pendiente', 2, 3),
    (v_empresa, v_cli5, v_venta, 'BNC-TEST-005-C3', CURRENT_DATE - 50, CURRENT_DATE + 55, 'GS', 5000000, 5000000, 'pendiente', 3, 3)
  ON CONFLICT DO NOTHING;

  -- 6) Rodrigo Acosta · cuota chica (Gs 50.000)
  INSERT INTO greenlanderp.ventas (empresa_id, cliente_id, numero_control, tipo_venta, total, moneda)
  VALUES (v_empresa, v_cli6, 'BNC-TEST-006', 'CREDITO', 50000, 'GS') RETURNING id INTO v_venta;
  INSERT INTO greenlanderp.cuentas_por_cobrar (empresa_id, cliente_id, venta_id, numero_venta, fecha_emision, fecha_vencimiento, moneda, total, saldo, estado, numero_cuota, total_cuotas)
  VALUES (v_empresa, v_cli6, v_venta, 'BNC-TEST-006', CURRENT_DATE, CURRENT_DATE + 15, 'GS', 50000, 50000, 'pendiente', 1, 1)
  ON CONFLICT DO NOTHING;

  -- 7) Lucia Benitez · cuota grande (Gs 5.000.000)
  INSERT INTO greenlanderp.ventas (empresa_id, cliente_id, numero_control, tipo_venta, total, moneda)
  VALUES (v_empresa, v_cli7, 'BNC-TEST-007', 'CREDITO', 5000000, 'GS') RETURNING id INTO v_venta;
  INSERT INTO greenlanderp.cuentas_por_cobrar (empresa_id, cliente_id, venta_id, numero_venta, fecha_emision, fecha_vencimiento, moneda, total, saldo, estado, numero_cuota, total_cuotas)
  VALUES (v_empresa, v_cli7, v_venta, 'BNC-TEST-007', CURRENT_DATE, CURRENT_DATE + 10, 'GS', 5000000, 5000000, 'pendiente', 1, 1)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Datos de prueba Bancard cargados OK';
END;
$do$;

-- Verificacion: listado de los 7 casos
SELECT
  cli.empresa AS cliente,
  COALESCE(cli.documento, cli.ruc) AS doc_o_ruc,
  cxc.numero_venta,
  cxc.fecha_vencimiento,
  cxc.total,
  cxc.saldo,
  cxc.estado
FROM greenlanderp.cuentas_por_cobrar cxc
JOIN greenlanderp.clientes cli ON cli.id = cxc.cliente_id
WHERE cxc.numero_venta LIKE 'BNC-TEST-%'
ORDER BY cxc.numero_venta;

-- Para limpiar despues:
-- DELETE FROM greenlanderp.cuentas_por_cobrar WHERE numero_venta LIKE 'BNC-TEST-%';
-- DELETE FROM greenlanderp.ventas WHERE numero_control LIKE 'BNC-TEST-%';
-- DELETE FROM greenlanderp.clientes WHERE documento IN ('1111111','2222222','3333333','4444444','5555555','6666666') OR ruc = '80012345-6';
