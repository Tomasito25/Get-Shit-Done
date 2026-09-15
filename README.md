# GSD — Get Shit Done

**Stop thinking. Start doing.**

Aplicación local de captura, decisión y ejecución. Un solo sistema:
GTD para sacarlo todo de la cabeza, Deep Work para proteger la atención,
One Thing para decidir qué importa, y disciplina para hacerlo aunque no apetezca.

No hay cuentas, ni nube, ni telemetría, ni publicidad. Los datos no salen del equipo.

---

## Arrancar

```bash
git clone https://github.com/Tomasito25/Get-Shit-Done.git
cd Get-Shit-Done
./start.sh
```

Eso es todo: no hay nada que instalar ni que compilar. El servidor queda en
`http://127.0.0.1:8790`, sobrevive al cierre de la terminal y abre el navegador.

```bash
./start.sh          # arranca y abre el navegador
./start.sh stop     # detiene el servidor
./start.sh status   # dice si está en marcha
```

Para otro puerto: `PORT=9000 ./start.sh`.
Para otro navegador: `GSD_BROWSER=/ruta/al/navegador ./start.sh`
(si no, usa Zen y, en su defecto, el predeterminado del sistema).

**Requisitos.** Node 18 o superior (el del `PATH`, o `~/.local/node/bin/node`) y un
navegador moderno. **Cero dependencias**: solo módulos nativos de Node, sin `npm install`,
sin `node_modules`, sin build. Funciona sin conexión a Internet.

Los avisos de escritorio usan `notify-send` (Linux). Sin él, la aplicación funciona igual y
avisa dentro de la página mientras esté abierta.

**Icono en el escritorio** (opcional):

```bash
sed "s|RUTA_A_GSD|$PWD|g" GSD.desktop.example > ~/.local/share/applications/gsd.desktop
```

Con el botón derecho sobre el icono: *Detener el servidor* y *¿Está en marcha?*.

---

## El flujo

```
CAPTURAR  →  ACLARAR  →  ORGANIZAR  →  EJECUTAR  →  REVISAR
```

1. **Escribe y ENTER.** La barra de captura está fija en HOY, y `N` la abre desde
   cualquier pantalla. Sin detalles, va al inbox. Con detalles, ya está decidida.
2. **Bandeja → ACLARAR.** Cada elemento responde a una pregunta: *¿qué es esto?*
   La primera opción es la regla de los dos minutos: si cuesta menos que organizarlo,
   no lo organices — `0` te mete directo a hacerlo. Después, `1–6`: eliminar, referencia,
   algún día, delegar, programar, siguiente acción. Antes de decidir puedes reescribirlo
   como acción física y concreta (no «Física», sino «Resolver ejercicios 4–8 del tema de
   campos»), y ahí también vale la sintaxis de captura.
3. **Una sola cosa: LO ÚNICO.** Cambiarla exige mantener pulsado.
4. **AHORA.** HOY abre con un solo bloque enorme: qué tocas ahora mismo y por qué.
5. **EMPEZAR.** Entra en Enfoque: desaparece la aplicación entera y queda la tarea.
   O **TRABAJO PROFUNDO**, si lo que toca es un bloque largo.
6. **Revisión semanal.** Diez pasos, cada uno resuelto ahí mismo. Al terminar: sistema limpio.

## Escribir al capturar

Los detalles caben en la propia línea, así que capturar sigue costando un segundo.
Debajo del campo se muestra lo que la aplicación ha entendido, antes de guardar.

**No hace falta recordar la sintaxis.** Bajo el campo está siempre la leyenda de marcas, también
mientras escribes, y pulsar una la escribe en el cursor. Al empezar una marca aparece la lista de
lo que cabe ahí, filtrándose con cada letra: tus contextos, tus proyectos con su código, fechas con
el día al que corresponden, repeticiones y horas de aviso. `↑` `↓` para moverse, `Enter` o `Tab`
para elegir, `Esc` para cerrarla. Funciona en la captura rápida, en la barra de HOY y al aclarar.

```
Comprar PLA @calle !mañana
Revisar el análisis #fisica !!
Sacar la basura *lun,mie,vie
Pagar el alquiler *mes-1 !+3d
```

| Marca | Para qué | Ejemplos |
|---|---|---|
| `@` | contexto | `@casa` `@calle` `@ordenador` |
| `#` | proyecto, por código o por nombre (lo crea si no existe) | `#P04` `#p4` `#fisica` |
| `!` | cuándo lo haces | `!hoy` `!mañana` `!lun` `!+3d` `!12/09` `!2026-09-12` |
| `^` | fecha tope | `^20/09` `^+10d` `^2026-12-31` |
| `%` | aviso | `%18:00` `%9` `%mañana-9` `%lun-18:30` |
| `*` | repetición | `*diario` `*3d` `*semanal` `*lun,jue` `*mes-1` |
| `!!` | no negociar: compromiso del día | |

Lo que no se entiende se queda tal cual en el título: aquí no se pierde texto.

## Nada que guardar

Las tareas y los proyectos **se guardan solos**. No hay botón de guardar porque un botón de
guardar es una trampa: se cierra con `Esc` y se pierde lo escrito. El texto se guarda medio
segundo después de dejar de teclear —y sin falta al salir del campo o cerrar—, y todo lo demás
en el momento de tocarlo. Un `GUARDADO` discreto lo confirma.

La única excepción: **retirar un compromiso** no es editar, es romperlo. La casilla vuelve
a su sitio y hay que mantener pulsado para confirmarlo, igual que para posponerlo.

## Fechas en un toque

Al abrir una tarea, bajo cada fecha hay botones: **HOY · MAÑANA · +2D · +3D · +1 SEM · LUNES**
para cuándo lo haces, y **MAÑANA · +2D · +3D · +1 SEM · +2 SEM · FIN DE MES** para la fecha tope.
Un toque pone la fecha y se guarda solo; el botón de la fecha actual queda encendido. Poner una
fecha no debería exigir abrir un calendario y contar casillas.

## Cuándo lo haces ≠ cuándo vence

Son dos fechas distintas y la aplicación no las mezcla:

- **Cuándo lo haces** (`!`) — el día que piensas ponerte. Es lo que te aparece en HOY.
- **Fecha tope** (`^`) — el día en que deja de servir hacerlo. Es lo que no se negocia.

Mezclarlas es como se acaba con veinte tareas «urgentes» que no vencen nada. En las tarjetas
la fecha tope se lee de un vistazo, con los días que quedan, y sube de tono sola: gris de lejos,
marcada a tres días, roja el día del tope, y en rojo sólido cuando ya ha vencido, con una barra
en la tarjeta y el borde izquierdo encendido.

## Avisos

Cualquier tarea puede llevar un aviso: fecha y hora. Llega como **notificación del escritorio**,
aunque el navegador esté cerrado, mientras GSD esté en marcha — lo dispara el servidor local, no la página.

Se pone con `%` al capturar (`%18:00`, `%mañana-9`), o en la tarea con sus botones rápidos:
**EN 1 H · HOY 18:00 · MAÑANA 9:00 · DÍA DE ACCIÓN 9:00 · VÍSPERA DEL TOPE 18:00**. Sin día, el
aviso cae el día de acción si lo hay, y si no, hoy (o mañana si esa hora ya pasó).

Los avisos se ven en las tarjetas, en el calendario (marca ◷ y lista de horas del día) y el próximo
de hoy en la línea de *El día*. Cada aviso suena una sola vez, también si se reinicia el servidor;
los de lo único y los que tienen el tope encima llegan como urgentes. Un aviso con más de un día
de retraso —porque el equipo estaba apagado— ya no avisa de nada y se descarta. Las tareas de
proyectos en pausa no avisan.

## Tareas que vuelven

Una tarea con repetición genera la siguiente **al completarla**, nunca antes.
No se acumulan doce copias por no haber sacado la basura: hay una, y hasta que
no la cierras no aparece la siguiente.

Reglas admitidas: cada día, cada N días, días concretos de la semana
(`lun,mie,vie`) y un día fijo de cada mes (`mes-1`, `mes-15`).

## Los tableros

Dos, con las mismas columnas de GTD — **BANDEJA · SIGUIENTE · EN ESPERA · ALGÚN DÍA · HECHO**:

- **TABLERO** — todo el trabajo junto, con la etiqueta del proyecto en cada tarjeta
  y filtro por contexto.
- **PROYECTOS** — galería con el avance de cada uno y su siguiente acción; cada tarjeta
  abre el tablero de ese proyecto.

El tablero global filtra por **contexto** y por **proyecto**, y las columnas vacías dicen qué
significa que estén vacías en vez de un guion.

Cada tarjeta lleva su **casilla de completar** a la izquierda: cerrar algo está siempre a un
clic, sin abrir nada. Muestra proyecto, contexto, fechas, repetición, a quién esperas con su
fecha de revisión, y una marca si tiene notas. El resto de acciones aparecen al pasar por encima — enfocar, hacerla lo
único, mover, editar, eliminar — y en el móvil están siempre visibles.

Para cambiar de columna: se arrastra con el ratón, o se pulsa **MOVER** y se elige el destino
de una lista. Cada movimiento cambia el estado real de la tarea, no la coloca en una casilla
decorativa. HECHO solo guarda lo cerrado en los últimos siete días: un tablero no es un archivo.

**Columnas configurables** (botón `COLUMNAS`): puedes renombrarlas, reordenarlas, esconder
las que no uses y ponerles un tope de tarjetas. Al pasarte del tope, la columna se pone en
rojo y te lo dice. Lo que no se puede es inventar columnas nuevas: las columnas *son* los
estados de GTD, y una fase de más es una fase donde esconder trabajo.

## Proyectos

**Cada proyecto tiene un código** que va siempre delante del nombre: `P04-MUDANZA`. Lo asigna la
aplicación en orden y no cambia, así que sirve para citarlo al capturar (`#P04`) y para
encontrarlo sin pensar. Los proyectos que ya se llamaban «P04- …» conservaron su número.

**Se crean desde la propia galería**: la primera tarjeta es un proyecto nuevo con su código ya
puesto. Nombre, `Enter`, resultado, `Enter`, y está creado.

**Un proyecto se puede pausar**: una semana, dos, un mes, hasta una fecha o sin fecha. Mientras
dura la pausa, sus acciones salen de HOY, del tablero general y de siguientes acciones —solo su
propio tablero las muestra— y vuelve solo el día marcado. Pausar es decidirlo; dejar un proyecto
parado sin decir nada no lo es. Los pausados tienen su propia sección en la galería.

**Los proyectos se agrupan en carpetas** —ESTUDIOS, CLUB, CASA—, un área de responsabilidad por
carpeta. Se crean desde la galería o desde CONFIGURACIÓN, se pliegan pulsando su título, se
ordenan, y la cabecera de cada una dice lo que hay dentro: proyectos, acciones abiertas, cuántos
en pausa y cuántos sin siguiente acción. Un proyecto vive en una carpeta o en ninguna, nunca en
dos, y se mueve desde su tarjeta (`CARPETA`) o desde la cabecera de su tablero. Eliminar una
carpeta no borra proyectos: se quedan sin carpeta. Una carpeta entera se puede pausar de golpe,
que es lo que se hace cuando un área completa deja de tocar durante un tiempo.

Plegar no es pausar: una carpeta plegada solo ocupa menos sitio, sus acciones siguen en HOY.

La galería ordena por lo que exige atención: primero los que no tienen siguiente acción,
después los que no tienen resultado definido. Cada tarjeta muestra el avance, la siguiente
acción, cuántas arrastras y la fecha tope más apretada del proyecto.

Y cada tarjeta lleva un campo para **escribir la siguiente acción sin entrar** — en rojo
cuando no hay ninguna. Lo que desatasca un proyecto parado es escribirla, y escribirla debe
costar una línea. Admite la misma sintaxis que la captura.

Dentro, el tablero del proyecto abre con su barra de avance: porcentaje, abiertas y hechas.

**El resultado se edita donde se lee**, en cualquier momento: pulsando sobre él en la galería
o en la cabecera del tablero del proyecto. Y si falta, no se esconde — la tarjeta lo dice en
rojo y el tablero abre con el aviso: *¿cómo sabrás que está terminado?*

## HOY, y qué se hace ahora

HOY abre con **AHORA**: un bloque invertido, enorme, con una sola tarea y un botón para
empezarla. No hay que buscar por dónde seguir. El orden con el que se elige no es negociable:

```
LO ÚNICO  →  LO QUE ARRASTRAS  →  LO COMPROMETIDO  →  LO QUE VENCE HOY
```

El bloque dice por qué esa y no otra —`LO ÚNICO`, `LO ARRASTRAS 4D`, `TE COMPROMETISTE`,
`VENCIÓ`—, cuántas quedan detrás, y si además arrastras otras, con un atajo para empezar por
la peor. Si no hay nada decidido, el bloque no propone tareas: pregunta cuál es la única cosa,
porque elegir también es el trabajo.

Debajo, **EL DÍA**: una línea, no un panel. Compromisos cumplidos de los que dijiste, minutos
de trabajo profundo y lo que tiene la fecha tope encima. Responde a una sola pregunta —¿voy
cumpliendo lo que dije?— y a nada más.

Después, **DESPUÉS**: la cola del día numerada, para ver cuánto queda sin contarlo. Luego lo
que aprieta —**VENCE PRONTO** y la **BANDEJA**— y, plegado al final, **EL RESTO DEL SISTEMA**:
en espera, lo que está fuera de hoy y las anotaciones fijadas. Está plegado porque ahora no
toca.

## Anotaciones

Material de referencia: información que no se hace, se consulta. Es lo que permite vaciar la
bandeja de verdad, porque lo que no es una acción tiene un sitio al que ir que no es «ya lo
miro».

- Una anotación **no tiene casilla, ni fecha, ni prioridad**, y no aparece en ningún tablero:
  no es trabajo pendiente y no se cuenta como tal.
- **Se escribe donde se lee.** El título y el cuerpo de la tarjeta son editables y se guardan
  solos mientras escribes.
- **Se archivan en un proyecto.** Una línea con `#P04` basta; también aparecen en el tablero
  de ese proyecto, debajo de las columnas.
- **Fijar** una anotación (`◇`) la saca arriba del archivo y la muestra en HOY.
- `ANOTAR` es la opción `2` al aclarar la bandeja, y cualquier tarea pasa a serlo desde su
  editor. Al convertirse pierde fechas, avisos y repetición: una nota con fecha tope es una
  tarea disfrazada.
- Lo contrario también: `A ACCIÓN` la devuelve a siguientes acciones cuando resulta que sí
  era trabajo.

## Trabajo profundo

Dos formas de ejecutar, misma pantalla sin distracciones:

- **ENFOQUE** (`F`) — una tarea, empezar ya, temporizador opcional de 25/50/90 min.
- **TRABAJO PROFUNDO** (`D`) — un bloque protegido. Antes de empezar decides dos cosas:
  cuánto dura (60/90/120 o sin límite) y **qué significa terminar**. Durante el bloque no
  hay navegación, `Esc` no vale, y abandonar exige mantener pulsado dos segundos y medio.
  Al cerrarlo se registra el tiempo real.

Las horas de trabajo profundo son la única métrica de esfuerzo que guarda la aplicación,
y aparecen en HOY y en la revisión semanal. No se cuenta nada más: ni sesiones abiertas,
ni tareas tocadas, ni rachas.

---

## Revisión semanal

Diez pasos, y ninguno obliga a salir de la pantalla: cada uno se abre y **se resuelve ahí
mismo**, porque una revisión que te manda a otra vista se pierde por el camino.

| Paso | Qué se decide |
|---|---|
| **VACIAR** | La bandeja a cero. |
| **DEUDA** | Lo que dijiste y no hiciste: hacerla, reprogramarla o tirarla. |
| **CALENDARIO** | Lo que viene y lo que vence en dos semanas. |
| **PROYECTOS** | Parados, sin resultado, o en pausa sin fecha de vuelta. La siguiente acción se escribe en el propio paso. |
| **EN ESPERA** | Seguimientos vencidos: recibido, +7 días o recuperar. |
| **ACCIONES** | Las que llevan tres semanas sin moverse. O siguen valiendo o no. |
| **ALGÚN DÍA** | Lo aparcado hace meses: activarlo, anotarlo o tirarlo. |
| **ANOTACIONES** | El archivo de referencia. |
| **CRÓNICAS** | Lo pospuesto una y otra vez. Eso no es una tarea, es una decisión. |
| **LA SEMANA** | Lo único y los compromisos. |

Cada paso muestra en rojo cuánto queda sin resolver, y la cabecera dice cuántos días llevas
sin cerrar una revisión. Al marcar uno se abre el siguiente solo. Al terminar, el cierre dice
la verdad: *SISTEMA LIMPIO* si de verdad no queda nada, y *REVISADO* —con la lista de lo que
sigue sucio— si lo miraste pero no lo resolviste.

---

## Pantallas

| Pantalla | Para qué |
|---|---|
| **HOY** | Lo primero al abrir: AHORA —una sola cosa, enorme—, cómo va el día, la cola numerada de lo que queda, lo que vence pronto, la bandeja, y plegado, el resto. |
| **TABLERO** | Todo el trabajo en un kanban GTD, con etiqueta de proyecto, filtro por contexto y columnas configurables. |
| **PROYECTOS** | Galería de resultados en marcha, agrupada en carpetas. Cada uno abre su propio tablero. |
| **SIGUIENTES ACCIONES** | La lista plana de acciones concretas, filtrable por contexto. |
| **EN ESPERA** | Lo delegado, por persona, con fecha de revisión. |
| **ALGÚN DÍA** | Ideas fuera del campo de atención. |
| **ANOTACIONES** | El archivo de referencia: información, no trabajo. |
| **CALENDARIO** | Solo lo que tiene fecha. Mensual, sin adornos. |
| **REVISIÓN SEMANAL** | Diez pasos que se resuelven ahí mismo, el marcador y las horas de trabajo profundo. |
| **DATOS** | Respaldo, exportar, importar y recuperar una copia. |
| **CONFIGURACIÓN** | Contextos, carpetas, columnas, los dos topes que aprietan y el aspecto. |

---

## Atajos

```
N       Nueva tarea (captura rápida)     ↑ ↓ · J K   Mover el cursor
T       Hoy                              ← →         Mover la tarjeta de columna
B       Tablero                          Espacio     Completar
I       Aclarar la bandeja               Enter       Abrir / confirmar
F       Enfoque sobre lo único           0 – 6       Aclarar la bandeja
D       Trabajo profundo                 Esc         Salir
O       Elegir lo único                  \           Plegar la barra lateral
P       Proyectos
W       En espera                        /           Buscar
S       Algún día                        Ctrl + K    Buscar
A       Anotaciones
C       Calendario
R       Revisión semanal
```

Dentro de Focus la navegación se desactiva. No hay nada que hacer salvo trabajar o terminar.

---

## La fricción, y por qué existe

La aplicación no bloquea al usuario. Solo evita que renegociar salga gratis.

- **NO NEGOCIAR.** Una tarea marcada como compromiso del día. Retirarla o posponerla
  exige mantener pulsado el botón, no un clic.
- **La fricción crece con el historial.** Mantener pulsado dura más cuanto más has huido
  de esa tarea: 0,9 s la primera vez, hasta 3 s cuando acumula aplazamientos y días
  arrastrados. Escapar cuesta más cada vez que escapas.
- **Una sola One Thing.** Cambiarla exige mantener pulsado, y pregunta lo único que
  importa: *¿es más difícil, o solo más cómoda?*
- **Tope de compromisos.** Al pasar de cinco: *You don't need more tasks. You need execution.*
- **Abandonar una sesión de trabajo** también exige mantener pulsado.

## Las cuentas

Lo que no se mide se negocia. La aplicación lleva tres registros, y ninguno es un premio.

- **LO QUE ARRASTRAS.** Encabeza la pantalla de HOY. Todo lo que te comprometiste a hacer
  un día concreto y sigue sin hacer, con los días que llevas arrastrándolo. No es un
  aplazamiento declarado: es lo que se escapó en silencio.
- **MIRA LO QUE HAS HECHO.** Si terminas tres o más tareas en un día y la One Thing sigue
  intacta, te lo dice: *busy is not the same as hard.*
- **EL MARCADOR.** En la revisión semanal, un solo número grande: qué porcentaje de lo que
  dijiste que harías has hecho. Por debajo del 60 % se pone rojo.
- **DECIDE.** A los tres aplazamientos la tarea deja de pedir otra fecha y pide una decisión:
  hacerla, delegarla, programarla de verdad o eliminarla.

Nada de puntos, niveles, medallas, rachas ni celebraciones. La disciplina está en el
comportamiento de la aplicación, no en su decoración.

## Configuración

Poco que tocar, y todo cambia cómo te exige:

- **Contextos** — crear, renombrar y eliminar. Renombrar arrastra a todas las tareas que lo
  usaban; eliminar no borra trabajo, solo deja esas tareas sin etiqueta. Se ve cuántas
  acciones abiertas usa cada uno, para saber cuáles sobran.
- **Carpetas de proyectos** — crear, renombrar, ordenar y eliminar. Eliminar no borra
  proyectos: se quedan sin carpeta.
- **Compromisos máximos por día** — el tope a partir del cual la aplicación te lo dice y te
  obliga a confirmar. De fábrica, cinco.
- **Aplazamientos antes de exigir decisión** — a partir de ahí la tarea deja de pedir fecha
  y pide una decisión. De fábrica, tres.
- **Columnas del tablero** y **aspecto** (tema y barra lateral).

Subir los topes es más fácil que cumplirlos, y la pantalla te lo recuerda.

## El tono

Ninguna frase es aleatoria. Todas se deducen de lo que estás haciendo o dejando de hacer:
el inbox te habla distinto con 3 elementos que con 20, Someday te lo dice cuando se
convierte en un vertedero, y Focus cambia lo que dice según cuántas veces hayas huido de
esa tarea. Una frase genérica se vuelve ruido de fondo en tres días; una que te ha pillado, no.

Atravesándolo todo, una idea: **si cuesta, es que estás aprendiendo**. La dificultad no es
la señal de que vas mal. Es la señal de que vas.

---

## Los datos

Almacenamiento local en dos capas, por si una falla:

1. **IndexedDB** en el navegador. Es la fuente de verdad y responde al instante.
2. **Copia en disco**, escrita por el servidor local tras cada cambio:
   - `data/gsd-data.json` — estado completo, escritura atómica.
   - `data/gsd-data.json.prev` — la versión inmediatamente anterior, siempre.
   - `data/backups/gsd-AAAA-MM-DD.json` — una copia por día, se guardan los últimos 30.
   - `data/backups/gsd-antes-de-vaciar-*.json` — si alguna vez llega un estado vacío
     habiendo datos, se guarda antes una copia aparte que la rotación diaria no pisa.
   - `data/avisos-enviados.json` — qué avisos han sonado ya, para no repetir ninguno.

La carpeta `data/` está fuera del control de versiones (`.gitignore`). Tus tareas son tuyas:
clonar este repositorio no trae los datos de nadie, y publicar tus cambios no se lleva los tuyos.

Si el navegador pierde su base de datos, la aplicación la restaura sola desde el disco
al abrirse y lo avisa. Y en **DATOS → RECUPERAR UNA COPIA** están todas las copias listadas
para restaurar con un clic: recuperar los datos no debería exigir saber moverse por carpetas.

Además: **DATOS → Exportar JSON** (recuperable) o **CSV** (solo lectura).
Importar admite *fusionar* (añade lo que falte) o *reemplazar todo* (exige mantener pulsado).

---

## Modelo de datos

```
Task        id · title · status · projectId · context · dueDate · deadline · reminder
            waitingFor · notes · createdAt · completedAt · completed · isOneThing
            isCommitment · postponeCount · recurrence · pinned

Project     id · code · name · outcome · folderId · status · pausedUntil · createdAt

Folder      id · name · createdAt          (en los ajustes: son cajones, no datos)

Session     id · taskId · kind · plannedMin · startedAt · endedAt · minutes · note

WaitingFor  id · taskId · person · description · reviewDate
```

`status`: `inbox` · `next` · `scheduled` · `waiting` · `someday` · `reference` · `done`

`reference` es una anotación. `pinned` solo significa algo en ellas.

---

## Estructura

```
server.js               Servidor local (sin dependencias). Estáticos + respaldo en disco.
start.sh                Lanzador: start | stop | status.
check.sh                Comprueba la sintaxis de todo. Lo único parecido a un build.
GSD.desktop.example     Plantilla del lanzador de escritorio.
data/                   Copias en disco, más server.pid y server.log. Sin versionar.
public/
  index.html
  icon.svg              Icono de la aplicación y del lanzador.
  css/app.css
  js/
    app.js              Router, navegación y teclado.
    store.js            Estado y reglas del sistema.
    db.js               IndexedDB.
    sync.js             Respaldo en disco.
    components.js       Filas, capas, editor, captura, fricción.
    parse.js            Sintaxis de captura: @ # ! ^ * % !!
    assist.js           Leyenda y opciones de la sintaxis mientras se escribe.
    voice.js            Las frases duras, deducidas del estado.
    focus.js            Enfoque, trabajo profundo y registro de sesiones.
    search.js           Búsqueda instantánea.
    util.js             Fechas, DOM, avisos.
    viewkeys.js         Atajos propios de cada vista.
    views/              Una por pantalla (board.js sirve los dos tableros,
                        notes.js el archivo y la tira de cada proyecto).
```

---

## Tocar el código

No hay build, ni empaquetador, ni dependencias: se edita el fichero y se recarga la página.
Antes de dar nada por bueno:

```bash
./check.sh          # sintaxis de los módulos del navegador, del servidor y de los guiones
```

`node --check` no valida como módulo ES un `.js` con `import`, así que `check.sh` copia cada
fichero a `.mjs` antes de comprobarlo. Comprobar de verdad o no comprobar.

## La regla que gobierna el código

Antes de añadir cualquier función:

> ¿Ayuda directamente a capturar, aclarar, organizar, revisar o ejecutar?
> ¿O solo le da al usuario otra cosa que hacer dentro de la aplicación?

Si genera trabajo administrativo, no entra.

---

## Licencia

MIT — © 2026 Tomas. Haz con esto lo que quieras; si te sirve, mejor.
