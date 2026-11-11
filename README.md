# Ecoase Dashboard

Dashboard web de control operativo construido con React y Vite. La interfaz cambia de sección sin recargar el documento. La API y MCP se ejecutan en Node.

## Desarrollo local

Requiere Node.js `>=22.13.0`.

```bash
npm install
```

Creá un archivo `.env.local` con:

```bash
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_PUBLISHABLE_KEY=tu-clave-publicable
```

Luego iniciá la aplicación:

```bash
npm run dev
```

La aplicación, la API y MCP quedan disponibles en `http://localhost:3000`. Vite recarga los módulos del servidor al modificarlos y actualiza el listado de rutas al agregar o quitar un archivo de API.

La operación comienza en `/calendario`. La navegación sigue las fases del pedido (barra de áreas y subpestañas):

1. Productos: `/productos`, `/niveles`, `/clientes`, `/proveedores`.

Cada producto se identifica por los niveles de la planilla PRODUCTOS: Medida, Modelo, Taco, Refuerzo, Identificación, Corte esquina, Terminación, Espesor, Exportación y Tratamiento. Se editan en `/niveles`, una tabla donde cada columna es un nivel y cada fila una opción. El catálogo usa códigos numéricos en el orden del árbol. Tratamiento queda vacío cuando la fuente indica «-»; Exportación implica Con HT. El nombre se arma con los niveles completos en el orden de la tabla.
2. Producción: `/produccion` (planificación por pedido y calendario interno), `/produccion?vista=semanal` (producción real), `/produccion?vista=recursos` y `/produccion?vista=reglas`.
3. Stock: `/stock`.
4. Secadero: `/secadero` (programación de tratamiento térmico / marcado) y `/secadero?vista=registro`.
5. Logística: `/logistica` (asignar transporte interno o externo) y `/logistica?vista=viajes`.

Un pedido nuevo sólo pide cliente, productos y entrega; la producción y el transporte se definen después y aparecen como pendientes en sus pestañas. Las rutas históricas `/plan`, `/capacidad` y `/tratamiento` redirigen a la vista equivalente.

En el calendario de producción, cada tarjeta muestra el producto y las unidades previstas. El detalle conserva el pedido y el cliente. En Producción real, las asignaciones de la semana aparecen precargadas: se registra la fecha, la cantidad efectivamente producida y si se destina al cliente original o a stock. También se puede marcar que no se produjo. El resultado crea una sola entrada física en stock cuando la cantidad es mayor que cero. Lo que falte del pedido queda disponible para volver a planificar. El registro se guarda en el servidor mediante `POST /api/production-allocations/:id/result` y requiere la migración `20261105210829_daily_production_results.sql` en la base que use la aplicación.

## Comandos

- `npm run dev`: servidor local con recarga automática.
- `npm run build`: comprueba tipos y genera la aplicación web en `dist/`.
- `npm run start`: sirve localmente `dist/`, `/api/*` y `/mcp` desde un solo puerto.
- `npm run lint`: valida el código.
- `npm test`: ejecuta pruebas de datos, compilación y endpoints.
- `npm run test:e2e`: verifica navegación y rutas directas en un navegador.

## API

- `GET /api/orders`: lista pedidos.
- `POST /api/orders`: agrega un pedido.
- `PATCH /api/orders/:id`: actualiza fecha, cantidad, etapa o transportista.
- `GET /api/orders/:id/history`: historial de cambios del pedido.
- `GET /api/history`: pedidos completados.
- `GET /api/clients`: resumen por cliente.
- `GET /api/calendar`: agenda operativa.
- `GET /api/logistics`: entregas y transportes.
- `GET /api/providers`: proveedores y tipo de abastecimiento.

Los pedidos, sus líneas, los proveedores y el historial de cambios se guardan en Supabase. Las vistas de clientes, calendario, logística, producción, marcado y stock se calculan a partir de esos datos.

## MCP de Ecoase

La aplicación expone un servidor MCP de solo lectura en `/mcp`. Está pensado para el piloto operativo con ChatGPT y Claude y ofrece estas herramientas:

- `resumen_operativo`: pedidos, entregas y alertas para un período de hasta 50 días.
- `listar_pedidos_en_riesgo`: atrasos y alertas de HT, producción o transporte.
- `ver_pedido`: detalle operativo por ID, referencia o cliente.
- `listar_clientes`: clientes y productos habilitados.
- `consultar_stock`: saldos pendientes de HT, listos, reservados y disponibles por producto.

Para probarlo localmente, iniciá la aplicación y conectá MCP Inspector a `http://localhost:3000/mcp` usando Streamable HTTP. También podés ejecutar `npm run test:mcp`.

Esta primera versión no modifica datos. Antes de habilitar herramientas de escritura se deben agregar autenticación individual, permisos y auditoría.

El esquema está versionado en `supabase/migrations` y los datos iniciales en `supabase/seed.sql`. Las pruebas de endpoints usan un almacenamiento temporal aislado para no modificar la base real.

## Despliegue en Vercel

`vercel.json` configura Vite, las funciones de `/api/*` y `/mcp`, y las rutas directas de la aplicación. Si se autoriza un despliegue futuro, las variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` deben configurarse únicamente en el entorno del servidor. La migración de producción real ya está aplicada en Supabase; el código de la aplicación sigue local.
