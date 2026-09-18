import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import HistorialMovimientos from "./HistorialMovimientos";

vi.mock("../services/productos", async (original) => ({
  ...(await original()),
  obtenerProductos: vi.fn(),
}));

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerUbicaciones: vi.fn(),
}));

vi.mock("../services/movimientos", async (original) => ({
  ...(await original()),
  obtenerHistorial: vi.fn(),
}));

const { obtenerProductos } = await import("../services/productos");
const { obtenerUbicaciones } = await import("../services/configuracion");
const { obtenerHistorial } = await import("../services/movimientos");

const PRODUCTOS = [
  { id: "p1", nombre: "Yerba 1kg" },
  { id: "p2", nombre: "Fideos 500g" },
];

const DOS_UBICACIONES = [
  { id: "u1", nombre: "Local" },
  { id: "u2", nombre: "Depósito" },
];

function movimiento(overrides = {}) {
  return {
    id: "m1",
    fecha: "2026-09-18T15:30:00.000Z",
    tipo: "venta",
    cantidad: -3,
    motivo: null,
    proveedorId: null,
    transferenciaId: null,
    producto: {
      id: "p1",
      nombre: "Yerba 1kg",
      codigoBarras: "7790001112223",
      unidadMedida: "unidad",
      activo: true,
    },
    ubicacion: { id: "u1", nombre: "Local" },
    usuario: { id: "us1", nombre: "Ana", correo: "ana@test.local" },
    ...overrides,
  };
}

function respuesta(movimientos, paginacion = {}) {
  return {
    movimientos,
    paginacion: {
      pagina: 1,
      limite: 50,
      total: movimientos.length,
      totalPaginas: movimientos.length ? 1 : 0,
      ...paginacion,
    },
  };
}

/** Deja ver la query string actual, para verificar que los filtros van a la URL. */
function UbicacionActual() {
  const { search } = useLocation();
  return <output data-testid="url">{search}</output>;
}

function renderizar(url = "/movimientos") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/movimientos"
          element={
            <>
              <HistorialMovimientos />
              <UbicacionActual />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const ultimosFiltros = () => obtenerHistorial.mock.calls.at(-1)[0];

beforeEach(() => {
  obtenerProductos.mockReset().mockResolvedValue(PRODUCTOS);
  obtenerUbicaciones.mockReset().mockResolvedValue(DOS_UBICACIONES);
  obtenerHistorial.mockReset().mockResolvedValue(respuesta([movimiento()]));
});

describe("Listado", () => {
  test("muestra cada movimiento con todos sus datos", async () => {
    obtenerHistorial.mockResolvedValue(
      respuesta([movimiento({ tipo: "merma", cantidad: -2, motivo: "Se venció" })]),
    );

    renderizar();

    const item = await screen.findByRole("listitem");
    expect(within(item).getByText("Yerba 1kg")).toBeInTheDocument();
    expect(within(item).getByText(/^Merma/)).toBeInTheDocument();
    expect(within(item).getByText("−2")).toBeInTheDocument();
    expect(within(item).getByText("Local")).toBeInTheDocument();
    expect(within(item).getByText("Ana")).toBeInTheDocument();
    expect(within(item).getByText("7790001112223")).toBeInTheDocument();
    expect(within(item).getByText("Se venció")).toBeInTheDocument();
  });

  test("un movimiento sin motivo no muestra el campo vacío", async () => {
    // Compras, ventas y todo lo cargado antes de HU-15 vienen con motivo null.
    renderizar();

    const item = await screen.findByRole("listitem");
    expect(within(item).queryByText("Motivo")).not.toBeInTheDocument();
  });

  test.each(["ajuste", "merma"])(
    "un %s se marca como corrección (criterio de HU-15)",
    async (tipo) => {
      obtenerHistorial.mockResolvedValue(
        respuesta([movimiento({ tipo, cantidad: 2, motivo: "Recuento" })]),
      );

      renderizar();

      const item = await screen.findByRole("listitem");
      expect(within(item).getByText("· corrección")).toBeInTheDocument();
    },
  );

  test.each(["compra", "venta"])(
    "una %s no se marca como corrección",
    async (tipo) => {
      obtenerHistorial.mockResolvedValue(
        respuesta([movimiento({ tipo, cantidad: tipo === "compra" ? 2 : -2 })]),
      );

      renderizar();

      const item = await screen.findByRole("listitem");
      expect(within(item).queryByText("· corrección")).not.toBeInTheDocument();
    },
  );

  test("un ajuste de entrada no se confunde con una compra aunque los dos sumen", async () => {
    obtenerHistorial.mockResolvedValue(
      respuesta([
        movimiento({ id: "m1", tipo: "compra", cantidad: 5 }),
        movimiento({ id: "m2", tipo: "ajuste", cantidad: 5, motivo: "Recuento" }),
      ]),
    );

    renderizar();

    const [compra, ajuste] = await screen.findAllByRole("listitem");
    expect(within(compra).getByText("Compra")).not.toHaveAttribute(
      "data-correccion",
    );
    expect(within(ajuste).getByText(/^Ajuste/)).toHaveAttribute(
      "data-correccion",
      "true",
    );
  });

  test("una entrada se muestra con signo +", async () => {
    obtenerHistorial.mockResolvedValue(
      respuesta([movimiento({ tipo: "compra", cantidad: 5 })]),
    );

    renderizar();

    expect(await screen.findByText("+5")).toBeInTheDocument();
  });

  test("marca los productos dados de baja", async () => {
    obtenerHistorial.mockResolvedValue(
      respuesta([
        movimiento({
          producto: { ...movimiento().producto, activo: false },
        }),
      ]),
    );

    renderizar();

    expect(await screen.findByText("(dado de baja)")).toBeInTheDocument();
  });

  test("sin movimientos y sin filtros lo dice", async () => {
    obtenerHistorial.mockResolvedValue(respuesta([]));

    renderizar();

    expect(
      await screen.findByText("Todavía no hay movimientos registrados."),
    ).toBeInTheDocument();
  });

  test("sin resultados con filtros puestos, lo dice distinto", async () => {
    obtenerHistorial.mockResolvedValue(respuesta([]));

    renderizar("/movimientos?tipo=compra");

    expect(
      await screen.findByText("No hay movimientos que coincidan con esos filtros."),
    ).toBeInTheDocument();
  });

  test("un error del backend se muestra y se puede reintentar", async () => {
    obtenerHistorial.mockRejectedValueOnce(new Error("Se cayó la conexión"));

    renderizar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Se cayó la conexión",
    );

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("listitem")).toBeInTheDocument();
  });
});

describe("Filtros", () => {
  test("los filtros de la URL se aplican al abrir la pantalla", async () => {
    renderizar("/movimientos?productoId=p2&tipo=venta&proveedorId=pr1");

    await screen.findByRole("listitem");

    expect(ultimosFiltros()).toMatchObject({
      productoId: "p2",
      tipo: "venta",
      proveedorId: "pr1",
      pagina: 1,
    });
    expect(
      screen.getByText("Mostrando solo los movimientos de un proveedor."),
    ).toBeInTheDocument();
  });

  test("elegir un producto y un tipo consulta con los dos y los deja en la URL", async () => {
    renderizar();
    await screen.findByRole("option", { name: "Fideos 500g" });

    await userEvent.selectOptions(screen.getByLabelText("Producto"), "p2");
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "merma");

    await waitFor(() =>
      expect(ultimosFiltros()).toMatchObject({ productoId: "p2", tipo: "merma" }),
    );
    expect(screen.getByTestId("url")).toHaveTextContent(
      "?productoId=p2&tipo=merma",
    );
  });

  test("filtra por rango de fechas", async () => {
    renderizar();
    await screen.findByRole("listitem");

    await userEvent.type(screen.getByLabelText("Desde"), "2026-09-01");
    await userEvent.type(screen.getByLabelText("Hasta"), "2026-09-18");

    await waitFor(() =>
      expect(ultimosFiltros()).toMatchObject({
        desde: "2026-09-01",
        hasta: "2026-09-18",
      }),
    );
  });

  test("con el rango al revés avisa y no consulta", async () => {
    renderizar("/movimientos?desde=2026-09-18&hasta=2026-09-01");

    expect(
      await screen.findByText("La fecha «Desde» no puede ser posterior a «Hasta»."),
    ).toBeInTheDocument();
    expect(obtenerHistorial).not.toHaveBeenCalled();
    expect(screen.queryByText("Cargando movimientos…")).not.toBeInTheDocument();
  });

  test("con varias ubicaciones se puede filtrar por ubicación", async () => {
    renderizar();
    await screen.findByRole("option", { name: "Depósito" });

    await userEvent.selectOptions(screen.getByLabelText("Ubicación"), "u2");

    await waitFor(() =>
      expect(ultimosFiltros()).toMatchObject({ ubicacionId: "u2" }),
    );
  });

  test("con una sola ubicación el filtro no aparece", async () => {
    obtenerUbicaciones.mockResolvedValue([{ id: "u1", nombre: "Local" }]);

    renderizar();
    await screen.findByRole("option", { name: "Yerba 1kg" });

    expect(screen.queryByLabelText("Ubicación")).not.toBeInTheDocument();
  });

  test("cambiar un filtro vuelve a la primera página", async () => {
    renderizar("/movimientos?pagina=3");
    await screen.findByRole("option", { name: "Fideos 500g" });

    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "compra");

    await waitFor(() =>
      expect(ultimosFiltros()).toMatchObject({ tipo: "compra", pagina: 1 }),
    );
  });

  test("«Limpiar filtros» los quita todos", async () => {
    renderizar("/movimientos?tipo=venta&productoId=p1");
    await screen.findByRole("listitem");

    await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    await waitFor(() => expect(screen.getByTestId("url")).toBeEmptyDOMElement());
    expect(ultimosFiltros()).toMatchObject({ tipo: "", productoId: "" });
  });

  test("un producto que no está en el catálogo igual se ve elegido en el filtro", async () => {
    renderizar("/movimientos?productoId=dado-de-baja");
    await screen.findByRole("listitem");

    expect(screen.getByLabelText("Producto")).toHaveDisplayValue(
      "Producto dado de baja",
    );
  });
});

describe("Paginación", () => {
  test("pasa a la página siguiente y vuelve", async () => {
    obtenerHistorial.mockResolvedValue(
      respuesta([movimiento()], { total: 120, totalPaginas: 3 }),
    );

    renderizar();
    expect(await screen.findByText("Página 1 de 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Anterior" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Siguiente →" }));

    await waitFor(() => expect(ultimosFiltros()).toMatchObject({ pagina: 2 }));
    expect(screen.getByTestId("url")).toHaveTextContent("?pagina=2");
  });

  test("con una sola página no muestra la paginación", async () => {
    renderizar();
    await screen.findByRole("listitem");

    expect(screen.queryByRole("navigation", { name: "Paginación" })).toBeNull();
  });
});
