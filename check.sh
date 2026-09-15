#!/usr/bin/env bash
#
# Comprobación de sintaxis de todo el código. Sin dependencias: solo Node.
#
#   ./check.sh
#
# `node --check` no valida como módulo ES un fichero .js con import/export:
# se los traga sin rechistar. Por eso cada fichero se copia a .mjs antes de
# comprobarlo. Es la diferencia entre comprobar algo y creer que lo compruebas.

set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fallos=0
total=0

# Los módulos del navegador, como módulos ES.
while IFS= read -r f; do
  total=$((total + 1))
  cp "$f" "$TMP/x.mjs"
  if ! salida="$(node --check "$TMP/x.mjs" 2>&1)"; then
    fallos=$((fallos + 1))
    printf '\n>>> %s\n%s\n' "${f#"$DIR"/}" "$salida"
  fi
done < <(find "$DIR/public/js" -name '*.js' | sort)

# El servidor es CommonJS y se comprueba tal cual.
total=$((total + 1))
if ! salida="$(node --check "$DIR/server.js" 2>&1)"; then
  fallos=$((fallos + 1))
  printf '\n>>> server.js\n%s\n' "$salida"
fi

# Y los guiones de shell.
for sh in "$DIR/start.sh" "$DIR/check.sh"; do
  total=$((total + 1))
  if ! salida="$(bash -n "$sh" 2>&1)"; then
    fallos=$((fallos + 1))
    printf '\n>>> %s\n%s\n' "${sh#"$DIR"/}" "$salida"
  fi
done

if [ "$fallos" = 0 ]; then
  echo "SINTAXIS OK — ${total} ficheros."
else
  echo
  echo "${fallos} de ${total} ficheros con errores."
fi
exit "$fallos"
