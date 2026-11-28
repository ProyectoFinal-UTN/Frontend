import { afterEach, describe, expect, test, vi } from "vitest";
// El fuente como texto, para asertar sobre él (abajo, "la zona ambiente").
import fuente from "./periodos.js?raw";
import {
  ID_PERSONALIZADO,
  PERIODOS,
  PERIODO_POR_DEFECTO,
  TOPE_MOVIL_DIAS,
  TOPE_RANGO_DIAS,
  TOPE_SERIE_DIARIA,
  TOPE_SERIE_SEMANAL,
  agruparSerie,
  claveDePeriodo,
  diaCorto,
  diaDeInstante,
  diaEnZona,
  diasEntre,
  diasPedidos,
  esDia,
  etiquetaDeRespuesta,
  parametrosDePeriodo,
  periodoListo,
  presets,
  rango,
  sumarDias,
  terminaHoy,
  validarPeriodo,
} from "./periodos";

/**
 * Los períodos de los KPIs (HU-23).
 *
 * Todo lo que se prueba acá es puro y sin reloj: las funciones que dependen de
 * "hoy" lo reciben como parámetro, justamente para poder correr los cortes de
 * día sin esperar a mañana.
 *
 * ## Sobre la zona horaria
 *
 * El backend corta los días en Argentina, no donde esté el navegador, así que
 * el riesgo es que un borde de día se calcule con la zona ambiente. Acá eso se
 * prueba de la única forma que sirve: asertando los instantes LITERALES que
 * salen —con el `-03:00` escrito— y el día argentino de un instante conocido.
 * Si alguna de las dos cosas se calculara con la zona de la máquina, estas
 * aserciones fallarían en cualquier máquina que no esté en Argentina.
 *
 * Cambiar `process.env.TZ` desde adentro de un test NO sirve para esto: ICU
 * resuelve la zona por defecto una sola vez, así que un test así pasa igual
 * esté bien o mal el código. La verificación de verdad es correr la suite
 * entera con `TZ` de otra parte, y está en el reporte del PR.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe("la zona ambiente no se usa en ninguna parte", () => {
  // Esta es la verificación que de verdad cubre el riesgo, y la razón por la
  // que no alcanza con correr la suite con otro `TZ`: en Windows, Node ignora
  // `process.env.TZ` y resuelve la zona del sistema operativo, así que una
  // corrida "en Tokio" pasa igual esté bien o mal el código.
  //
  // Lo que sí se puede afirmar es que el módulo no tiene por dónde leer la
  // zona ambiente: los accesores locales de `Date` son la única puerta, y acá
  // no se usa ninguno.
  //
  // Se miran sin comentarios porque los docblocks de `periodos.js` NOMBRAN los
  // accesores que no hay que usar («no uses `setHours`»): buscarlos en el texto
  // crudo da un falso positivo justamente por explicar el bug.
  const codigo = fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const LOCALES = [
    "getHours",
    "getMinutes",
    "getDate",
    "getMonth",
    "getFullYear",
    "getDay",
    "setHours",
    "setDate",
    "setMonth",
    "setFullYear",
  ];

  test.each(LOCALES)("no usa `%s`, que lee la hora local", (accesor) => {
    // `getUTCDay` sí se usa, y no es lo mismo: `getDay` daría otro día de la
    // semana según dónde esté la máquina, y la semana de calendario saldría
    // corrida.
    expect(codigo).not.toMatch(new RegExp(`\\.${accesor}\\s*\\(`));
  });

  test("sí usa los de UTC, que son los que no dependen de nada", () => {
    expect(codigo).toMatch(/\.getUTCDay\s*\(/);
  });

  test("cada formateo de Intl declara su `timeZone`", () => {
    // Un `toLocaleDateString` sin `timeZone` formatea en la zona de la máquina.
    // Se cuentan las llamadas y los objetos de opciones con `timeZone`: si
    // alguien agrega una llamada sin opciones, el conteo deja de cerrar.
    const llamadas = codigo.match(/toLocale(Date|Time)?String\s*\(/g) ?? [];
    const conZona = codigo.match(/timeZone:/g) ?? [];
    expect(llamadas.length).toBeGreaterThan(0);
    expect(conZona.length).toBeGreaterThanOrEqual(llamadas.length);
  });
});

describe("rango", () => {
  test("arma los dos extremos inclusive, en hora de Argentina", () => {
    expect(rango("2026-03-01", "2026-03-31")).toEqual({
      desde: "2026-03-01T00:00:00.000-03:00",
      hasta: "2026-03-31T23:59:59.000-03:00",
    });
  });

  test("un solo día es un rango válido de un día", () => {
    expect(rango("2026-11-27", "2026-11-27")).toEqual({
      desde: "2026-11-27T00:00:00.000-03:00",
      hasta: "2026-11-27T23:59:59.000-03:00",
    });
  });

  test("el offset va escrito y no sale de la zona de la máquina", () => {
    // Si se armara con `new Date().setHours(0,0,0,0)`, en una máquina que no
    // esté en Argentina el borde del día quedaría corrido y el primer y el
    // último día de la serie saldrían partidos. Acá el offset es literal.
    const { desde, hasta } = rango("2026-03-01", "2026-03-31");
    expect(desde).toMatch(/-03:00$/);
    expect(hasta).toMatch(/-03:00$/);
    expect(new Date(desde).toISOString()).toBe("2026-03-01T03:00:00.000Z");
    expect(new Date(hasta).toISOString()).toBe("2026-04-01T02:59:59.000Z");
  });
});

describe("sumarDias", () => {
  test.each([
    ["2026-11-27", 1, "2026-11-28"],
    ["2026-11-30", 1, "2026-12-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-01-01", -1, "2025-12-31"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2024-03-01", -1, "2024-02-29"],
    ["2026-11-27", 0, "2026-11-27"],
  ])("%s + %i días = %s", (dia, cantidad, esperado) => {
    expect(sumarDias(dia, cantidad)).toBe(esperado);
  });

  test("la cuenta es en UTC y no toca la zona de la máquina", () => {
    // `Date.UTC` + `toISOString`: no hay un solo `getHours`/`setHours` en el
    // camino, que es por donde se cuela la zona ambiente.
    expect(sumarDias("2026-11-27", 1)).toBe("2026-11-28");
    expect(sumarDias("2026-11-27", 365)).toBe("2027-11-27");
  });
});

describe("diasEntre", () => {
  test.each([
    ["2026-03-01", "2026-03-01", 1],
    ["2026-03-01", "2026-03-02", 2],
    ["2026-03-01", "2026-03-31", 31],
    ["2026-01-01", "2026-12-31", 365],
    ["2024-01-01", "2024-12-31", 366],
  ])("de %s a %s son %i días", (desde, hasta, esperado) => {
    expect(diasEntre(desde, hasta)).toBe(esperado);
  });

  test("del 1 al 1 es un día y no cero: los dos extremos cuentan", () => {
    expect(diasEntre("2026-03-01", "2026-03-01")).toBe(1);
  });
});

describe("presets", () => {
  test("«hoy» es un solo día, el de Argentina", () => {
    expect(presets.dia("2026-11-27")).toEqual(rango("2026-11-27", "2026-11-27"));
  });

  describe("«esta semana» es de calendario, lunes a domingo", () => {
    test.each([
      ["lunes", "2026-11-23"],
      ["miércoles", "2026-11-25"],
      ["sábado", "2026-11-28"],
      ["domingo", "2026-11-29"],
    ])("desde un %s da del 23 al 29", (_dia, hoy) => {
      // La semana del 23/11/2026 (lunes) al 29/11/2026 (domingo).
      expect(presets.semana(hoy)).toEqual(rango("2026-11-23", "2026-11-29"));
    });

    test("el domingo pertenece a la semana que termina, no a la que empieza", () => {
      // El bug clásico de `getDay()`: el domingo es 0, así que `1 - 0` daría el
      // lunes SIGUIENTE y la semana arrancaría un día después de terminar.
      const semana = presets.semana("2026-11-29");
      expect(semana.desde).toContain("2026-11-23");
      expect(semana.hasta).toContain("2026-11-29");
      expect(diasEntre("2026-11-23", "2026-11-29")).toBe(7);
    });
  });

  describe("«este mes» es del 1 al último día", () => {
    test.each([
      ["2026-11-27", "2026-11-01", "2026-11-30"],
      ["2026-11-01", "2026-11-01", "2026-11-30"],
      ["2026-11-30", "2026-11-01", "2026-11-30"],
      ["2026-12-15", "2026-12-01", "2026-12-31"],
      ["2026-02-10", "2026-02-01", "2026-02-28"],
      ["2024-02-10", "2024-02-01", "2024-02-29"],
    ])("desde %s va de %s a %s", (hoy, desde, hasta) => {
      expect(presets.mes(hoy)).toEqual(rango(desde, hasta));
    });
  });

  test("todos los presets salen con el offset de Argentina escrito", () => {
    for (const armar of [presets.dia, presets.semana, presets.mes]) {
      const { desde, hasta } = armar("2026-11-27");
      expect(desde).toMatch(/T00:00:00\.000-03:00$/);
      expect(hasta).toMatch(/T23:59:59\.000-03:00$/);
    }
  });
});

describe("diaEnZona", () => {
  test("el día de Argentina y no el de la máquina", () => {
    // 2026-11-28 a las 01:00 UTC es todavía el 27 en Argentina (−03:00). En
    // Tokio ya sería el 28, y en UTC también: si la función leyera la zona
    // ambiente, esta aserción fallaría en cualquier máquina al este de acá.
    expect(diaEnZona(new Date("2026-11-28T01:00:00.000Z"))).toBe("2026-11-27");
    // Y al revés: las 04:00 UTC ya son el 28 en Argentina.
    expect(diaEnZona(new Date("2026-11-28T04:00:00.000Z"))).toBe("2026-11-28");
  });
});

describe("esDia", () => {
  test.each(["2026-11-27", "2026-01-01"])("%p es un día", (valor) => {
    expect(esDia(valor)).toBe(true);
  });

  test.each(["", null, undefined, "2026-11", "27/11/2026", "2026-11-27T00:00"])(
    "%p no es un día",
    (valor) => {
      expect(esDia(valor)).toBe(false);
    },
  );
});

describe("parametrosDePeriodo", () => {
  test.each([
    ["hoy", 1],
    ["7", 7],
    ["30", 30],
    ["90", 90],
  ])("el preset móvil «%s» manda dias=%i", (id, dias) => {
    expect(parametrosDePeriodo({ id })).toEqual({ dias });
  });

  test("«esta semana» y «este mes» mandan el rango, no `dias`", () => {
    for (const id of ["semana", "mes"]) {
      const parametros = parametrosDePeriodo({ id });
      expect(parametros.dias).toBeUndefined();
      expect(parametros.desde).toMatch(/T00:00:00\.000-03:00$/);
      expect(parametros.hasta).toMatch(/T23:59:59\.000-03:00$/);
    }
  });

  test("el rango a mano manda los dos extremos del día elegido", () => {
    expect(
      parametrosDePeriodo({
        id: ID_PERSONALIZADO,
        desde: "2026-03-01",
        hasta: "2026-03-31",
      }),
    ).toEqual(rango("2026-03-01", "2026-03-31"));
  });

  test("NUNCA manda `dias` junto con el rango: mandar los dos es un 400", () => {
    for (const periodo of [
      ...PERIODOS.map((opcion) => ({ id: opcion.id })),
      { id: ID_PERSONALIZADO, desde: "2026-03-01", hasta: "2026-03-31" },
    ]) {
      const parametros = parametrosDePeriodo(periodo);
      const tieneDias = parametros.dias !== undefined;
      const tieneRango =
        parametros.desde !== undefined || parametros.hasta !== undefined;
      expect(tieneDias).not.toBe(tieneRango);
    }
  });

  test("un id que no existe cae en el default y no explota", () => {
    expect(parametrosDePeriodo({ id: "inventado" })).toEqual({ dias: 30 });
    expect(parametrosDePeriodo()).toEqual({ dias: 30 });
  });

  test("ninguna ventana móvil se pasa del tope que el backend recorta", () => {
    for (const opcion of PERIODOS.filter((o) => o.clase === "movil")) {
      expect(opcion.dias).toBeGreaterThanOrEqual(1);
      expect(opcion.dias).toBeLessThanOrEqual(TOPE_MOVIL_DIAS);
    }
  });

  test("el default del selector es el default del backend", () => {
    expect(parametrosDePeriodo(PERIODO_POR_DEFECTO)).toEqual({ dias: 30 });
  });
});

describe("diasPedidos", () => {
  test("son los días de la vía móvil, y null en la del rango", () => {
    expect(diasPedidos({ id: "7" })).toBe(7);
    expect(diasPedidos({ id: "hoy" })).toBe(1);
    expect(diasPedidos({ id: "mes" })).toBeNull();
    expect(diasPedidos({ id: ID_PERSONALIZADO })).toBeNull();
  });
});

describe("claveDePeriodo", () => {
  test("dos períodos distintos tienen claves distintas", () => {
    const claves = new Set([
      ...PERIODOS.map((opcion) => claveDePeriodo({ id: opcion.id })),
      claveDePeriodo({
        id: ID_PERSONALIZADO,
        desde: "2026-03-01",
        hasta: "2026-03-31",
      }),
    ]);
    expect(claves.size).toBe(PERIODOS.length + 1);
  });

  test("el mismo período da la misma clave: si no, se re-pediría en cada render", () => {
    expect(claveDePeriodo({ id: "mes" })).toBe(claveDePeriodo({ id: "mes" }));
  });

  test("mover un extremo del rango cambia la clave", () => {
    const base = { id: ID_PERSONALIZADO, desde: "2026-03-01", hasta: "2026-03-31" };
    expect(claveDePeriodo(base)).not.toBe(
      claveDePeriodo({ ...base, hasta: "2026-03-30" }),
    );
  });
});

describe("validarPeriodo", () => {
  test("los presets nunca son inválidos", () => {
    for (const opcion of PERIODOS) {
      expect(validarPeriodo({ id: opcion.id })).toBeNull();
    }
  });

  test("un rango a medio escribir no es un error todavía", () => {
    expect(
      validarPeriodo({ id: ID_PERSONALIZADO, desde: "2026-03-01", hasta: "" }),
    ).toBeNull();
    expect(
      validarPeriodo({ id: ID_PERSONALIZADO, desde: "", hasta: "2026-03-31" }),
    ).toBeNull();
  });

  test("el rango al revés avisa", () => {
    expect(
      validarPeriodo({
        id: ID_PERSONALIZADO,
        desde: "2026-05-10",
        hasta: "2026-05-01",
      }),
    ).toBe("La fecha «Desde» no puede ser posterior a «Hasta».");
  });

  test("un rango de un solo día es válido", () => {
    expect(
      validarPeriodo({
        id: ID_PERSONALIZADO,
        desde: "2026-03-01",
        hasta: "2026-03-01",
      }),
    ).toBeNull();
  });

  test(`${TOPE_RANGO_DIAS} días pasa y ${TOPE_RANGO_DIAS + 1} no`, () => {
    const desde = "2026-01-01";

    const justo = {
      id: ID_PERSONALIZADO,
      desde,
      hasta: sumarDias(desde, TOPE_RANGO_DIAS - 1),
    };
    expect(diasEntre(justo.desde, justo.hasta)).toBe(TOPE_RANGO_DIAS);
    expect(validarPeriodo(justo)).toBeNull();

    const unoDeMas = { ...justo, hasta: sumarDias(desde, TOPE_RANGO_DIAS) };
    expect(diasEntre(unoDeMas.desde, unoDeMas.hasta)).toBe(TOPE_RANGO_DIAS + 1);
    expect(validarPeriodo(unoDeMas)).toBe(
      "El período no puede abarcar más de 366 días y el que elegiste abarca 367.",
    );
  });
});

describe("periodoListo", () => {
  test("los presets siempre están listos", () => {
    for (const opcion of PERIODOS) {
      expect(periodoListo({ id: opcion.id })).toBe(true);
    }
  });

  test("el rango a mano solo cuando está completo y es válido", () => {
    const base = { id: ID_PERSONALIZADO };
    expect(periodoListo({ ...base, desde: "2026-03-01", hasta: "" })).toBe(false);
    expect(periodoListo({ ...base, desde: "", hasta: "2026-03-31" })).toBe(false);
    expect(periodoListo({ ...base, desde: "2026-05-10", hasta: "2026-05-01" })).toBe(
      false,
    );
    expect(periodoListo({ ...base, desde: "2026-03-01", hasta: "2026-03-31" })).toBe(
      true,
    );
  });
});

describe("etiquetaDeRespuesta y diaDeInstante", () => {
  test("formatea en hora de Argentina y no en UTC crudo", () => {
    // El backend devuelve el rango en UTC con `Z`: el `desde` que se mandó como
    // 2026-03-01T00:00-03:00 vuelve como 03:00Z. Pintado crudo diría "01/03"
    // igual acá, pero el `hasta` de las 23:59-03:00 vuelve como el 01/04 a las
    // 02:59Z: SIN la zona, la etiqueta diría que el período llega hasta abril.
    expect(
      etiquetaDeRespuesta({
        desde: "2026-03-01T03:00:00.000Z",
        hasta: "2026-04-01T02:59:59.000Z",
      }),
    ).toBe("01/03/2026 al 31/03/2026");
  });

  test("un período de un solo día se dice una sola vez", () => {
    expect(
      etiquetaDeRespuesta({
        desde: "2026-11-27T03:00:00.000Z",
        hasta: "2026-11-28T02:59:59.000Z",
      }),
    ).toBe("27/11/2026");
  });
  test("diaDeInstante da el día de Argentina", () => {
    expect(diaDeInstante("2026-11-28T01:00:00.000Z")).toBe("27/11/2026");
  });
});

describe("terminaHoy", () => {
  test("una ventana móvil termina hoy", () => {
    const ahora = new Date("2026-11-27T15:00:00.000Z");
    expect(terminaHoy({ hasta: ahora.toISOString() }, ahora)).toBe(true);
  });

  test("un mes pasado no", () => {
    expect(
      terminaHoy(
        { hasta: "2026-04-01T02:59:59.000Z" },
        new Date("2026-11-27T15:00:00.000Z"),
      ),
    ).toBe(false);
  });

  test("el último instante de hoy en Argentina sigue siendo hoy", () => {
    // 2026-11-28T02:59:59Z es el 27 a las 23:59:59 en Argentina.
    expect(
      terminaHoy(
        { hasta: "2026-11-28T02:59:59.000Z" },
        new Date("2026-11-27T15:00:00.000Z"),
      ),
    ).toBe(true);
  });
});

describe("diaCorto", () => {
  test("día y mes, sin pasar por Date", () => {
    expect(diaCorto("2026-11-22")).toBe("22/11");
    expect(diaCorto("2026-01-01")).toBe("01/01");
  });
});

describe("agruparSerie", () => {
  /** Una serie de `dias` días desde `desde`, con `unidades` por día. */
  function serie(desde, dias, unidades = 1) {
    return Array.from({ length: dias }, (_, i) => ({
      fecha: sumarDias(desde, i),
      ventas: unidades,
      unidades,
    }));
  }

  const suma = (filas, campo) =>
    filas.reduce((total, fila) => total + fila[campo], 0);

  test("una serie de un solo día es una sola barra", () => {
    const { granularidad, barras } = agruparSerie(serie("2026-11-27", 1, 5));
    expect(granularidad).toBe("dia");
    expect(barras).toEqual([
      { fecha: "2026-11-27", ventas: 5, unidades: 5, etiqueta: "27/11" },
    ]);
  });

  test("una serie vacía no explota", () => {
    expect(agruparSerie([])).toEqual({ granularidad: "dia", barras: [] });
    expect(agruparSerie()).toEqual({ granularidad: "dia", barras: [] });
  });

  test(`hasta ${TOPE_SERIE_DIARIA} días es una barra por día`, () => {
    const { granularidad, barras } = agruparSerie(
      serie("2026-01-01", TOPE_SERIE_DIARIA),
    );
    expect(granularidad).toBe("dia");
    expect(barras).toHaveLength(TOPE_SERIE_DIARIA);
  });

  test(`${TOPE_SERIE_DIARIA + 1} días pasa a semanas`, () => {
    const { granularidad, barras } = agruparSerie(
      serie("2026-01-01", TOPE_SERIE_DIARIA + 1),
    );
    expect(granularidad).toBe("semana");
    expect(barras.length).toBeLessThan(TOPE_SERIE_DIARIA + 1);
  });

  test(`${TOPE_SERIE_SEMANAL + 1} días pasa a meses`, () => {
    const { granularidad, barras } = agruparSerie(
      serie("2026-01-01", TOPE_SERIE_SEMANAL + 1),
    );
    expect(granularidad).toBe("mes");
    // 181 días desde el 1/1 terminan el 30/6: seis meses tocados. `fecha` es
    // el primer día del grupo (es el ancla con la que se ordena), así que el
    // último grupo arranca el 1/6.
    expect(barras.at(-1).fecha).toBe("2026-06-01");
    expect(barras).toHaveLength(6);
  });

  test("agrupa por semana de CALENDARIO, lunes a domingo", () => {
    // Del miércoles 18/3/2026 al martes 31/3/2026: la primera barra es el
    // pedazo de semana que empieza el miércoles, no siete días desde ahí.
    const { barras } = agruparSerie(serie("2026-03-18", 63));
    expect(barras[0].etiqueta).toBe("18/03–22/03");
    expect(barras[1].etiqueta).toBe("23/03–29/03");
  });

  test("la última semana incompleta se dice como lo que es", () => {
    const { barras } = agruparSerie(serie("2026-03-16", 64));
    // 64 días desde el lunes 16/3 terminan el 18/5, un lunes: la última barra
    // es un solo día y no promete una semana entera.
    expect(barras.at(-1).etiqueta).toBe("18/05");
  });

  test("las barras mensuales se nombran por su mes", () => {
    const { barras } = agruparSerie(serie("2026-01-01", 200));
    expect(barras[0].etiqueta).toMatch(/^ene/);
    expect(barras[1].etiqueta).toMatch(/^feb/);
  });

  test("salen ordenadas del grupo más viejo al más nuevo", () => {
    const { barras } = agruparSerie(serie("2026-01-01", 100));
    const fechas = barras.map((barra) => barra.fecha);
    expect([...fechas].sort()).toEqual(fechas);
  });

  describe("agrupar NO cambia los totales", () => {
    // La regla del contrato: la suma de lo que se muestra tiene que seguir
    // dando `rotacion.unidadesVendidas`. Si el gráfico contradijera la tarjeta
    // de arriba, el filtro de período no serviría para nada.
    test.each([
      ["diaria", 30],
      ["semanal", 100],
      ["mensual", 366],
    ])("granularidad %s", (_nombre, dias) => {
      const porDia = serie("2026-01-01", dias, 3);
      const { barras } = agruparSerie(porDia);

      expect(suma(barras, "unidades")).toBe(suma(porDia, "unidades"));
      expect(suma(barras, "ventas")).toBe(suma(porDia, "ventas"));
      expect(suma(barras, "unidades")).toBe(dias * 3);
    });

    test("con días en 0 en el medio, que es el caso real", () => {
      const porDia = serie("2026-01-01", 120, 0);
      porDia[7].unidades = 11;
      porDia[7].ventas = 4;
      porDia[100].unidades = 5;
      porDia[100].ventas = 2;

      const { barras } = agruparSerie(porDia);
      expect(suma(barras, "unidades")).toBe(16);
      expect(suma(barras, "ventas")).toBe(6);
    });
  });

  test("agrupa sobre los días tal cual vienen, sin pasarlos por la zona", () => {
    // `porDia` trae días calendario ("2026-03-18"), no instantes: pasarlos por
    // `new Date(fecha)` los interpretaría como UTC y en Argentina caerían un
    // día antes, corriendo la semana entera.
    const { barras } = agruparSerie(serie("2026-03-18", 63));
    expect(barras[0].fecha).toBe("2026-03-18");
    expect(barras[0].etiqueta).toBe("18/03–22/03");
  });
});
