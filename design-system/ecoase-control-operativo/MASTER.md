# Control Operativo: sistema visual

Identidad de la aplicación operativa de Ecoase. `AGENTS.md` conserva las reglas funcionales y de accesibilidad obligatorias.

## Carácter

- Industrial moderno: preciso, legible y sobrio.
- La información operativa determina la jerarquía. Los estados críticos tienen texto explícito.
- Una misma familia de componentes se repite en Inicio, Pedidos, Calendario, Producción, Stock, Secadero y Logística.

## Colores

| Token | Valor | Uso |
|---|---|---|
| `--brand-white` | `#FFFFFF` | Superficies de trabajo |
| `--brand-gray` | `#F4F6F8` | Fondo de encabezados y agrupaciones |
| `--brand-slate` | `#41515E` | Navegación lateral y controles secundarios |
| `--brand-yellow` | `#FFCA08` | Acciones principales y datos destacados |
| `--brand-black` | `#26343E` | Texto sobre superficies claras y amarillas |

La referencia visual es un panel de fabricación de fondo blanco, encabezados gris frío, gráficos amarillos y grafito. Rojo, azul y verde se reservan para estados operativos, con rótulos legibles. Los bordes usan gris neutro. El amarillo nunca se usa como texto pequeño sobre blanco.

## Tipografía

- Familia única: Archivo Variable, alojada en el paquete de la aplicación.
- Texto base: 16 px con altura de línea 1.5. Tablas: 14 px. Etiquetas: mínimo 12 px.
- Título de página: 26 a 30 px. Títulos de sección: 18 a 20 px. Cifras principales: 28 a 32 px.
- Cantidades, fechas y códigos usan números tabulares.
- Pesos 400, 500, 600 y 700. Evitar mayúsculas de adorno y texto excesivamente fino.

## Logo

- Símbolo definitivo: variante 02, media sierra circular y un tablón. Las alternativas se conservan en `design-system/control-operativo-propuestas/operaciones-logos.html`.
- Wordmark visible: Operaciones en Archivo Semibold, sin firma secundaria.
- Mantener versiones horizontal, compacta, monocromática y favicon en SVG. Sin gradientes ni sombras.

## Composición

- Escritorio: dos paneles grafito, áreas y secciones. El de áreas está compacto y se abre con el mouse o el foco del teclado, con una transición breve; al salir vuelve a iconos. Móvil: menú accesible con ambos niveles.
- Fondo blanco; encabezados de contenedores en gris frío `--nav-bg`.
- Un patrón de tarjeta para todos los indicadores, una escala de botones y una escala de tablas.
- Espaciado de 8, 16, 24 y 32 px. Evitar cajas y líneas que no separen información útil.
- Estados vacíos, errores y carga tienen texto distinto; cero no equivale a dato no disponible.

## Verificación

- Contraste normal mínimo 4.5:1, foco visible y estado no comunicado solo por color.
- Interacciones táctiles de al menos 44 por 44 px.
- Sin desplazamiento horizontal a 375, 768, 1024 y 1440 px.
- Verificar Inicio y las siete áreas con datos, vacío y error de carga.
