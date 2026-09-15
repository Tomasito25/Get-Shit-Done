<#
  GSD en Windows: arranca, detiene y comprueba el servidor local.

    GSD.cmd              arranca el servidor y abre el navegador
    GSD.cmd stop         detiene el servidor
    GSD.cmd status       dice si está en marcha
    GSD.cmd install      crea accesos directos en el escritorio y en el menú Inicio
    GSD.cmd uninstall    quita los accesos directos (tus datos no se tocan)

  Variables opcionales:
    PORT            otro puerto (por defecto 8790)
    GSD_DATA_DIR    otra carpeta para los datos
    GSD_BROWSER     ruta a un navegador concreto
    GSD_NO_BROWSER  si tiene valor, no abre el navegador

  Funciona con Windows PowerShell 5.1, que viene con Windows 10 y 11,
  y con PowerShell 7.

  Códigos de salida: 0 bien · 1 fallo · 2 orden desconocida · 3 no está en marcha.
#>
param(
  [Parameter(Position = 0)][string]$Accion = 'start',
  [switch]$Lanzador
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Dir = $PSScriptRoot
$Port = if ($env:PORT) { $env:PORT } else { '8790' }
$Url = "http://127.0.0.1:$Port"
$Data = if ($env:GSD_DATA_DIR) { $env:GSD_DATA_DIR } else { Join-Path $Dir 'data' }
$PidFile = Join-Path $Data 'server.pid'
$Server = Join-Path $Dir 'server.js'
$NombreAcceso = 'GSD.lnk'

# ---------------------------------------------------------------------------

function Decir {
  param([string]$Texto, [switch]$Fallo)
  if ($Fallo) { Write-Host $Texto -ForegroundColor Red } else { Write-Host $Texto }
  # Desde el acceso directo no hay consola a la vista: un fallo se enseña en una ventana.
  if ($Fallo -and $Lanzador) {
    (New-Object -ComObject WScript.Shell).Popup($Texto, 0, 'GSD', 16) | Out-Null
  }
}

function Buscar-Node {
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd) { return $cmd.Path }
  # Recién instalado, el PATH de esta sesión aún no lo conoce: se busca donde lo deja el instalador.
  $candidatos = @()
  if ($env:ProgramFiles) { $candidatos += (Join-Path $env:ProgramFiles 'nodejs\node.exe') }
  if (${env:ProgramFiles(x86)}) { $candidatos += (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe') }
  if ($env:LOCALAPPDATA) { $candidatos += (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe') }
  foreach ($c in $candidatos) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  return $null
}

function Version-Node {
  param([string]$Node)
  try { return [int](& $Node -p "process.versions.node.split('.')[0]") } catch { return 0 }
}

function Esta-EnMarcha {
  try {
    $peticion = [System.Net.WebRequest]::Create("$Url/api/health")
    $peticion.Proxy = $null      # 127.0.0.1 nunca pasa por un proxy
    $peticion.Timeout = 2000
    $respuesta = $peticion.GetResponse()
    $ok = ([int]$respuesta.StatusCode -eq 200)
    $respuesta.Close()
    return $ok
  } catch {
    return $false
  }
}

function Arrancar-Servidor {
  $node = Buscar-Node
  if (-not $node) {
    Decir 'No encuentro Node.js. Instálalo desde https://nodejs.org (el botón LTS) y vuelve a abrir GSD.' -Fallo
    if (-not $env:GSD_NO_BROWSER) { Start-Process 'https://nodejs.org/' }
    exit 1
  }
  $version = Version-Node $node
  if ($version -lt 18) {
    Decir "GSD necesita Node.js 18 o superior y tienes la $version. Actualízalo desde https://nodejs.org" -Fallo
    exit 1
  }

  New-Item -ItemType Directory -Force -Path $Data | Out-Null
  $env:PORT = $Port
  $log = Join-Path $Data 'server.log'

  # Sin redirecciones a propósito: así Start-Process lanza el servidor como lo haría
  # el Explorador, oculto, con consola propia y sin heredar nada de esta ventana.
  # Sigue vivo cuando esta se cierra, y quien espere a este script no se queda colgado.
  # El registro lo escribe el propio servidor (--log).
  $argumentos = "`"$Server`" --port $Port --log `"$log`""
  $proceso = Start-Process -FilePath $node -ArgumentList $argumentos -WorkingDirectory $Dir -WindowStyle Hidden -PassThru
  Set-Content -LiteralPath $PidFile -Value $proceso.Id -Encoding Ascii

  for ($i = 0; $i -lt 80; $i++) {
    if (Esta-EnMarcha) { return }
    if ($proceso.HasExited) { break }
    Start-Sleep -Milliseconds 150
  }
  Decir "El servidor no ha respondido. Mira lo que dice $log" -Fallo
  exit 1
}

function Detener-Servidor {
  $detenido = $false
  if (Test-Path -LiteralPath $PidFile) {
    $id = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($id -match '^\d+$') {
      $p = Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue
      # Un pid viejo puede ser ya otro programa: solo se cierra si es node.
      if ($p -and $p.ProcessName -like 'node*') {
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        $detenido = $true
      }
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  }
  # Por si se perdió el fichero del pid: solo un node.exe que ejecute ESTE server.js
  # en ESTE puerto. Otra instancia de GSD en otro puerto no se toca.
  $procesos = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue)
  foreach ($p in $procesos) {
    if (-not ($p -and $p.CommandLine)) { continue }
    if ($p.CommandLine.IndexOf($Server, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
    $suPuerto = '8790'
    if ($p.CommandLine -match '--port\s+(\d+)') { $suPuerto = $Matches[1] }
    if ($suPuerto -eq $Port) {
      Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
      $detenido = $true
    }
  }
  if ($detenido) { Decir 'Servidor detenido.' } else { Decir 'No estaba en marcha.' }
}

function Abrir-Navegador {
  if ($env:GSD_NO_BROWSER) { return }
  if ($env:GSD_BROWSER -and (Test-Path -LiteralPath $env:GSD_BROWSER)) {
    Start-Process -FilePath $env:GSD_BROWSER -ArgumentList $Url
    return
  }
  Start-Process $Url
}

function Carpetas-Accesos {
  return @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) | Where-Object { $_ }
}

function Instalar-Accesos {
  $shell = New-Object -ComObject WScript.Shell
  $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $script = Join-Path $Dir 'start.ps1'
  foreach ($carpeta in Carpetas-Accesos) {
    $acceso = $shell.CreateShortcut((Join-Path $carpeta $NombreAcceso))
    $acceso.TargetPath = $powershell
    $acceso.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" start -Lanzador"
    $acceso.WorkingDirectory = $Dir
    $acceso.IconLocation = (Join-Path $Dir 'public\icon.ico') + ',0'
    $acceso.Description = 'GSD - Captura, decide y ejecuta.'
    $acceso.WindowStyle = 7
    $acceso.Save()
  }
  # Lo descargado de Internet lleva una marca que hace que Windows pregunte cada vez.
  Get-ChildItem -LiteralPath $Dir -Recurse -File -ErrorAction SilentlyContinue |
    Unblock-File -ErrorAction SilentlyContinue
  Decir 'Listo: GSD tiene acceso directo en el escritorio y en el menú Inicio.'
}

function Quitar-Accesos {
  $quitados = 0
  foreach ($carpeta in Carpetas-Accesos) {
    $ruta = Join-Path $carpeta $NombreAcceso
    if (Test-Path -LiteralPath $ruta) { Remove-Item -LiteralPath $ruta -Force; $quitados++ }
  }
  if ($quitados) { Decir 'Accesos directos quitados. Tus datos siguen en su sitio.' }
  else { Decir 'No había accesos directos que quitar.' }
}

# ---------------------------------------------------------------------------

switch -Regex ($Accion.ToLowerInvariant()) {
  '^(start|arrancar)$' {
    if (Esta-EnMarcha) {
      Decir "GSD ya estaba en marcha en $Url"
    } else {
      Arrancar-Servidor
      Decir "GSD en marcha en $Url"
      Decir 'Para detenerlo: GSD.cmd stop'
    }
    Abrir-Navegador
    exit 0
  }
  '^(stop|detener)$' { Detener-Servidor; exit 0 }
  '^(status|estado)$' {
    if (Esta-EnMarcha) { Decir "En marcha en $Url"; exit 0 }
    Decir 'Parado.'
    exit 3
  }
  '^(install|instalar)$' { Instalar-Accesos; exit 0 }
  '^(uninstall|desinstalar)$' { Quitar-Accesos; exit 0 }
  default {
    Decir 'Uso: GSD.cmd [start | stop | status | install | uninstall]' -Fallo
    exit 2
  }
}
