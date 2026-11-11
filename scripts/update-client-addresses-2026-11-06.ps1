param([switch]$Apply)

$baseUrl = 'http://127.0.0.1:3100/api/clients'
$updates = @(
  @{ name = 'Alimentos Fray Bentos'; address = "Rutas 2 y 24, acceso Puerto M'Bopicuá, Fray Bentos"; department = 'Río Negro' }
  @{ name = 'Aluminio del Uruguay'; address = 'Ramón Márquez 3222, Montevideo'; department = 'Montevideo' }
  @{ name = 'Antonio de Souza e Hijos'; address = '19 de Abril 1967, Salto'; department = 'Salto' }
  @{ name = 'Azucarlito'; address = 'Libertad s/n y Presbítero Horacio Meriggi, Paysandú'; department = 'Paysandú' }
  @{ name = 'Azucitrus'; address = 'Dr. Roldán 80 y Norte, Paysandú'; department = 'Paysandú' }
  @{ name = 'Conaprole'; address = 'Magallanes 1871, Montevideo'; department = 'Montevideo' }
  @{ name = 'Cristalpet'; address = 'Camino Gral. Servando Gómez 2983, Montevideo'; department = 'Montevideo' }
  @{ name = 'CRUFI'; address = 'Camino Durán 5693, Montevideo'; department = 'Montevideo' }
  @{ name = 'Forbel'; address = 'Libertad 1754, Paysandú'; department = 'Paysandú' }
  @{ name = 'Forestal Oriental'; address = '18 de Julio 818, Paysandú'; department = 'Paysandú' }
  @{ name = 'Frutura Uruguay S.A. BIC'; address = 'Enrique Amorim 1655, Salto'; department = 'Salto' }
  @{ name = 'Gamorel'; address = 'Av. Luis Batlle Berres km 504,5, Salto'; department = 'Salto' }
  @{ name = 'Ghelfa'; address = 'Ituzaingó 1919, Paysandú'; department = 'Paysandú' }
  @{ name = 'Granja Pocha'; address = 'Ruta 54 km 5, Juan Lacaze'; department = 'Colonia' }
  @{ name = 'Molinos San José'; address = 'Av. Nicolás Guerra 110, San José de Mayo'; department = 'San José' }
  @{ name = 'Noridel'; address = 'Av. Garibaldi 2350, Salto'; department = 'Salto' }
  @{ name = 'Pamer'; address = 'Ejido de Chacras s/n, Soriano'; department = 'Soriano' }
  @{ name = 'Proquimur'; address = 'Ruta 5 km 35,300, Juanicó'; department = 'Canelones' }
  @{ name = 'Saint Gobain'; address = 'Ruta 101 km 27,250, Canelones'; department = 'Canelones' }
  @{ name = 'San Miguel'; address = 'Calle 80 N 31 n.º 1064, Paysandú'; department = 'Paysandú' }
)

$clients = (Invoke-RestMethod -Uri $baseUrl).clients
foreach ($update in $updates) {
  $matches = @($clients | Where-Object { $_.name -ceq $update.name })
  if ($matches.Count -ne 1) { throw "Cliente no encontrado o duplicado: $($update.name)" }
  $client = $matches[0]
  if ($client.address -and $client.address -notmatch 'Fictici' -and $client.address -ne $update.address) {
    throw "Dirección no ficticia ya presente para $($update.name): $($client.address)"
  }
  if ($Apply) {
    $body = @{ address = $update.address; department = $update.department } | ConvertTo-Json -Compress
    $result = Invoke-RestMethod -Uri "$baseUrl/$($client.id)" -Method Patch -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
    if ($result.client.address -ne $update.address -or $result.client.department -ne $update.department) {
      throw "No se verificó la actualización de $($update.name)"
    }
  }
  Write-Output "$($update.name): $($update.address)"
}
Write-Output "Clientes $($(if ($Apply) { 'actualizados' } else { 'revisados' })): $($updates.Count)"
