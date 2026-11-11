# Distancias de clientes desde Paysandú

Consulta del 11 de noviembre de 2026. Las distancias y horas son de ida por carretera desde el centro de Paysandú. Se calcularon con la tabla de rutas de [OSRM](https://github.com/Project-OSRM/osrm-backend) para automóvil. No incluyen carga, descarga, pausas ni restricciones de camión. El mapa general conserva sus franjas de tiempos estimados; la ruta de cada salida con camión se evalúa por separado.

Las direcciones son referencias públicas del cliente, no destinos de entrega confirmados. Se guardaron con `verified = false`. Seis puntos corresponden a una coincidencia de dirección en el [geocodificador de IDE Uruguay](https://www.gub.uy/infraestructura-datos-espaciales/tramites-y-servicios/servicios/servicio-direcciones-geograficas); los otros ocho representan la localidad o zona conocida y figuran como aproximados en el mapa. Las fuentes de direcciones están en [direcciones-publicas-clientes-2026-11-06.md](direcciones-publicas-clientes-2026-11-06.md).

| Cliente | Distancia (km) | Horas | Punto |
| --- | ---: | ---: | --- |
| Alimentos Fray Bentos | 124,1 | 2,04 | Fray Bentos, aproximado |
| Aluminio del Uruguay | 373,9 | 4,80 | Dirección pública |
| Antonio de Souza e Hijos | 120,3 | 1,75 | Dirección pública |
| Conaprole | 374,5 | 4,83 | Dirección pública |
| Cristalpet | 386,3 | 5,09 | Dirección pública |
| CRUFI | 362,2 | 4,67 | Dirección pública |
| Frutura Uruguay S.A. BIC | 119,4 | 1,72 | Salto, aproximado |
| Gamorel | 119,4 | 1,72 | Salto, aproximado |
| Granja Pocha | 312,2 | 4,54 | Juan Lacaze, aproximado |
| Molinos San José | 283,1 | 3,56 | Dirección pública |
| Noridel | 119,4 | 1,72 | Salto, aproximado |
| Pamer | 121,4 | 2,10 | Mercedes, aproximado |
| Proquimur | 336,3 | 4,28 | Juanicó, aproximado |
| Saint Gobain | 369,7 | 4,96 | Barros Blancos, aproximado |

Las tres referencias aproximadas de Salto comparten punto y recorrido hasta la localidad. Los valores se guardaron en `logistics_client_delivery_limits` y los puntos en `logistics_locations` del proyecto Supabase Ecoase.
