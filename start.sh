#!/usr/bin/env bash
#
# GSD en Linux: arranca, detiene y comprueba el servidor local.
#
#   ./start.sh              arranca el servidor y abre el navegador
#   ./start.sh stop         detiene el servidor
#   ./start.sh status       dice si está en marcha
#   ./start.sh install      icono en el menú de aplicaciones y en el escritorio
#   ./start.sh uninstall    quita el icono (tus datos no se tocan)
#
# Variables opcionales:
#   PORT            otro puerto (por defecto 8790)
#   GSD_DATA_DIR    otra carpeta para los datos
#   GSD_BROWSER     ruta a un navegador concreto
#   GSD_NO_BROWSER  si tiene valor, no abre el navegador
#
# Códigos de salida: 0 bien · 1 fallo · 2 orden desconocida · 3 no está en marcha.
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8790}"
URL="http://127.0.0.1:${PORT}"
DATA="${GSD_DATA_DIR:-${DIR}/data}"
PIDFILE="${DATA}/server.pid"
DESKTOP_FILE="gsd.desktop"

# --------------------------------------------------------------------------

# Desde el menú o el escritorio no hay terminal: el mensaje llega como notificación.
say() {
  echo "$1"
  if [ ! -t 1 ] && command -v notify-send >/dev/null 2>&1; then
    notify-send -a GSD -i "${DIR}/public/icon.svg" "GSD" "$1" >/dev/null 2>&1 || true
  fi
}

fail() {
  say "$1" >&2
  exit 1
}

find_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
  elif [ -x "$HOME/.local/node/bin/node" ]; then
    echo "$HOME/.local/node/bin/node"
  else
    fail "No encuentro Node.js. Instálalo (https://nodejs.org o el gestor de paquetes de tu sistema) y vuelve a probar."
  fi
}

is_running() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --noproxy '*' --max-time 2 "${URL}/api/health" >/dev/null 2>&1
  else
    # Sin curl, el propio Node hace la comprobación.
    "$(find_node)" -e "require('http').get('${URL}/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1)).setTimeout(2000,function(){this.destroy()})" >/dev/null 2>&1
  fi
}

open_browser() {
  [ -n "${GSD_NO_BROWSER:-}" ] && return 0
  # Un navegador concreto si se pide; si no, Zen si está, y si no, el del sistema.
  local b
  for b in "${GSD_BROWSER:-}" "$HOME/.local/bin/zen" "$HOME/.tarball-installations/zen/zen" "$(command -v zen 2>/dev/null || true)"; do
    if [ -n "$b" ] && [ -x "$b" ]; then
      "$b" --new-window "$URL" >/dev/null 2>&1 &
      return 0
    fi
  done
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  else
    echo "Abre en el navegador: ${URL}"
  fi
}

start_server() {
  local node major
  node="$(find_node)"
  major="$("$node" -p "process.versions.node.split('.')[0]")"
  if [ "$major" -lt 18 ]; then
    fail "GSD necesita Node.js 18 o superior y tienes la ${major}. Actualízalo y vuelve a probar."
  fi
  mkdir -p "$DATA"
  # setsid: el servidor sobrevive al cierre de esta terminal o del lanzador.
  GSD_DATA_DIR="$DATA" setsid nohup "$node" "${DIR}/server.js" --port "$PORT" \
    >>"${DATA}/server.log" 2>&1 < /dev/null &
  echo $! > "$PIDFILE"

  local i
  for i in $(seq 1 80); do
    is_running && return 0
    sleep 0.15
  done
  fail "El servidor no ha respondido. Mira ${DATA}/server.log"
}

stop_server() {
  local stopped=0 pid
  if [ -f "$PIDFILE" ]; then
    pid="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill "$pid" 2>/dev/null; then stopped=1; fi
    rm -f "$PIDFILE"
  fi
  # Respaldo por si se perdió el fichero del pid. Solo procesos node que estén
  # ejecutando ESTE server.js en ESTE puerto: nunca se mata nada que
  # sencillamente mencione la ruta, ni otra instancia de GSD en otro puerto.
  # No se fía del nombre del proceso (varía entre sistemas): comprueba que el
  # ejecutable es node y que su primer argumento es exactamente este server.js.
  for pid in $(pgrep -f -- "${DIR}/server.js" 2>/dev/null || true); do
    local argv=() su_puerto
    mapfile -d '' -t argv < "/proc/${pid}/cmdline" 2>/dev/null || continue
    [[ "$(basename "${argv[0]:-}")" == node* && "${argv[1]:-}" == "${DIR}/server.js" ]] || continue
    # Sin --port es un arranque antiguo o a mano: escucha en el puerto de siempre.
    su_puerto="8790"
    [[ "${argv[2]:-}" == "--port" ]] && su_puerto="${argv[3]:-}"
    if [[ "$su_puerto" == "$PORT" ]]; then
      kill "$pid" 2>/dev/null && stopped=1
    fi
  done
  if [ "$stopped" = 1 ]; then say "Servidor detenido."; else say "No estaba en marcha."; fi
}

desktop_dir() {
  local d=""
  command -v xdg-user-dir >/dev/null 2>&1 && d="$(xdg-user-dir DESKTOP 2>/dev/null || true)"
  if [ -z "$d" ] || [ "$d" = "$HOME" ]; then d="$HOME/Desktop"; fi
  echo "$d"
}

write_desktop_file() {
  cat <<DESKTOP
[Desktop Entry]
Type=Application
Version=1.0
Name=GSD
GenericName=Get Shit Done
Comment=Captura, decide y ejecuta. Local, sin cuentas, sin excusas.
Exec="${DIR}/start.sh"
Path=${DIR}
Icon=${DIR}/public/icon.svg
Terminal=false
StartupNotify=false
Categories=Office;ProjectManagement;
Keywords=gsd;gtd;tareas;productividad;focus;inbox;
Actions=stop;status;

[Desktop Action stop]
Name=Detener el servidor
Exec="${DIR}/start.sh" stop

[Desktop Action status]
Name=¿Está en marcha?
Exec="${DIR}/start.sh" status
DESKTOP
}

install_launcher() {
  local apps="$HOME/.local/share/applications" desk
  mkdir -p "$apps"
  write_desktop_file > "${apps}/${DESKTOP_FILE}"
  chmod +x "${apps}/${DESKTOP_FILE}" "${DIR}/start.sh"
  desk="$(desktop_dir)"
  if [ -d "$desk" ]; then
    cp "${apps}/${DESKTOP_FILE}" "${desk}/${DESKTOP_FILE}"
    chmod +x "${desk}/${DESKTOP_FILE}"
    # GNOME no deja abrir iconos del escritorio que no se han marcado como de confianza.
    command -v gio >/dev/null 2>&1 && gio set "${desk}/${DESKTOP_FILE}" metadata::trusted true 2>/dev/null || true
    say "Listo: GSD está en el menú de aplicaciones y en ${desk}."
  else
    say "Listo: GSD está en el menú de aplicaciones."
  fi
}

uninstall_launcher() {
  local removed=0 f
  for f in "$HOME/.local/share/applications/${DESKTOP_FILE}" "$(desktop_dir)/${DESKTOP_FILE}"; do
    if [ -f "$f" ]; then rm -f "$f"; removed=1; fi
  done
  if [ "$removed" = 1 ]; then say "Icono quitado. Tus datos siguen en su sitio."; else say "No había icono que quitar."; fi
}

# --------------------------------------------------------------------------

case "${1:-start}" in
  start|arrancar)
    if is_running; then
      say "GSD ya estaba en marcha en ${URL}"
    else
      start_server
      echo "GSD en marcha en ${URL}"
      echo "Para detenerlo: ${DIR}/start.sh stop"
    fi
    open_browser
    ;;
  stop|detener)
    stop_server
    ;;
  status|estado)
    if is_running; then say "En marcha en ${URL}"; else say "Parado."; exit 3; fi
    ;;
  install|instalar)
    install_launcher
    ;;
  uninstall|desinstalar)
    uninstall_launcher
    ;;
  *)
    echo "Uso: start.sh [start | stop | status | install | uninstall]" >&2
    exit 2
    ;;
esac
