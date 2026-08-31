# Ecoase Control Operativo — Brand kit

Este archivo es la fuente visual de verdad de la aplicación. Las reglas particulares de una página pueden ampliar estas pautas, pero no introducir nuevos colores de marca ni tamaños de texto inferiores al mínimo.

## Principios

- Herramienta operativa, directa y de alta legibilidad.
- Mostrar primero decisiones, cantidades, estados y acciones.
- Ocultar explicaciones, trazabilidad y configuración avanzada hasta que se soliciten.
- No comunicar estados solamente mediante color: usar texto e iconos.
- Mantener interacciones de al menos 44 × 44 px y foco visible.

## Paleta

| Token | Hex | Uso |
|---|---|---|
| `--brand-green-dark` | `#183D31` | Navegación, acciones principales, selección |
| `--brand-green-light` | `#E8F3ED` | Estados positivos y superficies activas |
| `--brand-brown-dark` | `#6B3F29` | Encabezados, agrupaciones y calendario |
| `--brand-brown-light` | `#FBF4EE` | Fondo general, filas alternadas y separación |
| `--brand-black` | `#17221E` | Texto principal |
| `--brand-white` | `#FFFFFF` | Tarjetas, formularios y modales |

Rojo y ámbar son excepciones semánticas: se reservan para error, peligro, sobrecarga y alertas de stock. Los bordes y estados de interacción se obtienen mezclando los seis colores anteriores; no constituyen nuevos colores de marca.

## Tipografía y densidad

- Familia: `Arial, Helvetica, sans-serif`.
- Escala visible: `12px`, `14px`, `16px`, `20px`, `28px`.
- Texto base: `16px`, altura de línea `1.5`.
- Etiquetas y metadatos indispensables: mínimo `12px`.
- No usar mayúsculas pequeñas para llenar espacio ni subtítulos que repitan el título.
- `.sr-only` puede conservar tamaño técnico porque no es contenido visual.

## Jerarquía de componentes

- **Página:** título único y, sólo cuando haga falta, una acción global.
- **Sección:** encabezado marrón oscuro o tarjeta blanca claramente separada.
- **Métrica:** cifra primero, etiqueta breve debajo.
- **Tabla:** columnas necesarias para decidir; el resto vive en el detalle.
- **Estado:** etiqueta de 12px como mínimo, icono y color semántico.
- **Formulario:** etiquetas visibles; ayuda únicamente cuando evita un error.
- **Modal:** fondo blanco opaco, contraste alto, foco atrapado y cierre accesible.
- **Detalle avanzado:** `details`, modal o subpágina; cerrado por defecto.

## Asignación por área

- Calendario: encabezados marrón oscuro, días marrón claro y tarjetas blancas.
- Stock: saldos, disponibilidad y días de stock en primer plano; proyección, consumo y movimientos cerrados por defecto.
- Producción: tabla semanal de asignaciones, estado y próxima acción; capacidades normal y máxima viven en el detalle o en Configuración.
- Marcado: fecha, producto, cantidad, responsable y resultado en primer plano; alta en diálogo, tendencia y controles ampliados bajo demanda.
- Maestros: listas compactas; edición y relaciones en páginas de detalle.

## Lista de verificación

- Contraste de texto normal mínimo 4.5:1.
- Ningún texto visible por debajo de 12px.
- Estados críticos con texto o icono además del color.
- Foco visible y navegación por teclado.
- Sin desbordes en 375, 768, 1024 y 1440px.
- Sin colores azul, violeta o naranja usados como identidad de marca.
- Movimiento reducido respetado.
