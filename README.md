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

`/mcp` expone un servidor MCP completo del dashboard: todo lo que se puede ver o hacer en la aplicación se puede hacer desde Claude (67 herramientas). Cada herramienta llama a la misma ruta de `/api/*` que usa la pantalla, así que respeta las mismas validaciones y efectos.

**Qué cubre**

- Lectura: pedidos (listado, detalle e historial), calendario, capacidad, recursos, logística (salidas, vehículos, choferes, disponibilidad), stock y movimientos, catálogo y niveles, clientes y proveedores, secadero y HT, y una `guia_operativa` con el flujo y las reglas.
- Pedidos: crear, editar, cancelar, eliminar y registrar novedades.
- Producción: planificar, mover asignaciones y registrar lo realmente producido.
- Secadero y HT: programar, registrar HT, registrar lo no realizado y revertir lotes.
- Logística: asignar transporte, crear, editar, avanzar y reprogramar viajes, agendar salidas, calcular rutas y configurar flota, jornada y límites.
- Stock: entradas, ajustes y reversiones.
- Capacidad: recursos, reglas de rendimiento, secadero, cupos de viajes y ajustes por día.
- Maestros: clientes, productos habilitados y controles, catálogo, niveles de clasificación y proveedores.

Capacidad, stock y fechas son advertencias: las herramientas guardan igual e informan. Solo se rechaza lo incoherente (más unidades que las del pedido, datos inválidos, resultado real con fecha futura). Las herramientas que borran, cancelan o revierten están marcadas como destructivas para que Claude pida confirmación.

**Permisos**

| Variable de entorno | Efecto |
| --- | --- |
| `ECOASE_MCP_TOKEN` | Token con permiso de lectura y escritura. |
| `ECOASE_MCP_READ_TOKEN` | Token de solo lectura (opcional). |
| ninguna | El MCP queda abierto pero solo de lectura. Las herramientas de escritura no se registran. |

Con algún token configurado, cada pedido debe enviar `Authorization: Bearer <token>`; sin él responde 401. Generá un token con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` y cargalo como variable de entorno del servidor (nunca en el código). El token es compartido: quién hizo cada cambio se registra con el campo `responsable` de las herramientas (por defecto «Claude (MCP)»), no con una identidad individual. Importante: el token protege solo `/mcp`; las rutas `/api/*` de la aplicación no tienen autenticación.

**Desde el celular (y la web de Claude)**

La app de Claude se conecta por OAuth, no por encabezados. El servidor ya lo incluye, sin base de datos (los códigos y tokens son datos firmados; rotar `ECOASE_MCP_TOKEN` cierra todas las sesiones):

1. En claude.ai (web, con la cuenta que usan): Configuración → Conectores → Agregar conector personalizado. Nombre `Ecoase` y URL `https://dashboardoperativo.vercel.app/mcp`. No hace falta completar la configuración avanzada.
2. Claude abre la página «Conectar Claude a Ecoase»: se escribe el código de acceso (`ECOASE_MCP_PASSWORD`; también sirve `ECOASE_MCP_TOKEN` para escritura o `ECOASE_MCP_READ_TOKEN` para solo lectura).
3. El conector queda disponible en la app del celular con la misma cuenta, a cualquier hora. La sesión dura 90 días y se renueva sola al usarla.

Variables: `ECOASE_MCP_PASSWORD` (código para escribir al conectar, más fácil de tipear que el token) y `ECOASE_PUBLIC_URL` (dirección pública, para que los enlaces de OAuth no dependan del dominio con el que se entre).

**Conexión**

- Claude Code (la dirección de producción es la primera; `ecoase.vercel.app` solo redirige): `claude mcp add --transport http ecoase https://dashboardoperativo.vercel.app/mcp --header "Authorization: Bearer TU_TOKEN"`
- Claude Desktop: los conectores personalizados de la interfaz no permiten enviar un encabezado propio; usá el puente `mcp-remote` en `claude_desktop_config.json`: `{ "mcpServers": { "ecoase": { "command": "npx", "args": ["-y", "mcp-remote", "https://dashboardoperativo.vercel.app/mcp", "--header", "Authorization:${ECOASE_AUTH}"], "env": { "ECOASE_AUTH": "Bearer TU_TOKEN" } } } }`
- Pruebas locales: iniciá la aplicación y conectá MCP Inspector a `http://localhost:3000/mcp` con Streamable HTTP. Los tests son `npm run test:mcp` (incluye un pedido completo de punta a punta).

Las herramientas de archivos (subir planos o fotos) no están en el MCP; se hacen desde la pantalla de Clientes.

El esquema está versionado en `supabase/migrations` y los datos iniciales en `supabase/seed.sql`. Las pruebas de endpoints usan un almacenamiento temporal aislado para no modificar la base real.

## Despliegue en Vercel

`vercel.json` configura Vite, las funciones de `/api/*` y `/mcp`, y las rutas directas de la aplicación. Si se autoriza un despliegue futuro, las variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` deben configurarse únicamente en el entorno del servidor. La migración de producción real ya está aplicada en Supabase; el código de la aplicación sigue local.
