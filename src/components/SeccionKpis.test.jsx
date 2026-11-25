import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SeccionKpis, { CADENCIA_DE_REFRESCO_MS } from "./SeccionKpis";

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

beforeEach(() => {
  vi.clearAllMocks();
  obtenerKpis.mockResolvedValue(kpis());
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
