# Pautas de Ecoase

Estas reglas se aplican a todas las pantallas del dashboard y deben verificarse también en tamaños de pantalla reducidos.

## Identidad de Control Operativo

- Aplicar la misma identidad a todas las pantallas, formularios y diálogos.
- Paleta base: blanco `#FFFFFF`, gris frío `#F4F6F8`, grafito azulado `#41515E`, amarillo `#FFCA08` y tinta `#26343E`. El blanco domina las superficies; el gris agrupa contenido; el grafito identifica navegación y texto secundario; el amarillo destaca acciones y datos seleccionados. No volver a usar verde agua como fondo de navegación o encabezados.
- Reservar rojo y ámbar para peligro, atraso y advertencias. Ningún estado depende solo del color.
- Usar Archivo alojada en la aplicación. Texto base de 16 px, tablas de 14 px y texto visible nunca menor de 12 px. Usar cifras tabulares en cantidades, fechas y códigos.
- El logo visible dice «Operaciones» y usa la variante 02: media sierra circular y un tablón. Usar la misma marca en navegación, favicon y vista previa. No sustituirlo por emojis ni iconos genéricos.
- Mantener dos paneles laterales grafito en escritorio: áreas a la izquierda y secciones del área activa a la derecha. El panel de áreas se expande al pasar el mouse y se contrae al salir; el de secciones permanece visible. Permitir también expandir con foco de teclado. No agregar botón para contraer. En móvil, usar un menú accesible. Las acciones táctiles deben tener un área de al menos 44 por 44 px.
- Los dos paneles laterales usan el mismo fondo grafito azulado `#26343E`. Distinguir la sección activa por su superficie y el acento amarillo, sin cambiar el fondo de uno de los paneles.
- El segundo panel muestra directamente las secciones, sin repetir el nombre del área como título. Una línea vertical fina separa ambos paneles. Mantener el ancho compacto total cerca de 302 px en escritorio.
- La marca Operaciones no lleva una línea horizontal debajo. Las secciones del segundo panel comienzan a la altura de Inicio. Calendario es una sección de Inicio, no un área independiente. No mostrar contadores ni números de notificación en ninguno de los paneles.
- Reutilizar los mismos componentes de indicadores, encabezados, tablas, filtros, botones y estados en todas las áreas. No crear variantes de color o tamaño por pantalla sin una razón funcional.
- Todos los KPI muestran cifra y nombre centrados, sin iconos. El fondo identifica el significado: pendientes en amarillo, reservados en azul, disponibles en verde; los demás estados usan colores distinguibles y estables entre pantallas. Mantener la etiqueta textual y el contraste, incluso cuando el valor es cero.
- Stock muestra saldos físicos, estados, reservas y movimientos. No agregar estimaciones derivadas de demanda a sus pantallas, API o herramientas MCP.
- Los encabezados de contenedores usan gris frío mediante `--nav-bg` en `app/globals.css`. La navegación lateral usa grafito y las acciones principales amarillo con texto oscuro.
- Mantener foco visible, contraste de texto de al menos 4.5:1, estados vacíos útiles y diseños sin desplazamiento horizontal.
- Conservar las reglas existentes sobre filtros de columna, ausencia de franjas laterales de color, nomenclatura y comportamiento operativo.

## Reglas de color

- Un solo amarillo de acción: `--brand-yellow` (`#FFCA08`), con texto `--brand-black`. Todo botón de acción principal o de alta («Agregar…», «Registrar…», «Programar…») usa la clase `.primary-button`; no definir amarillos nuevos ni copiar el valor a mano en una pantalla.
- Los botones secundarios usan `.secondary-button` y los de solo icono `.od-icon-button`. Ningún botón nuevo recibe un color propio.
- Etapas y tipos de actividad usan las variables `--kind-*` de `app/globals.css`: producción amarillo (`--kind-production`), transporte azul (`--kind-transport`) y entrega/envío verde (`--kind-delivery`), con sus variantes `-soft` y `-line` para fondos y contornos. Ese mismo color identifica la etapa en calendarios, tablas, KPI, leyendas y etiquetas de estado (Planificando amarillo, Produciendo azul, Enviando verde).
- Rojo solo para lo que no se hizo, está atrasado o es un error; nunca como decoración.
- Encabezados de columnas y barras de contenedor en `--brand-black` (`#26343E`) con texto blanco; navegación lateral en grafito.
- Los colores se toman siempre de variables CSS definidas en `app/globals.css`. Si hace falta un color nuevo, se agrega allí como variable y se documenta en esta sección antes de usarlo.

## Contenido y movimiento

- No agregar párrafos ni elementos `<span>` para rellenar tarjetas, repetir títulos o crear texto ornamental. Conservarlos cuando aportan datos, instrucciones, estados o estructura semántica útil.
- Evitar rótulos superiores de adorno, también llamados eyebrow, y subtítulos que repitan el encabezado. El título y los datos deben dar contexto por sí mismos.
- No usar flechas decorativas al final de botones, enlaces, indicadores o filas. Conservar las flechas que son controles funcionales de calendario, filtros, reordenamiento o navegación entre pasos, siempre con un nombre accesible.
- Animar solo para dar respuesta a una acción o explicar la entrada y salida de un diálogo o menú. Usar transiciones breves de opacidad y transformación, sin mover datos que la persona está leyendo.
- Respetar `prefers-reduced-motion` y mantener el estado final legible cuando la animación no se ejecuta.

## Diseño de cuadros y tablas

- Ningún cuadro, panel, diálogo, tabla o calendario debe mostrar una barra de desplazamiento horizontal. Aprovechar el ancho disponible y ajustar la disposición o el tamaño de letra cuando haga falta. En pantallas estrechas, reorganizar el contenido para que siga siendo legible sin desplazamiento horizontal; no ocultar datos como sustituto de resolver el diseño.
- Ningún encabezado debe cortar una palabra entre líneas. Darle ancho suficiente, reorganizar sus columnas o reducir la tipografía sin bajar de 12 px; comprobarlo en escritorio, tableta y móvil.
- Los encabezados de los contenedores deben usar `--nav-bg` en `app/globals.css`, con texto de contraste suficiente. La barra lateral usa `--brand-slate`.
- Los encabezados de secciones y tablas deben formar barras con las esquinas exteriores redondeadas. Separar visualmente el encabezado de la tabla siguiente con espacio, sin una línea divisoria entre ambos ni líneas verticales dentro de la barra del encabezado.
- Un contenedor con encabezados (tabla o lista con fila de títulos de columnas) no lleva borde de ningún color: queda con fondo blanco y sin contorno. Los encabezados de columnas usan `--brand-black` (`#26343e`, el mismo gris azulado oscuro de la barra lateral) con texto blanco.
- Prohibido usar bordes de color en un solo lateral de elementos de contenido: contenedores, indicadores KPI, tarjetas, filas, botones y elementos seleccionados. El separador estructural entre los dos paneles de navegación es la única excepción. Tampoco simular una franja lateral de estado con sombras o seudoelementos. Para distinguir estados o selecciones, usar el fondo, el texto, un icono, una etiqueta o, si hace falta, un borde uniforme en todo el contorno.
- Todos los encabezados de columnas de las tablas deben ofrecer su filtro de columna mediante un botón con una V o flecha hacia abajo (chevron) que abra un popover. No usar un icono de embudo. El control de filtrado pertenece al popover de esa columna, no a un selector permanente dentro del encabezado.

## Nomenclatura

- Para el atributo de tratamiento de un producto, usar siempre «Con HT» o «Sin HT». En el seguimiento del proceso, usar «HT» y «Pendiente de HT». No presentar «marcado» como sinónimo de HT en textos visibles, aunque los registros históricos o identificadores internos conserven ese nombre.

## Compatibilidad entre productor y producto

Al configurar reglas de rendimiento y al planificar un pedido, mostrar únicamente productores compatibles con el tipo de producto. John y Esteban trabaja con bins: no debe ofrecerse para pallets ni pisos, tampoco al agregar otro productor o repartir cantidades automáticamente.

## Calendario interno de producción

En «Planificación de producción» → «Calendario interno» (`ProductionBoard` en `app/components/ProductionPlanner.tsx`):

- La interacción principal es poder arrastrar con el mouse cada pedido planificado y soltarlo en otro día del calendario. El cambio de fecha debe guardarse y reflejarse de inmediato en el calendario y en la capacidad de producción. No exigir abrir un formulario para moverlo de día.
- Al hacer clic en una tarjeta de pedido, abrir un cuadro de diálogo con el detalle del producto correspondiente a esa asignación: nombre completo, código, atributos o niveles que definen el tipo de producto y cantidad planificada. El nombre del cliente por sí solo no alcanza.
- Distinguir el clic del gesto de arrastre: soltar una tarjeta no debe abrir por accidente el cuadro de detalle.
- Mientras se arrastra, atenuar la tarjeta original y resaltar con una vista previa completa la celda de destino, siguiendo la interacción visual del calendario de entregas. El destino válido conserva el mismo productor y cambia solo el día.
- Al pie del calendario, mostrar para cada día el total de palets a producir sumando las cantidades planificadas de todas las asignaciones visibles en sus productores. Actualizarlo al mover o guardar una asignación.

## Calendario de logística

- Usar una matriz semanal con días por columnas y vehículos o modalidades por filas, como el calendario de producción. El cuadro tiene un único contorno redondeado y las celdas interiores conservan esquinas rectas.
- Planificación es la primera sección de Logística. La cola «Transporte a planificar» muestra pedidos cuando exista al menos un palet físicamente listo sin comprometer. Presentar Cliente, Listo para enviar (cantidad lista para asignar), Total (cantidad pedida) y Entrega (fecha), con cada valor debajo de su encabezado. Evitar frases redundantes sobre palets listos y pendientes.
- «Asignar transporte» decide la salida real en este orden: modalidad y transporte; cantidad lista que se enviará; revisión y guardado. Para flota propia, mostrar en paralelo el volumen estimado de la mezcla y la referencia aproximada del vehículo. Ajustar cada cantidad manualmente, sin exigir una capacidad adicional para cargas mixtas ni ofrecer un botón para completar espacio. El volumen es una orientación, no una barrera de guardado. Una preferencia de transporte registrada al crear el pedido no impide elegir otra modalidad al planificar.
- En el panel «Carga y volumen», mostrar para chicos y grandes la cantidad elegida sobre la referencia configurada del transporte y una barra que responda a cada cambio. Las dos referencias son independientes, no se suman y no bloquean la carga mixta. Si una referencia no está configurada, mostrar la cantidad sin inventar un máximo.
- En el paso «Carga», presentar cada producto en una fila con tres columnas: nombre del producto, tamaño logístico y cantidad a enviar. Mostrar el total listo junto al campo de cantidad sin completar el campo automáticamente. Conservar las tres columnas en móvil y evitar desplazamiento horizontal.
- No agregar pedidos al calendario por un botón separado. El plan guardado aparece en la matriz. Al arrastrar una salida planificada a otro día de la misma fila, guardar el cambio directamente y conservar las horas. Mostrar la tarjeta completa en la celda de destino durante el arrastre.
- «Transporte real» es la segunda sección de Logística y registra después si cada salida se realizó, la cantidad transportada y el remito. Una salida no realizada se cancela y libera su carga para volver a planificar.
- Mantener una alternativa de cambio de fecha con controles de formulario para teclado y pantallas táctiles. Diferenciar el cero de la falta de datos y mostrar el total de salidas por día.
- En el calendario, abrir la salida al pulsar su tarjeta. Al arrastrarla a otro día, guardar y mostrar la fecha nueva. Considerar exactas las ubicaciones de clientes registradas; no mostrar avisos de ubicación aproximada para ellas. Solo se carga a mano la hora de salida del camión; el regreso nunca se escribe a mano: se calcula con la ruta de ida y vuelta (OpenRouteService) más los tiempos de carga, descarga, pausa y margen, y se recalcula al guardar o mover la salida.
- No mostrar «Agendar retiro» ni un panel separado de retiro a proveedor en Planificación. Conservar la lectura de retiros ya registrados en el calendario. Dentro de «Transporte a planificar», antes de «Planificación», mostrar un resumen plegable de pedidos con salidas planificadas recientemente y acciones para planificar palets efectivamente listos o replanificar una salida existente. No inferir «carga sin salida» restando la carga asignada del pendiente del pedido.
- En «Límites de logística» mostrar una tabla de transportes propios, tercerizados y retiro del cliente. Las columnas «Palets grandes por viaje» y «Palets chicos por viaje» sirven para estimar el volumen de referencia de cada transporte a partir de cargas homogéneas. No sumar esos máximos ni bloquear una mezcla por comparar cantidades de clases diferentes. Para transporte externo o retiro del cliente, se mantiene la capacidad indicada para esa salida cuando no hay volumen propio conocido.
- El volumen orientativo se calcula con referencias de 120 × 100 cm para chicos y 220 × 117 cm para grandes, usando 10 cm de altura inicial en ambos. Mostrar el rango entre los volúmenes de las dos cargas completas en «Límites», y en el asistente mostrar el extremo superior como referencia aproximada en m³. Actualizarlo al editar capacidades. No llamarlo capacidad física medida del vehículo ni usarlo para bloquear el guardado: peso, forma y apilado se verifican en la operación.
- El tamaño logístico automático de un pallet se define por la superficie de su base: hasta 1,20 m² inclusive es chico; más de 1,20 m² es grande. Las medidas se expresan en centímetros. Una clasificación manual por producto tiene prioridad y se edita o quita desde el único lápiz de la última columna del catálogo. Sin medida válida, mostrar «Sin clasificar».
- En la ficha del producto, editar ancho y largo en centímetros y calcular la superficie de base en m² mientras se escribe. Conservar el orden largo × ancho en la medida existente, porque su orientación distingue productos. La altura inicial de todos los pallets existentes y nuevos es 10 cm y se puede editar desde la misma ficha. El volumen de una carga usa la altura guardada. No mostrar estas dimensiones adicionales como columnas del catálogo.
- Debajo, mostrar una tabla de clientes con distancia aproximada de ida desde el centro y pedidos por día. Son parámetros guardados para planificación; no presentarlos como distancia de ruta verificada ni como límite aplicado si todavía no se usan en el calendario.
- En «Límites de logística», los pedidos por día se estiman sobre 24 horas. Cada pedido requiere una ida y su propio tiempo de carga y descarga; entre dos pedidos se cuenta una vuelta. La tabla permite guardar esos minutos por pedido para cada cliente. Mostrar cero si no entra una entrega completa y falta de estimación si no hay horas de ida.
- Si un cliente no tiene minutos de carga y descarga configurados, usar 60 minutos como supuesto inicial y recalcular los pedidos posibles. Mostrar solo «60 min» en la celda, sin la palabra «Estimado». No guardar el supuesto hasta que se edite y guarde la fila.
- En las tablas de capacidad y distancia, mostrar valores de solo lectura por defecto. La acción del lápiz abre la edición de esa fila; el disquete guarda los cambios y el botón de cancelar descarta el borrador. Recalcular los pedidos posibles mientras se edita, sin guardar hasta confirmar.
- Omitir las búsquedas y los filtros de columna en las tablas «Capacidad por transporte» y «Distancia». Las tablas permanecen completas.
- No mostrar en «Límites de logística» formularios de direcciones de destino, clasificación de pallets ni choferes. Conservar los datos que otros flujos siguen utilizando.
- No mostrar «Centro y jornada» ni referencias visibles a Paysandú en «Límites de logística». Conservar los parámetros internos de ubicación y jornada que usan los cálculos.
