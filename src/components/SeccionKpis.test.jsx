import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SeccionKpis, { CADENCIA_DE_REFRESCO_MS } from "./SeccionKpis";
import { diasEntre } from "../services/periodos";

vi.mock("../services/kpis", async (original) => ({
  ...(await original()),
  obtenerKpis: vi.fn(),
}));

// `AvisoDeError` relee los permisos al ver un 403; sin el mock saldría a
// buscar `/api/configuracion` de verdad.
vi.mock("../services/permisos", async (original) => ({
  ...(await original()),
  refrescarPermisos: vi.fn(),
}));

// Recharts mide el contenedor con ResizeObserver, que jsdom no tiene. El
// gráfico se prueba solo en `GraficoKpi.test.jsx`; acá se reemplaza por una
// marca para poder ver que se pidió con los datos correctos.
vi.mock("./GraficoKpi", () => ({
  default: ({ tipo, datos }) => (
    <div data-testid={`grafico-${tipo}`} data-filas={datos.length} />
  ),
}));

const { obtenerKpis } = await import("../services/kpis");

/**
 * Los KPIs del libro de `Backend/tests/kpis.test.js`, para que los dos lados
 * hablen de los mismos números.
 */
function kpis(overrides = {}) {
  return {
    generadoEn: "2026-11-22T13:05:00.000Z",
    periodo: {
      dias: 30,
      desde: "2026-10-24T03:00:00.000Z",
      hasta: "2026-11-22T13:05:00.000Z",
      zonaHoraria: "America/Argentina/Buenos_Aires",
    },
    stock: {
      productos: 4,
      unidades: 108,
      sinStock: 1,
      bajoUmbral: 1,
      normal: 2,
      productosSinVentas: 1,
      porUbicacion: [
        { id: "u2", nombre: "Depósito", unidades: 20, productos: 1 },
        { id: "u1", nombre: "Principal", unidades: 88, productos: 3 },
      ],
    },
    rotacion: {
      ventas: 5,
      unidadesVendidas: 15,
      productosSinVentas: 1,
      masVendidos: [
        {
          producto: { id: "p1", nombre: "Yerba 1kg", categoria: "Almacén", unidadMedida: "unidad", activo: true },
          ventas: 3,
          unidadesVendidas: 10,
          stockActual: 56,
          diasDeCobertura: 168,
        },
        {
          producto: { id: "p3", nombre: "Arroz 1kg", categoria: "Almacén", unidadMedida: "unidad", activo: true },
          ventas: 1,
          unidadesVendidas: 4,
          stockActual: 0,
          diasDeCobertura: 0,
        },
        {
          producto: { id: "p9", nombre: "Lavandina", categoria: "Limpieza", unidadMedida: "unidad", activo: false },
          ventas: 1,
          unidadesVendidas: 1,
          stockActual: 3,
          diasDeCobertura: 90,
        },
      ],
      porDia: [
        { fecha: "2026-11-21", ventas: 0, unidades: 0 },
        { fecha: "2026-11-22", ventas: 5, unidades: 15 },
      ],
      montos: null,
    },
    comprasPorProveedor: {
      compras: 4,
      unidades: 38,
      proveedoresConCompras: 2,
      proveedores: [
        { proveedor: { id: "v1", nombre: "Distribuidora X", activo: true }, compras: 2, unidades: 30, ultimaCompra: "2026-11-22T12:00:00.000Z" },
        { proveedor: { id: "v2", nombre: "Distribuidora Y", activo: false }, compras: 1, unidades: 5, ultimaCompra: "2026-11-20T12:00:00.000Z" },
      ],
      otros: null,
      sinProveedor: { compras: 1, unidades: 3 },
      montos: null,
    },
    ...overrides,
  };
}

function vacios() {
  return kpis({
    stock: { productos: 0, unidades: 0, sinStock: 0, bajoUmbral: 0, normal: 0, productosSinVentas: 0, porUbicacion: [] },
    rotacion: { ventas: 0, unidadesVendidas: 0, productosSinVentas: 0, masVendidos: [], porDia: [], montos: null },
    comprasPorProveedor: { compras: 0, unidades: 0, proveedoresConCompras: 0, proveedores: [], otros: null, sinProveedor: null, montos: null },
  });
}

function fallo(status, mensaje) {
  return Object.assign(new Error(mensaje), { status });
}

function renderizar() {
  return render(
    <MemoryRouter>
      <SeccionKpis />
    </MemoryRouter>,
  );
}

const seccion = () => screen.getByTestId("kpis");
const valor = (testId) => screen.getByTestId(`${testId}-valor`);

/**
 * El reloj queda clavado en el mismo instante que `generadoEn` del fixture.
 *
 * Hace falta desde HU-23: la pantalla compara el `hasta` del período contra
 * HOY para decidir si `diasDeCobertura` es una proyección o no, y los presets
 * de calendario se resuelven contra el día de hoy. Sin clavar el reloj, los
 * dos dependerían de cuándo se corre la suite.
 *
 * Es el domingo 22/11/2026 a propósito: el domingo es el borde donde
 * `getUTCDay()` da 0 y la semana de calendario se calcula mal si no se lo trata
 * aparte, así que el camino más frágil es el que corre en todos los tests.
 *
 * Solo se falsea `Date`: `setTimeout` y `setInterval` siguen siendo de verdad,
 * porque `userEvent` los necesita. El bloque de refresco automático sí los
 * falsea, y vuelve a clavar la misma hora.
 */
const AHORA = new Date("2026-11-22T13:05:00.000Z");

/**
 * La respuesta de un rango, con los extremos como los devuelve el backend: en
 * UTC con `Z`, el mismo instante que el `-03:00` que se mandó.
 *
 * Tienen que corresponderse con el rango que el test pide, porque la pantalla
 * descarta una respuesta cuyo `periodo` no sea el que pidió (ver el test «una
 * respuesta de otro rango se descarta»).
 */
function kpisDeRango({ desde, hasta, dias }, overrides = {}) {
  return kpis({
    periodo: {
      dias,
      desde,
      hasta,
      zonaHoraria: "America/Argentina/Buenos_Aires",
    },
    ...overrides,
  });
}

/** Marzo de 2026, un mes que ya pasó: 31 días que NO terminan hoy. */
const MARZO = {
  pedido: {
    desde: "2026-03-01T00:00:00.000-03:00",
    hasta: "2026-03-31T23:59:59.000-03:00",
  },
  respuesta: {
    desde: "2026-03-01T03:00:00.000Z",
    hasta: "2026-04-01T02:59:59.000Z",
    dias: 31,
  },
};

/** El mes en curso, que es el que resuelve el preset «Este mes». */
const ESTE_MES = {
  pedido: {
    desde: "2026-11-01T00:00:00.000-03:00",
    hasta: "2026-11-30T23:59:59.000-03:00",
  },
  respuesta: {
    desde: "2026-11-01T03:00:00.000Z",
    hasta: "2026-12-01T02:59:59.000Z",
    dias: 30,
  },
};

/**
 * Un solo producto en «los más vendidos».
 *
 * Con los tres del fixture base, un `getByTestId` de la cobertura encuentra
 * varios y un bug en una fila se esconde detrás de las otras dos.
 */
function conUnSoloProducto(masVendido) {
  const base = kpis();
  return {
    rotacion: {
      ...base.rotacion,
      masVendidos: [{ ...base.rotacion.masVendidos[0], ...masVendido }],
    },
  };
}

/**
 * Hace que el mock conteste el período que se le pidió, como el backend.
 *
 * Hace falta para cualquier test que deje un rango a mano en un estado válido:
 * la pantalla DESCARTA una respuesta cuyo rango no sea el que pidió, así que un
 * fixture con el período de otro rango se queda cargando para siempre —que es
 * justo lo que tiene que pasar, y lo que prueba el test «una respuesta de otro
 * rango se descarta»—.
 */
function responderElRangoPedido(overrides = {}) {
  obtenerKpis.mockImplementation(({ desde, hasta, dias } = {}) =>
    Promise.resolve(
      desde
        ? kpisDeRango(
            {
              desde: new Date(desde).toISOString(),
              hasta: new Date(hasta).toISOString(),
              dias: diasEntre(desde.slice(0, 10), hasta.slice(0, 10)),
            },
            overrides,
          )
        : kpis({
            periodo: { ...kpis().periodo, dias: dias ?? 30 },
            ...overrides,
          }),
    ),
  );
}

/** Abre el rango a mano y escribe los dos extremos. */
async function elegirRango(usuario, desde, hasta) {
  await usuario.click(screen.getByTestId("periodo-personalizado"));
  await usuario.clear(screen.getByTestId("periodo-desde"));
  await usuario.type(screen.getByTestId("periodo-desde"), desde);
  await usuario.clear(screen.getByTestId("periodo-hasta"));
  await usuario.type(screen.getByTestId("periodo-hasta"), hasta);
}

const ultimosParametros = () => obtenerKpis.mock.calls.at(-1)[0];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  vi.clearAllMocks();
  obtenerKpis.mockResolvedValue(kpis());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Carga", () => {
  test("mientras carga lo dice, y al terminar baja aria-busy", async () => {
    renderizar();

    expect(screen.getByTestId("kpis-cargando")).toBeInTheDocument();
    expect(seccion()).toHaveAttribute("aria-busy", "true");

    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));
    expect(screen.queryByTestId("kpis-cargando")).not.toBeInTheDocument();
  });

  test("pide la ventana por defecto al entrar", async () => {
    renderizar();

    await waitFor(() => expect(obtenerKpis).toHaveBeenCalledWith({ dias: 30 }));
  });
});

describe("Estado del stock", () => {
  test("muestra los números tal cual vienen del backend", async () => {
    renderizar();

    await waitFor(() => expect(valor("kpi-productos")).toHaveTextContent("4"));
    expect(valor("kpi-unidades-stock")).toHaveTextContent("108");
    expect(valor("kpi-bajo-umbral")).toHaveTextContent("1");
    expect(valor("kpi-sin-stock")).toHaveTextContent("1");
  });

  test("la barra de estado se puede leer sin verla", async () => {
    renderizar();

    expect(
      await screen.findByRole("img", {
        name: "Bien: 2, En o bajo el mínimo: 1, Sin stock: 1",
      }),
    ).toBeInTheDocument();
  });

  test("el gráfico por ubicación tiene su tabla para lectores de pantalla", async () => {
    renderizar();

    const tabla = await screen.findByRole("table", { name: "Unidades por ubicación" });
    expect(within(tabla).getByText("Principal")).toBeInTheDocument();
    expect(within(tabla).getByText("88")).toBeInTheDocument();
    expect(await screen.findByTestId("grafico-stockPorUbicacion")).toHaveAttribute(
      "data-filas",
      "2",
    );
  });

  test("con números grandes usa separador de miles", async () => {
    obtenerKpis.mockResolvedValue(
      kpis({ stock: { ...kpis().stock, unidades: 12345 } }),
    );

    renderizar();

    await waitFor(() =>
      expect(valor("kpi-unidades-stock")).toHaveTextContent("12.345"),
    );
  });
});

describe("Rotación", () => {
  test("ventas, unidades y productos sin ventas", async () => {
    renderizar();

    await waitFor(() => expect(valor("kpi-ventas")).toHaveTextContent("5"));
    expect(valor("kpi-unidades-vendidas")).toHaveTextContent("15");
    expect(valor("kpi-sin-ventas")).toHaveTextContent("1");
  });

  test("los más vendidos en el orden del backend, con su cobertura", async () => {
    renderizar();

    const filas = await screen.findAllByTestId("kpis-mas-vendido");
    expect(filas.map((fila) => fila.dataset.kpiProductoId)).toEqual(["p1", "p3", "p9"]);
    expect(filas[0]).toHaveTextContent("Yerba 1kg");
    expect(filas[0]).toHaveTextContent("10 unidad en 3 ventas");
    expect(filas[0]).toHaveTextContent("alcanza para 168 días");
    // Sin stock no se dice "alcanza para 0 días".
    expect(filas[1]).toHaveTextContent("sin stock");
    expect(filas[2]).toHaveTextContent("(dado de baja)");
  });

  test("sin ventas en la ventana no muestra un gráfico vacío", async () => {
    obtenerKpis.mockResolvedValue(vacios());

    renderizar();

    expect(await screen.findByTestId("kpis-rotacion-vacio")).toHaveTextContent(
      "No hubo ventas en los últimos 30 días.",
    );
    expect(screen.queryByTestId("grafico-ventasPorDia")).not.toBeInTheDocument();
  });

  test("la serie diaria va al gráfico y a la tabla accesible", async () => {
    renderizar();

    const tabla = await screen.findByRole("table", {
      name: "Unidades vendidas por día",
    });
    expect(within(tabla).getByText("22/11")).toBeInTheDocument();
    expect(await screen.findByTestId("grafico-ventasPorDia")).toHaveAttribute(
      "data-filas",
      "2",
    );
  });
});

describe("Compras por proveedor", () => {
  test("totales, y una barra por proveedor más las sin proveedor", async () => {
    renderizar();

    await waitFor(() => expect(valor("kpi-compras")).toHaveTextContent("4"));
    expect(valor("kpi-unidades-compradas")).toHaveTextContent("38");
    expect(valor("kpi-proveedores")).toHaveTextContent("2");

    const tabla = await screen.findByRole("table", {
      name: "Unidades compradas por proveedor",
    });
    const nombres = within(tabla)
      .getAllByRole("row")
      .slice(1)
      .map((fila) => within(fila).getAllByRole("cell")[0].textContent);
    // Sin "Sin proveedor" las barras no sumarían las 38 de la tarjeta.
    expect(nombres).toEqual([
      "Distribuidora X",
      "Distribuidora Y (de baja)",
      "Sin proveedor",
    ]);
  });

  test("los que no entran en la lista van sumados en «Otros»", async () => {
    const base = kpis();
    obtenerKpis.mockResolvedValue(
      kpis({
        comprasPorProveedor: {
          ...base.comprasPorProveedor,
          otros: { proveedores: 3, compras: 3, unidades: 9 },
          sinProveedor: null,
        },
      }),
    );

    renderizar();

    const tabla = await screen.findByRole("table", {
      name: "Unidades compradas por proveedor",
    });
    expect(within(tabla).getByText("Otros 3")).toBeInTheDocument();
  });

  test("sin compras lo dice en vez de dibujar nada", async () => {
    obtenerKpis.mockResolvedValue(vacios());

    renderizar();

    expect(await screen.findByTestId("kpis-compras-vacio")).toBeInTheDocument();
    expect(screen.queryByTestId("grafico-comprasPorProveedor")).not.toBeInTheDocument();
  });
});

describe("Sin datos", () => {
  test("un comercio sin productos ve el estado vacío, no ceros sueltos con gráficos", async () => {
    obtenerKpis.mockResolvedValue(vacios());

    renderizar();

    expect(await screen.findByTestId("kpis-stock-vacio")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  test("avisa que los indicadores son en unidades, sin pesos inventados", async () => {
    renderizar();

    expect(await screen.findByTestId("kpis-sin-montos")).toHaveTextContent(
      "todavía no registra precios",
    );
    expect(seccion()).not.toHaveTextContent("$");
  });
});

describe("Selector de período", () => {
  test("cambiar a 7 días vuelve a pedir con esa ventana", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    obtenerKpis.mockResolvedValue(
      kpis({ periodo: { ...kpis().periodo, dias: 7 } }),
    );
    await usuario.click(screen.getByRole("button", { name: "7 días" }));

    expect(screen.getByRole("button", { name: "7 días" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(obtenerKpis).toHaveBeenLastCalledWith({ dias: 7 });
    expect(
      await screen.findByText("Rotación · últimos 7 días"),
    ).toBeInTheDocument();
  });

  test("una respuesta vieja no pisa a la nueva", async () => {
    // La de 30 días tarda más que la de 7: si llegara última, quedarían en
    // pantalla los números de 30 con el selector en 7.
    let resolverLenta;
    obtenerKpis.mockReturnValueOnce(
      new Promise((resolver) => {
        resolverLenta = resolver;
      }),
    );
    obtenerKpis.mockResolvedValueOnce(
      kpis({ periodo: { ...kpis().periodo, dias: 7 } }),
    );

    const usuario = userEvent.setup();
    renderizar();
    await usuario.click(screen.getByRole("button", { name: "7 días" }));
    await screen.findByText("Rotación · últimos 7 días");

    await act(async () => {
      resolverLenta(kpis());
    });

    expect(screen.getByText("Rotación · últimos 7 días")).toBeInTheDocument();
    expect(screen.queryByText("Rotación · últimos 30 días")).not.toBeInTheDocument();
  });
});

describe("Presets de período (HU-23)", () => {
  test.each([
    ["Hoy", "periodo-hoy", { dias: 1 }],
    ["7 días", "periodo-7", { dias: 7 }],
    ["90 días", "periodo-90", { dias: 90 }],
  ])("«%s» pide la ventana móvil %o", async (_nombre, testId, esperado) => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    await usuario.click(screen.getByTestId(testId));

    expect(ultimosParametros()).toEqual(esperado);
    expect(screen.getByTestId(testId)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("periodo-30")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("«Esta semana» pide el rango de la semana de calendario, lunes a domingo", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    await usuario.click(screen.getByTestId("periodo-semana"));

    // Hoy es domingo 22/11/2026: la semana es del lunes 16 al domingo 22, no
    // los siete días anteriores ni la semana que empieza hoy.
    expect(ultimosParametros()).toEqual({
      desde: "2026-11-16T00:00:00.000-03:00",
      hasta: "2026-11-22T23:59:59.000-03:00",
    });
    // Por la vía del rango no viaja `dias`: mandar los dos es un 400.
    expect(ultimosParametros().dias).toBeUndefined();
  });

  test("«Este mes» pide del 1 al último día del mes", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    await usuario.click(screen.getByTestId("periodo-mes"));

    expect(ultimosParametros()).toEqual({
      desde: "2026-11-01T00:00:00.000-03:00",
      hasta: "2026-11-30T23:59:59.000-03:00",
    });
  });

  test("el título sale de las fechas de la respuesta, no del nombre del preset", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    obtenerKpis.mockResolvedValue(kpisDeRango(ESTE_MES.respuesta));
    await usuario.click(screen.getByTestId("periodo-mes"));

    // Dice las fechas, no "Este mes": es `periodo` de la RESPUESTA lo que se
    // pinta, formateado en hora de Argentina y no en el UTC crudo que viene.
    expect(
      await screen.findByText("Rotación · 01/11/2026 al 30/11/2026"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpis-periodo-vigente")).toHaveTextContent(
      "el período elegido",
    );
  });

  test("una respuesta de OTRO rango se descarta en vez de pintarse", async () => {
    // El contador de pedidos ya cubre el orden de llegada; esto es el cinturón
    // sobre el cuerpo: por la vía del rango el backend devuelve los extremos
    // que se le mandaron, así que una respuesta de marzo para un pedido de
    // noviembre se reconoce y no se muestra.
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    obtenerKpis.mockResolvedValue(kpisDeRango(MARZO.respuesta));
    await usuario.click(screen.getByTestId("periodo-mes"));

    await waitFor(() => expect(ultimosParametros()).toEqual(ESTE_MES.pedido));

    // No se pinta marzo…
    expect(
      screen.queryByText("Rotación · 01/03/2026 al 31/03/2026"),
    ).not.toBeInTheDocument();
    // …y se dice por qué, en vez de quedarse "cargando" para siempre: una
    // respuesta vieja ya la filtró el contador de pedidos, así que llegar acá
    // con otro rango significa que el backend contestó otra cosa.
    expect(await screen.findByTestId("kpis-error")).toHaveTextContent(
      "no son del período que pediste",
    );
    expect(seccion()).toHaveAttribute("aria-busy", "false");
  });

  test("tocar de nuevo el preset ya elegido no vuelve a pedir", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));
    const pedidos = obtenerKpis.mock.calls.length;

    await usuario.click(screen.getByTestId("periodo-30"));
    await usuario.click(screen.getByTestId("periodo-30"));

    // `periodo` es un objeto: sin la guarda, cada clic crea una referencia
    // nueva y dispara otro pedido del MISMO período.
    expect(obtenerKpis.mock.calls.length).toBe(pedidos);
    expect(screen.getByTestId("periodo-30")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("Rango personalizado (HU-23)", () => {
  test("al abrirlo propone hoy y pide ese día", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    await usuario.click(screen.getByTestId("periodo-personalizado"));

    expect(screen.getByTestId("periodo-desde")).toHaveValue("2026-11-22");
    expect(screen.getByTestId("periodo-hasta")).toHaveValue("2026-11-22");
    await waitFor(() =>
      expect(ultimosParametros()).toEqual({
        desde: "2026-11-22T00:00:00.000-03:00",
        hasta: "2026-11-22T23:59:59.000-03:00",
      }),
    );
  });

  test("los dos extremos elegidos llegan como instantes de Argentina", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    await elegirRango(usuario, "2026-03-01", "2026-03-31");

    await waitFor(() => expect(ultimosParametros()).toEqual(MARZO.pedido));
  });

  test("antes de abrirlo los campos no existen", async () => {
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    expect(screen.queryByTestId("periodo-desde")).not.toBeInTheDocument();
    expect(screen.queryByTestId("periodo-hasta")).not.toBeInTheDocument();
  });

  test("con un extremo vacío no se consulta, y tampoco es un error", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    const pedidos = obtenerKpis.mock.calls.length;
    await usuario.click(screen.getByTestId("periodo-personalizado"));
    await usuario.clear(screen.getByTestId("periodo-hasta"));

    // Mandar `desde` solo es un 400 seguro, así que no se gasta el viaje. Y un
    // rango a medio escribir no es un error: no hay aviso ninguno.
    expect(obtenerKpis.mock.calls.length).toBe(pedidos + 1);
    expect(
      screen.queryByTestId("kpis-periodo-rango-invalido"),
    ).not.toBeInTheDocument();
    expect(seccion()).toHaveAttribute("aria-busy", "false");
  });

  test("un rango al revés avisa al lado de las fechas y no consulta", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    // Primero un rango válido, y de ahí se rompe con UN cambio: así se cuenta
    // lo que pasa por ese cambio y no los estados intermedios de ir tipeando.
    responderElRangoPedido();
    await elegirRango(usuario, "2026-05-01", "2026-05-10");
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));
    const pedidos = obtenerKpis.mock.calls.length;

    await usuario.clear(screen.getByTestId("periodo-desde"));
    await usuario.type(screen.getByTestId("periodo-desde"), "2026-05-20");

    const aviso = await screen.findByTestId("kpis-periodo-rango-invalido");
    expect(aviso).toHaveTextContent(
      "La fecha «Desde» no puede ser posterior a «Hasta».",
    );
    expect(aviso).toHaveAttribute("role", "alert");
    // Ni un pedido con el rango roto, ni la sección colgada en "ocupada".
    expect(obtenerKpis.mock.calls.length).toBe(pedidos);
    expect(seccion()).toHaveAttribute("aria-busy", "false");
  });

  test("un rango de más de 366 días se para en el cliente, sin gastar el viaje", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    responderElRangoPedido();
    await elegirRango(usuario, "2026-01-01", "2026-01-02");
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));
    const pedidos = obtenerKpis.mock.calls.length;

    // Del 1/1/2026 al 2/1/2027 son 367 días: uno más que el tope.
    await usuario.clear(screen.getByTestId("periodo-hasta"));
    await usuario.type(screen.getByTestId("periodo-hasta"), "2027-01-02");

    expect(
      await screen.findByTestId("kpis-periodo-rango-invalido"),
    ).toHaveTextContent(
      "El período no puede abarcar más de 366 días y el que elegiste abarca 367.",
    );
    expect(obtenerKpis.mock.calls.length).toBe(pedidos);
    // El backend nunca se enteró: no hay 400 que mostrar, y son dos avisos
    // distintos a propósito.
    expect(screen.queryByTestId("kpis-periodo-error")).not.toBeInTheDocument();
  });

  test("exactamente 366 días sí se consulta", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    await elegirRango(usuario, "2026-01-01", "2027-01-01");

    expect(
      screen.queryByTestId("kpis-periodo-rango-invalido"),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(ultimosParametros()).toEqual({
        desde: "2026-01-01T00:00:00.000-03:00",
        hasta: "2027-01-01T23:59:59.000-03:00",
      }),
    );
  });

  test("arreglar el rango vuelve a consultar y saca el aviso", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    await elegirRango(usuario, "2026-05-10", "2026-05-01");
    await screen.findByTestId("kpis-periodo-rango-invalido");

    await usuario.clear(screen.getByTestId("periodo-hasta"));
    await usuario.type(screen.getByTestId("periodo-hasta"), "2026-05-20");

    await waitFor(() =>
      expect(
        screen.queryByTestId("kpis-periodo-rango-invalido"),
      ).not.toBeInTheDocument(),
    );
    expect(ultimosParametros()).toEqual({
      desde: "2026-05-10T00:00:00.000-03:00",
      hasta: "2026-05-20T23:59:59.000-03:00",
    });
  });
});

describe("Los dos bloques que no siguen al período (HU-23)", () => {
  test("el bloque de stock está rotulado como «siempre el de hoy»", async () => {
    renderizar();

    const badge = await screen.findByTestId("kpis-stock-alcance");
    expect(badge).toHaveTextContent("Siempre el stock de hoy");
    // Y dentro del bloque de stock, no suelto en la página.
    expect(screen.getByTestId("kpis-stock")).toContainElement(badge);
  });

  test("con un período pasado, el rótulo del stock sigue estando", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    obtenerKpis.mockResolvedValue(kpisDeRango(MARZO.respuesta));
    await elegirRango(usuario, "2026-03-01", "2026-03-31");
    await screen.findByText("Rotación · 01/03/2026 al 31/03/2026");

    expect(screen.getByTestId("kpis-stock-alcance")).toBeInTheDocument();
    // Los otros dos bloques nombran el período…
    expect(screen.getByTestId("kpis-rotacion")).toHaveTextContent(
      "01/03/2026 al 31/03/2026",
    );
    expect(screen.getByTestId("kpis-compras")).toHaveTextContent(
      "01/03/2026 al 31/03/2026",
    );
    // …y el de stock NO, porque no es de ese período: es el de hoy.
    expect(screen.getByTestId("kpis-stock")).not.toHaveTextContent("01/03/2026");
  });

  test("la cobertura de un período que termina hoy se dice derecho", async () => {
    obtenerKpis.mockResolvedValue(
      kpis(conUnSoloProducto({ stockActual: 56, diasDeCobertura: 168 })),
    );

    renderizar();

    expect(await screen.findByTestId("kpis-cobertura")).toHaveTextContent(
      "alcanza para 168 días",
    );
    expect(
      screen.queryByTestId("kpis-cobertura-proyectada"),
    ).not.toBeInTheDocument();
  });

  test("con un período pasado la cobertura se rotula como proyección", async () => {
    const usuario = userEvent.setup();
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    obtenerKpis.mockResolvedValue(
      kpisDeRango(
        MARZO.respuesta,
        conUnSoloProducto({ stockActual: 56, diasDeCobertura: 168 }),
      ),
    );
    await elegirRango(usuario, "2026-03-01", "2026-03-31");

    // Lo que dice NO es "en marzo me alcanzaba para 168 días": es el stock de
    // HOY al ritmo de marzo. Sin el rótulo se lee como un dato del período.
    const proyectada = await screen.findByTestId("kpis-cobertura-proyectada");
    expect(proyectada).toHaveTextContent(
      "al ritmo del período, el stock de hoy alcanza para 168 días",
    );
    expect(screen.queryByTestId("kpis-cobertura")).not.toBeInTheDocument();
  });

  test("`diasDeCobertura` en null dice que no se vendió nada, y NO «0»", async () => {
    obtenerKpis.mockResolvedValue(
      kpis(conUnSoloProducto({ stockActual: 56, diasDeCobertura: null })),
    );

    renderizar();

    const fila = await screen.findByTestId("kpis-mas-vendido");
    expect(within(fila).getByTestId("kpis-cobertura-sin-ritmo")).toHaveTextContent(
      "sin ventas en el período",
    );
    // null NO es cero: ni "0 días", ni "menos de un día", ni "sin stock".
    expect(fila).not.toHaveTextContent("alcanza para");
    expect(fila).not.toHaveTextContent("sin stock");
    expect(within(fila).queryByTestId("kpis-cobertura")).not.toBeInTheDocument();
  });

  test("cobertura 0 es distinto de null: ahí sí hubo ventas", async () => {
    obtenerKpis.mockResolvedValue(
      kpis(conUnSoloProducto({ stockActual: 2, diasDeCobertura: 0 })),
    );

    renderizar();

    const fila = await screen.findByTestId("kpis-mas-vendido");
    expect(within(fila).getByTestId("kpis-cobertura")).toHaveTextContent(
      "alcanza para menos de un día",
    );
    expect(
      within(fila).queryByTestId("kpis-cobertura-sin-ritmo"),
    ).not.toBeInTheDocument();
  });
});

describe("El recorte silencioso de `dias` (HU-23)", () => {
  test("si el backend recortó, lo avisa con los días que de verdad está viendo", async () => {
    // El selector no ofrece más de 90, así que hoy es inalcanzable; se mira
    // igual contra `periodo.dias` de la respuesta.
    obtenerKpis.mockResolvedValue(kpis({ periodo: { ...kpis().periodo, dias: 90 } }));
    const usuario = userEvent.setup();

    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));
    await usuario.click(screen.getByTestId("periodo-7"));

    const aviso = await screen.findByTestId("kpis-periodo-recortado");
    expect(aviso).toHaveTextContent("Pediste 7 días y el máximo es 90");
    // Informativo y NO una falla: el backend respondió 200.
    expect(aviso).not.toHaveAttribute("role", "alert");
    expect(screen.queryByTestId("kpis-periodo-error")).not.toBeInTheDocument();
  });

  test("sin recorte no aparece el aviso", async () => {
    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    expect(screen.queryByTestId("kpis-periodo-recortado")).not.toBeInTheDocument();
  });

  test("por la vía del rango no se mira el recorte: ahí el backend rechaza", async () => {
    // `periodo.dias` de un rango es el conteo del rango y no tiene con qué
    // compararse. Mirarlo contra algo daría un aviso de recorte inventado.
    const usuario = userEvent.setup();

    renderizar();
    await waitFor(() => expect(seccion()).toHaveAttribute("aria-busy", "false"));

    obtenerKpis.mockResolvedValue(kpisDeRango(ESTE_MES.respuesta));
    await usuario.click(screen.getByTestId("periodo-mes"));

    await screen.findByText("Rotación · 01/11/2026 al 30/11/2026");
    expect(screen.queryByTestId("kpis-periodo-recortado")).not.toBeInTheDocument();
  });
});

describe("Un 400 del período (HU-23)", () => {
  const MENSAJE =
    "El período no puede abarcar más de 366 días y el pedido abarca 400";

  test("muestra el mensaje del backend tal cual, sin «Reintentar»", async () => {
    obtenerKpis.mockRejectedValue(fallo(400, MENSAJE));

    renderizar();

    const aviso = await screen.findByTestId("kpis-periodo-error");
    // El texto es el del backend: es el que sabe qué regla se rompió, y está
    // redactado para el usuario final.
    expect(aviso).toHaveTextContent(MENSAJE);
    expect(aviso).toHaveAttribute("role", "alert");
    // Reintentar lo mismo da lo mismo: lo accionable es la fecha.
    expect(
      screen.queryByRole("button", { name: /Reintentar/i }),
    ).not.toBeInTheDocument();
    // Y no se duplica el aviso por la vía general.
    expect(screen.queryByTestId("kpis-error")).not.toBeInTheDocument();
  });

  test("no se confunde con un problema de permisos", async () => {
    obtenerKpis.mockRejectedValue(fallo(400, MENSAJE));

    renderizar();

    await screen.findByTestId("kpis-periodo-error");
    expect(screen.queryByTestId("aviso-permiso")).not.toBeInTheDocument();
    expect(screen.queryByTestId("aviso-sesion")).not.toBeInTheDocument();
    // El selector sigue ahí: el rol puede ver los KPIs, lo que está mal es el
    // período.
    expect(screen.getByTestId("kpis-selector")).toBeInTheDocument();
  });

  test("deja de insistir: un período inválido no se cura solo", async () => {
    // Antes de HU-23 esto no se notaba porque el selector solo ofrecía 7/30/90
    // y un 400 era inalcanzable. Con un rango a mano sí llega, y `clasificar`
    // manda todo lo que no es 401/403 a GENERAL, que es reintentable: sin la
    // excepción, el rango de 400 días se re-pedía cada minuto para siempre.
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    obtenerKpis.mockRejectedValue(fallo(400, MENSAJE));

    renderizar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(obtenerKpis).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CADENCIA_DE_REFRESCO_MS * 3);
    });

    expect(obtenerKpis).toHaveBeenCalledTimes(1);
  });

  test("un fallo de red SÍ se sigue reintentando: ese sí se cura solo", async () => {
    // El contraste del test de arriba: la excepción es para el 400, no para
    // todo. Si se cortara el refresco ante cualquier error, una conexión que
    // vuelve dejaría el panel muerto hasta recargar la página.
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    obtenerKpis.mockRejectedValue(new Error("Failed to fetch"));

    renderizar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(obtenerKpis).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CADENCIA_DE_REFRESCO_MS);
    });

    expect(obtenerKpis).toHaveBeenCalledTimes(2);
  });

  test("un 403 con el período mal sigue siendo un 403", async () => {
    // El backend evalúa el permiso ANTES del período: un empleado con fechas
    // mal recibe 403, no 400. No se puede leer uno como el otro.
    obtenerKpis.mockRejectedValue(
      fallo(403, "El rol no tiene permiso para esta accion"),
    );

    renderizar();

    expect(await screen.findByTestId("aviso-permiso")).toBeInTheDocument();
    expect(screen.queryByTestId("kpis-periodo-error")).not.toBeInTheDocument();
  });
});

describe("Serie larga (HU-23)", () => {
  /** `dias` días de serie terminando hoy, con `unidades` por día. */
  function serieDe(dias, unidades = 2) {
    return Array.from({ length: dias }, (_, i) => {
      const fecha = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000)
        .toISOString()
        .slice(0, 10);
      return { fecha, ventas: 1, unidades };
    });
  }

  test("una serie corta sigue siendo una barra por día", async () => {
    const base = kpis();
    const porDia = serieDe(30);
    obtenerKpis.mockResolvedValue(
      kpis({
        rotacion: { ...base.rotacion, porDia, unidadesVendidas: 60 },
      }),
    );

    renderizar();

    const figura = await screen.findByTestId("kpis-figura-ventas");
    expect(figura).toHaveAttribute("data-granularidad", "dia");
    expect(
      screen.getByRole("table", { name: "Unidades vendidas por día" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("grafico-ventasPorDia")).toHaveAttribute(
      "data-filas",
      "30",
    );
  });

  test("366 días se agrupan por mes, y la suma no cambia", async () => {
    const base = kpis();
    const porDia = serieDe(366);
    obtenerKpis.mockResolvedValue(
      kpis({
        rotacion: { ...base.rotacion, porDia, unidadesVendidas: 732 },
      }),
    );

    renderizar();

    const figura = await screen.findByTestId("kpis-figura-ventas");
    expect(figura).toHaveAttribute("data-granularidad", "mes");
    // 366 barras de un píxel no se leen; 13 meses sí.
    expect(screen.getByTestId("grafico-ventasPorDia")).toHaveAttribute(
      "data-filas",
      "13",
    );

    // La regla que no se negocia: lo que muestra el gráfico tiene que sumar lo
    // que dice la tarjeta de arriba.
    const tabla = screen.getByRole("table", { name: "Unidades vendidas por mes" });
    const unidades = within(tabla)
      .getAllByRole("row")
      .slice(1)
      .map((fila) => Number(within(fila).getAllByRole("cell")[2].textContent));
    expect(unidades.reduce((a, b) => a + b, 0)).toBe(732);
    expect(valor("kpi-unidades-vendidas")).toHaveTextContent("732");
  });

  test("100 días se agrupan por semana de calendario", async () => {
    const base = kpis();
    obtenerKpis.mockResolvedValue(
      kpis({
        rotacion: { ...base.rotacion, porDia: serieDe(100), unidadesVendidas: 200 },
      }),
    );

    renderizar();

    expect(await screen.findByTestId("kpis-figura-ventas")).toHaveAttribute(
      "data-granularidad",
      "semana",
    );
    const tabla = screen.getByRole("table", {
      name: "Unidades vendidas por semana",
    });
    // La primera barra es el pedazo de semana con el que arranca el período:
    // el 1/1/2026 es jueves, así que va del jueves al domingo.
    expect(within(tabla).getByText("01/01–04/01")).toBeInTheDocument();
  });
});

describe("Números para lectores de pantalla y para el E2E (HU-23)", () => {
  test("cada número va con su etiqueta en un aria-label", async () => {
    renderizar();

    await waitFor(() =>
      expect(valor("kpi-unidades-stock")).toHaveAttribute(
        "aria-label",
        "Unidades en stock: 108",
      ),
    );
    expect(valor("kpi-ventas")).toHaveAttribute("aria-label", "Ventas: 5");
  });

  test("el textContent del número sigue siendo solo el número", async () => {
    // El page object de HU-22 lee el texto de `<kpi>-valor` y lo compara contra
    // el número formateado: agregarle la etiqueta adentro lo rompería.
    renderizar();

    await waitFor(() =>
      expect(valor("kpi-unidades-stock").textContent).toBe("108"),
    );
  });
});

describe("Errores", () => {
  test("un fallo en la primera carga muestra el aviso y deja reintentar", async () => {
    obtenerKpis.mockRejectedValueOnce(fallo(500, "Error interno del servidor"));
    const usuario = userEvent.setup();

    renderizar();

    const aviso = await screen.findByTestId("kpis-error");
    expect(screen.queryByTestId("kpis-cargando")).not.toBeInTheDocument();

    await usuario.click(within(aviso).getByRole("button", { name: /Reintentar/i }));

    await waitFor(() => expect(valor("kpi-productos")).toHaveTextContent("4"));
    expect(screen.queryByTestId("kpis-error")).not.toBeInTheDocument();
  });

  test("una respuesta sin la forma esperada no rompe Inicio", async () => {
    obtenerKpis.mockResolvedValue(null);

    renderizar();

    expect(await screen.findByTestId("kpis-error")).toHaveTextContent(
      "No se pudieron leer los indicadores",
    );
  });

  test("un 403 muestra el aviso sin datos y sin selector", async () => {
    obtenerKpis.mockRejectedValue(
      fallo(403, "El rol no tiene permiso para esta accion"),
    );

    renderizar();

    await screen.findByTestId("kpis-error");
    expect(screen.queryByRole("group", { name: /Período/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("kpi-productos")).not.toBeInTheDocument();
  });
});

describe("Refresco automático", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete document.visibilityState;
  });

  async function avanzar(ms) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  test("se refresca solo pasada la cadencia, sin verse como una carga", async () => {
    renderizar();
    await avanzar(0);
    expect(obtenerKpis).toHaveBeenCalledTimes(1);

    await avanzar(CADENCIA_DE_REFRESCO_MS);

    expect(obtenerKpis).toHaveBeenCalledTimes(2);
    expect(seccion()).toHaveAttribute("aria-busy", "false");
    expect(screen.getByTestId("kpis-actualizado")).not.toHaveTextContent(
      "Actualizando…",
    );
  });

  test("con la pestaña en segundo plano no pide nada", async () => {
    renderizar();
    await avanzar(0);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    await avanzar(CADENCIA_DE_REFRESCO_MS * 3);

    expect(obtenerKpis).toHaveBeenCalledTimes(1);
  });

  test("al volver a la ventana refresca en el acto", async () => {
    renderizar();
    await avanzar(0);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(obtenerKpis).toHaveBeenCalledTimes(2);
  });

  test("con un 403 deja de insistir", async () => {
    obtenerKpis.mockRejectedValue(
      fallo(403, "El rol no tiene permiso para esta accion"),
    );

    renderizar();
    await avanzar(0);
    await avanzar(CADENCIA_DE_REFRESCO_MS * 3);

    expect(obtenerKpis).toHaveBeenCalledTimes(1);
  });
});
