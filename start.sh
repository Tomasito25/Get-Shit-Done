#!/usr/bin/env bash
#
# Arranca (o detiene) la aplicación GSD en local.
#
#   ./start.sh          arranca el servidor y abre el navegador
#   ./start.sh stop     detiene el servidor
#   ./start.sh status   dice si está en marcha
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8790}"
URL="http://127.0.0.1:${PORT}"
PIDFILE="${DIR}/data/server.pid"

# --------------------------------------------------------------------------

find_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
  elif [ -x "$HOME/.local/node/bin/node" ]; then
    echo "$HOME/.local/node/bin/node"
  else
    echo "No se encuentra node. Instálalo o colócalo en ~/.local/node/bin/node" >&2
    exit 1
  fi
}

is_running() {
  curl -fsS --max-time 2 "${URL}/api/health" >/dev/null 2>&1
}

open_browser() {
  # Zen primero (con GSD_BROWSER se fuerza otro); si no está, el predeterminado.
  local zen
  for zen in "${GSD_BROWSER:-}" "$HOME/.local/bin/zen" "$HOME/.tarball-installations/zen/zen" "$(command -v zen 2>/dev/null || true)"; do
    if [ -n "$zen" ] && [ -x "$zen" ]; then
      "$zen" --new-window "$URL" >/dev/null 2>&1 &
      return 0
    fi
  done
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  fi
}

start_server() {
  local node
  node="$(find_node)"
  mkdir -p "${DIR}/data"
  # setsid: el servidor sobrevive al cierre de esta terminal o del lanzador.
  PORT="$PORT" setsid nohup "$node" "${DIR}/server.js" \
    >>"${DIR}/data/server.log" 2>&1 < /dev/null &
  echo $! > "$PIDFILE"

  local i
  for i in $(seq 1 50); do
    is_running && return 0
    sleep 0.1
  done
  echo "El servidor no respondió. Mira ${DIR}/data/server.log" >&2
  return 1
}

stop_server() {
  local stopped=0 pid
  if [ -f "$PIDFILE" ]; then
    pid="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill "$pid" 2>/dev/null; then stopped=1; fi
    rm -f "$PIDFILE"
  fi
  # Respaldo por si se perdió el fichero de pid. Solo procesos node que estén
  # ejecutando ESTE server.js: nunca se mata nada que sencillamente mencione
  # la ruta en su línea de órdenes.
  # No se fía del nombre del proceso (varía entre sistemas): comprueba que el
  # ejecutable es node y que su primer argumento es exactamente este server.js.
  for pid in $(pgrep -f -- "${DIR}/server.js" 2>/dev/null || true); do
    local argv=()
    mapfile -d '' -t argv < "/proc/${pid}/cmdline" 2>/dev/null || continue
    if [[ "$(basename "${argv[0]:-}")" == node* && "${argv[1]:-}" == "${DIR}/server.js" ]]; then
      kill "$pid" 2>/dev/null && stopped=1
    fi
  done
  if [ "$stopped" = 1 ]; then
    echo "Servidor detenido."
  else
    echo "No estaba en marcha."
  fi
}

# --------------------------------------------------------------------------

case "${1:-start}" in
  stop)
    stop_server
    ;;
  status)
    if is_running; then echo "En marcha en ${URL}"; else echo "Parado."; fi
    ;;
  start|"")
    if is_running; then
      echo "Ya estaba en marcha en ${URL}"
    else
      start_server
      echo "Servidor en ${URL}"
      echo "Para detenerlo: ${DIR}/start.sh stop"
    fi
    open_browser
    ;;
  *)
    echo "Uso: start.sh [start|stop|status]" >&2
    exit 2
    ;;
esac
