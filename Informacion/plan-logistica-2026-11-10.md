# Plan de Logística · Ecoase

**Fecha:** 10 de noviembre de 2026  
**Alcance:** pantallas, reglas, cálculos y datos de Logística. Las otras áreas siguen registrando producción, HT y stock; Logística lee esos datos para decidir qué se puede cargar.

## 1. Qué pasa hoy

- **Asignar transporte** muestra `order.requested` como “Palets”. **Viajes de la semana** muestra la suma de `shipment_lines.planned_quantity`. Son cantidades pedidas o planificadas, no pallets listos para subir al camión.
- Los viajes ya tienen estados `Planificado → Pronto → Cargado → En viaje → Entregado`. Al pasar a **Pronto**, el servidor comprueba y reserva stock listo. Esa comprobación llega demasiado tarde para planificar visualmente la carga.
- La capacidad actual usa un número de pallets y cupos diarios por transporte interno o proveedor externo. No distingue vehículos propios, clase de pallet, carga mixta ni una segunda vuelta del mismo camión.
- El producto tiene medida, pero no una clase logística explícita. Los proveedores de transporte no guardan ubicación; los clientes tienen dirección y departamento, sin coordenadas verificadas.
- Ya existe un calendario de entregas con semana/mes y arrastre. El calendario de Logística debe reutilizar esa interacción, pero organizar los viajes por **camión y turno**.

## 2. Navegación propuesta

Dentro de **Logística**: **Asignar · Calendario · Mapa · Límites**. “Viajes de la semana” pasa a ser la vista de **Calendario**, conservando el listado de viajes como panel/detalle del día. No se duplica un segundo calendario genérico.

1. **Asignar:** pedidos pendientes y viajes; cada línea muestra pedido, listo para cargar, pendiente de HT, en HT si se puede identificar, y todavía no producido/abastecido. Acción “Planificar carga”.
2. **Calendario:** filas por vehículo propio; columnas por día, con viajes 1 y 2 cuando sean viables. Las tarjetas muestran destino, horario, tamaño de pallet, carga prevista y estado físico. Vista mensual compacta para panorama. Arrastrar cambia fecha con validación y motivo.
3. **Mapa:** origen en el centro de distribución de Paysandú; destinos de proveedores y clientes según el tipo de viaje. Ruta, tiempos de ida y vuelta, carga/descarga y solapamientos del vehículo/chofer. Resultado **Viable / Ajustado / No viable / Sin datos**, siempre con motivo; “dos viajes” se calcula con horarios reales configurados.
4. **Límites:** vehículos, chofer habitual, capacidad por clase y reglas de carga; configuración de terceros y excepciones de medida. La capacidad se expresa **por viaje**, no como total diario.

## 3. Límites iniciales por viaje

| Vehículo | Chofer habitual | Pallets chicos | Pallets grandes 220 × 117 |
|---|---|---:|---:|
| HOWO grande | Sin chofer fijo | 638 | 273 |
| Volkswagen camión | Susalla | 638 | 273 |
| Volkswagen tractor | Giossa | 560 | 251 |
| Internacional | Sin chofer fijo | 638 | 273 |

Los terceros se cargan individualmente, sin un límite inventado. **638 es el máximo de chicos por viaje para los tres camiones indicados**; el tractor tiene su propio máximo. Un segundo viaje del mismo camión ocupa otro intervalo horario y requiere regreso y tiempo suficiente para recargar.

### Clase de pallet

- **Chico:** 120 × 100 cm o menor; **122 × 102 cm** se incluye por excepción explícita.
- **Grande:** 220 × 117 cm, incluido AFB. Otras medidas grandes se incorporan como excepciones verificadas.
- **Sin clasificar:** otras medidas (por ejemplo 120 × 120, 130 × 120 o 220 × 120) se muestran para clasificación manual en Límites. No inferir capacidad solo por superficie: apilado, peso y forma también importan.
- Una carga con chicos y grandes no recibe capacidad automática hasta definir la regla de mezcla. Mientras tanto, el sistema muestra ambas cantidades y pide revisión manual; jamás suma 638 + 273 como si fueran cupos independientes.

## 4. Disponibilidad real por pedido y producto

Cada producto del pedido debe tener un desglose **mutuamente excluyente** y reconciliado contra la cantidad pendiente de entregar:

| Estado visible | Qué significa |
|---|---|
| Listos para cargar | Stock físico `ready`, reservado para ese pedido o disponible para asignar, sin usar reservas de otros viajes. |
| Pendientes de HT | Ya existen físicamente, requieren HT y todavía no tienen el tratamiento confirmado. |
| En HT | Subconjunto de los anteriores con una tanda en curso, si el registro permite identificarla; no sumarlo otra vez al total. |
| Sin producir/abastecer | Cantidad pendiente que todavía no existe físicamente para ese pedido. |
| Planificados para otro viaje | Stock listo que ya está comprometido; se muestra como aviso, no como libre. |

El cálculo debe reconciliar **producción real por línea y destino**, entradas de stock, tandas de HT, reservas activas, despachos y entregas. Los saldos generales de un producto pueden compartirse entre clientes: no atribuirlos a un pedido concreto sin reserva o asignación. Si falta trazabilidad para una parte, mostrar **“sin asignar / por verificar”** en vez de llamarla lista. Ejemplo visual de un pedido de 500: 180 listos + 120 pendientes de HT + 200 sin producir = 500; las cifras del boceto son ilustrativas.

Una tarjeta de viaje muestra **previsto / cargable ahora / faltante**, desglosado por producto y clase. Se puede planificar con producción futura, pero **Confirmar carga** solo permite unidades listas, sin duplicar reservas y dentro del límite del vehículo. Al confirmar se registra cantidad efectiva por línea y diferencia frente al plan; el estado actual `Cargado` se conserva.

## 5. Completar el espacio que sobra

En “Planificar carga”, seleccionar un **producto de relleno** y pulsar “Completar espacio”. La sugerencia es el mínimo entre espacio restante del camión, saldo del pedido aún no asignado a viajes y stock listo libre de ese producto. Se muestra la cuenta antes de guardar. La persona puede ajustar la cifra y confirma la carga efectiva. Si el producto requiere HT pendiente, no se ofrece como físicamente cargable. La sugerencia no crea un pedido ni mueve stock por sí sola.

Para carga homogénea: `libres = límite del vehículo/clase − unidades ya planificadas de esa clase`. Para carga mixta, usar la regla operativa acordada con Ecoase; no aplicar una conversión aproximada sin validarla.

## 6. Mapa y factibilidad de viajes

1. Guardar la dirección exacta y coordenadas verificadas del **centro de distribución**, y geocodificar los destinos usados en Logística. Diferenciar visita a proveedor, entrega a cliente y retiro por el cliente.
2. Configurar hora de inicio/fin del turno, descansos, tiempo de carga, descarga y margen operativo por vehículo/chofer. La estimación incluye salida, paradas, vuelta al centro y recarga antes del segundo viaje.
3. Consultar un servicio de rutas para tiempo por carretera; registrar hora de consulta, distancia y tiempo estimado. Ajustar manualmente y dejar constancia de la decisión. Si no hay dirección exacta o falla el servicio, mostrar “Sin datos” y permitir planificación manual marcada como tal.
4. Evaluar colisiones del mismo vehículo y del mismo chofer; considerar restricciones de atención del destino. El mapa presenta ruta y lista de paradas, sin depender del dibujo para comunicar tiempo o estado.
5. **Pamer:** etiquetar “retira cliente / flete a cargo del cliente” cuando corresponda. No consumir capacidad de la flota propia ni simular un recorrido nuestro; sí programar retiro y disponibilidad física. Confirmar ubicación del punto de retiro.

## 7. Secuencia de implementación

1. **Datos y reglas:** entidades de vehículo/chofer, límites por clase, excepciones de productos y modalidad de retiro; migración con los cuatro vehículos anteriores. Evitar reusar el proveedor “Susalla” como si fuera el camión.
2. **Cálculo de carga:** servicio único que cruza cantidades de pedido, producción real, HT, stock y reservas. Exponer estados por línea y pruebas de conservación de cantidades.
3. **Límites y Asignar:** editor de límites, clasificación y ficha por pedido con cantidades físicas. Plan de carga y sugerencia de relleno; validación en servidor al guardar/confirmar.
4. **Calendario:** vehículos como filas, viajes por día y horario, vista semanal y mensual; reprogramación con auditoría. Mantener viajes anteriores y remitos existentes.
5. **Mapa:** direcciones y horarios, cálculo de ruta y disponibilidad de dos viajes; estados “Sin datos” hasta contar con ubicación y tiempos fiables.
6. **Verificación:** probar 638/273 y 560/251, pedidos mixtos, reserva simultánea de dos viajes, HT aún pendiente, viaje 2 imposible por horario, retiro Pamer, tercero sin límite y pantallas angostas sin scroll horizontal.

## 8. Decisiones que faltan para cerrar las reglas

1. **Mezcla:** ¿se mezclan chicos y grandes en un mismo camión? Si sí, ¿qué equivalencia o tabla de combinaciones usan realmente y qué limitaciones de peso/apilado hay?
2. **Relleno:** ¿el producto que completa el camión debe pertenecer al mismo pedido/cliente o puede ser de otro pedido compatible con la ruta?
3. **Mapa:** ¿la prioridad es ir a buscar pallets a proveedores, entregar a clientes, o ambas? ¿Cuál es la dirección exacta del centro de distribución y del retiro de Pamer?
4. **Dos vueltas:** ¿qué horario de trabajo, tiempo típico de carga/descarga y pausas se deben usar? ¿Los choferes de HOWO e Internacional se asignan viaje por viaje?

## Bocetos

- `boceto-logistica-limites.svg`: límites iniciales, terceros y excepciones de medida.
- `boceto-logistica-calendario.svg`: agenda por camión y detalle físico del pedido.
- `boceto-logistica-mapa.svg`: ruta y evaluación de una o dos vueltas; diseño esquemático sin distancias reales.

Los bocetos son propuestas visuales; no representan datos actuales del sistema ni rutas geográficas verificadas.
