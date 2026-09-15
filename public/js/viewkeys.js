/* Atajos propios de la vista activa. El router los limpia en cada cambio. */

let handler = null;

export function set(fn) { handler = fn; }
export function clear() { handler = null; }
export function run(e) { return handler ? handler(e) : false; }
