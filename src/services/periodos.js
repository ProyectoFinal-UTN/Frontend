/**
 * El período de los indicadores (HU-23).
 *
 * Todo lo que tiene que ver con "de cuándo a cuándo" vive acá: la zona en la
 * que se corta el día, los presets del selector, qué parámetros viajan en cada
 * caso, qué se valida antes de pedir, y cómo se agrupa la serie diaria cuando
 * el rango es largo.
 *
 * No habla con la red. `services/kpis.js` usa `parametrosDePeriodo` para armar
 * la query y `components/SeccionKpis.jsx` usa el resto para pintar y validar.
 *
 * ## Por qué la zona es explícita y fija
 *
 * El backend corta los días en Argentina (`kpis.service.js`, `ZONA_HORARIA`),
 * no en la zona del navegador. Un `new Date().setHours(0,0,0,0)` con el browser
 * en otra zona deja el borde del día corrido y el primer y el último día de la
 * serie salen partidos. Así que el rango se arma en hora argentina, a mano.
 *
 * El offset va fijo en `-03:00` a propósito, igual que en el backend: Argentina
 * no tiene horario de verano desde 2009, y es el mismo offset con el que el
 * backend corta. Con eso alcanza y no hace falta una librería de zonas.
 *
 * **Por eso no se reusan `inicioDelDia`/`finDelDia` de `movimientos.js`**: esos
 * construyen el instante en la hora local del navegador, que es lo correcto
 * para `/api/reportes` (que recibe `zonaHoraria` aparte) y lo incorrecto acá.
 *
 * ## Semana y mes son de CALENDARIO, no rodantes
 *
 * "Esta semana" es lunes a domingo y "este mes" es del 1 al último día. Es lo
 * que hace comparables dos períodos entre sí, que es el punto de "analizar la
 * evolución del negocio" de la historia. Una semana rodante de 7 días no se
 * puede comparar con la anterior sin que se solapen.
 */

export const ZONA = "America/Argentina/Buenos_Aires";
const OFFSET = "-03:00";

const DIA_MS = 86_400_000;

/**
 * Los dos topes del backend, que **se comportan distinto** y se confunden:
 *
 * - `dias` (ventana móvil) se RECORTA en silencio a 90: pedir más no es error.
 * - un rango `desde`/`hasta` se RECHAZA con 400 arriba de 366 días, no se
 *   recorta, porque para recortarlo habría que mover un extremo y cuál de los
 *   dos es adivinar.
 *
 * Están acá para no repetir el número y para que el test del cliente y el
 * mensaje de pantalla salgan del mismo lugar.
 */
export const TOPE_MOVIL_DIAS = 90;
export const TOPE_RANGO_DIAS = 366;

/** "2026-11-27": el día calendario de un instante, en hora de Argentina. */
export const diaEnZona = (fecha = new Date()) =>
  fecha.toLocaleDateString("en-CA", { timeZone: ZONA });

/**
 * Los dos extremos que espera el backend, a partir de dos días calendario.
 *
 * Los DOS son inclusive. Para marzo va del 1 a las 00:00 al 31 a las 23:59, no
 * al 1 de abril: mandar el 1 de abril a las 00:00 esperando que quede afuera lo
 * mete adentro y suma el primer día de abril.
 */
export const rango = (diaDesde, diaHasta) => ({
  desde: `${diaDesde}T00:00:00.000${OFFSET}`,
  hasta: `${diaHasta}T23:59:59.000${OFFSET}`,
});

/** Suma días a un "YYYY-MM-DD" sin que la zona del browser se meta. */
export function sumarDias(dia, cantidad) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) + cantidad * DIA_MS)
    .toISOString()
    .slice(0, 10);
}

const ES_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Si es un "YYYY-MM-DD" como el que da un `<input type="date">`. */
export const esDia = (valor) => ES_DIA.test(valor ?? "");

/**
 * Días calendario que abarcan dos días, LOS DOS INCLUIDOS.
 *
 * La misma cuenta que hace el backend (`ventanaDeKpis`): del 1 al 1 es 1 día,
 * no 0. Se hace sobre `Date.UTC` de las partes y no sobre los instantes con
 * offset para que la cuenta no dependa de ninguna zona.
 */
export function diasEntre(diaDesde, diaHasta) {
  const [a1, m1, d1] = diaDesde.split("-").map(Number);
  const [a2, m2, d2] = diaHasta.split("-").map(Number);
  const ms = Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1);
  return Math.round(ms / DIA_MS) + 1;
}

export const presets = {
  dia: (hoy = diaEnZona()) => rango(hoy, hoy),

  semana: (hoy = diaEnZona()) => {
    const [a, m, d] = hoy.split("-").map(Number);
    const diaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
    const lunes = sumarDias(hoy, diaSemana === 0 ? -6 : 1 - diaSemana);
    return rango(lunes, sumarDias(lunes, 6));
  },

  mes: (hoy = diaEnZona()) => {
    const [a, m] = hoy.split("-").map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    return rango(`${hoy.slice(0, 7)}-01`, ultimo);
  },
};

/**
 * Las opciones del selector, en el orden en que se muestran.
 *
 * `clase` decide por qué vía viaja el período:
 *
 *   movil        `dias=N` — la ventana que termina hoy
 *   calendario   `desde`+`hasta` — resuelto por un preset de `presets`
 *
 * La vía móvil se usa para todo lo rodante por dos motivos: nos ahorra armar
 * las fechas, y `dias` genera muchas menos claves de caché en el backend (que
 * tiene tope de 500 entradas, y los rangos arbitrarios lo llenan más rápido).
 *
 * "Hoy" va por `dias=1` y no por `presets.dia` por lo mismo: es una sola clave
 * de caché por comercio en vez de una por día. Son el mismo período.
 *
 * Las etiquetas de 7, 30 y 90 son **las de HU-22 y no se tocan**: el page
 * object del E2E que ya está mergeado busca esos botones por su nombre
 * accesible (`ventana(30)` → `"30 días"`).
 */
export const PERIODOS = Object.freeze([
  { id: "hoy", etiqueta: "Hoy", clase: "movil", dias: 1 },
  { id: "7", etiqueta: "7 días", clase: "movil", dias: 7 },
  { id: "30", etiqueta: "30 días", clase: "movil", dias: 30 },
  { id: "90", etiqueta: "90 días", clase: "movil", dias: 90 },
  { id: "semana", etiqueta: "Esta semana", clase: "calendario", preset: "semana" },
  { id: "mes", etiqueta: "Este mes", clase: "calendario", preset: "mes" },
]);

/** El id del rango que se escribe a mano. No está en `PERIODOS`: no es un botón. */
export const ID_PERSONALIZADO = "personalizado";

/** El que trae el dashboard al abrir. Es también el default del backend. */
export const PERIODO_POR_DEFECTO = Object.freeze({ id: "30" });

export const opcionDe = (id) => PERIODOS.find((opcion) => opcion.id === id);

/**
 * Los días que se le pidieron al backend, o `null` si el período no va por
 * `dias`. Es contra esto que se compara `periodo.dias` de la respuesta para
 * descubrir si hubo recorte silencioso.
 */
export function diasPedidos(periodo) {
  return opcionDe(periodo?.id)?.dias ?? null;
}

/**
 * Qué parámetros viajan para este período.
 *
 * Devuelve `{ dias }` **o** `{ desde, hasta }`, nunca los dos: mandarlos juntos
 * es un 400, y acá no hay forma de que pase.
 */
export function parametrosDePeriodo(periodo = PERIODO_POR_DEFECTO) {
  if (periodo.id === ID_PERSONALIZADO) {
    return rango(periodo.desde, periodo.hasta);
  }

  const opcion = opcionDe(periodo.id) ?? opcionDe(PERIODO_POR_DEFECTO.id);

  return opcion.clase === "movil"
    ? { dias: opcion.dias }
    : presets[opcion.preset]();
}

/**
 * La marca del pedido: cambia si y sólo si cambia lo que se le va a pedir.
 *
 * Sale de los parámetros resueltos y no del id, así que un preset de calendario
 * que cruza la medianoche se vuelve a pedir solo. Se compara en el render
 * contra la marca que volvió con la respuesta, que es cómo se deriva "está
 * cargando" sin un `useState` y sin un `setState` dentro de un efecto.
 */
export function claveDePeriodo(periodo) {
  const parametros = parametrosDePeriodo(periodo);
  return parametros.dias === undefined
    ? `rango|${parametros.desde}|${parametros.hasta}`
    : `movil|${parametros.dias}`;
}

/**
 * Si el período está completo como para pedirlo.
 *
 * Un rango a medio escribir no es un error: mientras falte una de las dos
 * fechas no se pide nada y no se muestra ningún aviso. Mandar `desde` solo es
 * un 400 seguro ("van los dos o ninguno").
 */
export function periodoListo(periodo) {
  if (periodo?.id !== ID_PERSONALIZADO) return true;
  return (
    esDia(periodo.desde) &&
    esDia(periodo.hasta) &&
    validarPeriodo(periodo) === null
  );
}

/**
 * Lo que se valida en el cliente antes de pedir, o `null` si está bien.
 *
 * Sólo lo que es inequívoco y ahorra un viaje, con el criterio de HU-21: el
 * rango al revés y el que se pasa del tope. El formato ISO y la zona no se
 * validan porque son imposibles de producir mal desde un `<input type="date">`
 * más `rango()`, y mezclar `dias` con el rango tampoco, porque
 * `parametrosDePeriodo` devuelve una forma o la otra.
 *
 * El texto es propio y no el del backend: acá el backend no contestó nada. Lo
 * que él responde se muestra tal cual, en otro lugar.
 */
export function validarPeriodo(periodo) {
  if (periodo?.id !== ID_PERSONALIZADO) return null;

  const { desde, hasta } = periodo;
  if (!esDia(desde) || !esDia(hasta)) return null;

  // Comparación de strings: "YYYY-MM-DD" ordena igual como texto que como fecha.
  if (desde > hasta) {
    return "La fecha «Desde» no puede ser posterior a «Hasta».";
  }

  const dias = diasEntre(desde, hasta);
  if (dias > TOPE_RANGO_DIAS) {
    return (
      `El período no puede abarcar más de ${TOPE_RANGO_DIAS} días y el que ` +
      `elegiste abarca ${dias}.`
    );
  }

  return null;
}

/** "2026-11-22" → "22/11". Es un día de Argentina, no un instante. */
export function diaCorto(fecha) {
  const [, mes, dia] = fecha.split("-");
  return `${dia}/${mes}`;
}

const FORMATO_DIA = Object.freeze({
  timeZone: ZONA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Un instante ISO de la respuesta, como día de Argentina.
 *
 * `periodo.desde` y `periodo.hasta` vuelven en UTC con `Z`, no con el offset que
 * se mandó. Es el mismo instante en otra representación: pintarlo crudo muestra
 * "03:00Z" donde la persona pidió "00:00". De ahí el `timeZone` explícito.
 */
export function diaDeInstante(iso) {
  return new Date(iso).toLocaleDateString("es-AR", FORMATO_DIA);
}

/**
 * El período EFECTIVO para mostrar, leído de la respuesta y no de lo que se
 * pidió. Es la única fuente válida: si el backend recortó, acá se ve recortado.
 */
export function etiquetaDeRespuesta(periodo) {
  const desde = diaDeInstante(periodo.desde);
  const hasta = diaDeInstante(periodo.hasta);
  return desde === hasta ? desde : `${desde} al ${hasta}`;
}

/** Si el período de la respuesta termina hoy, en hora de Argentina. */
export function terminaHoy(periodo, ahora = new Date()) {
  return diaEnZona(new Date(periodo.hasta)) === diaEnZona(ahora);
}

/**
 * Hasta cuántos días se dibuja una barra por día.
 *
 * 62 son dos meses: a partir de ahí las barras se vuelven líneas de un píxel y
 * el gráfico deja de decir nada. 180 es medio año, donde la semana también se
 * queda corta.
 */
export const TOPE_SERIE_DIARIA = 62;
export const TOPE_SERIE_SEMANAL = 180;

const NOMBRE_DE_MES = Object.freeze({
  timeZone: "UTC",
  month: "short",
  year: "2-digit",
});

/** El lunes de la semana de un día. */
function lunesDe(dia) {
  const [a, m, d] = dia.split("-").map(Number);
  const diaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return sumarDias(dia, diaSemana === 0 ? -6 : 1 - diaSemana);
}

/** "nov 26" para un "YYYY-MM". En UTC porque son partes, no un instante. */
function nombreDeMes(mes) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("es-AR", NOMBRE_DE_MES);
}

/**
 * La serie que se dibuja: una barra por día, por semana o por mes.
 *
 * Con el tope de 366 días, `porDia` trae 366 elementos y 366 barras no se leen.
 * Se agrupan por semana o por mes de CALENDARIO, igual que los presets, para
 * que dos períodos sigan siendo comparables.
 *
 * **La suma no cambia.** Sólo se suman días adyacentes y no se descarta
 * ninguno, así que la suma de las barras sigue dando `rotacion.unidadesVendidas`
 * y el gráfico nunca contradice la tarjeta de arriba. Va asertado en el test.
 *
 * La etiqueta de una semana usa el primer y el último día QUE ESTÁN en el
 * grupo, no el lunes y el domingo teóricos: si el rango arranca un miércoles,
 * la primera barra dice "18/03–22/03" y no promete días que no mira.
 *
 * El drill-down al día es HU-24, no esto.
 */
export function agruparSerie(porDia = []) {
  if (porDia.length <= TOPE_SERIE_DIARIA) {
    return {
      granularidad: "dia",
      barras: porDia.map((dia) => ({ ...dia, etiqueta: diaCorto(dia.fecha) })),
    };
  }

  const granularidad =
    porDia.length <= TOPE_SERIE_SEMANAL ? "semana" : "mes";

  // `Map` y no un objeto: conserva el orden de inserción, y `porDia` ya viene
  // del más viejo al más nuevo, así que las barras salen ordenadas sin ordenar.
  const grupos = new Map();

  for (const dia of porDia) {
    const cubeta =
      granularidad === "mes" ? dia.fecha.slice(0, 7) : lunesDe(dia.fecha);

    const grupo = grupos.get(cubeta);
    if (grupo) {
      grupo.ventas += dia.ventas;
      grupo.unidades += dia.unidades;
      grupo.ultima = dia.fecha;
    } else {
      grupos.set(cubeta, {
        fecha: dia.fecha,
        ultima: dia.fecha,
        ventas: dia.ventas,
        unidades: dia.unidades,
      });
    }
  }

  const barras = [...grupos].map(([cubeta, grupo]) => ({
    fecha: grupo.fecha,
    ventas: grupo.ventas,
    unidades: grupo.unidades,
    etiqueta:
      granularidad === "mes"
        ? nombreDeMes(cubeta)
        : grupo.fecha === grupo.ultima
          ? diaCorto(grupo.fecha)
          : `${diaCorto(grupo.fecha)}–${diaCorto(grupo.ultima)}`,
  }));

  return { granularidad, barras };
}

/** Cómo se llama la unidad de la serie, para el título del gráfico. */
export const UNIDAD_DE_SERIE = Object.freeze({
  dia: "día",
  semana: "semana",
  mes: "mes",
});
