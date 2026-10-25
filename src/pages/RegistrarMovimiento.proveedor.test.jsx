import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import RegistrarMovimiento from "./RegistrarMovimiento";

/**
 * El proveedor de una compra (HU-20), en un archivo aparte del de HU-13 para no
 * mezclar las reglas de las dos historias. Mismo esquema: se mockean los
 * services, nunca la pantalla.
 */

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
  registrarMovimiento: vi.fn(),
}));

vi.mock("../services/proveedores", () => ({
  obtenerProveedores: vi.fn(),
  obtenerProveedoresDeProducto: vi.fn(),
}));

const { obtenerProductos } = await import("../services/productos");
const { obtenerUbicaciones } = await import("../services/configuracion");
const { registrarMovimiento } = await import("../services/movimientos");
const { obtenerProveedores, obtenerProveedoresDeProducto } = await import(
  "../services/proveedores"
);

const PRODUCTOS = [
  { id: "p1", nombre: "Yerba Playadito 1kg" },
  { id: "p2", nombre: "Coca-Cola 500ml" },
];

const PROVEEDORES = [
  { id: "v1", nombre: "Distribuidora Sur" },
  { id: "v2", nombre: "Mayorista Norte" },
  { id: "v3", nombre: "Bebidas del Oeste" },
];

function renderizar() {
  return render(
    <MemoryRouter initialEntries={["/movimientos/nuevo"]}>
      <RegistrarMovimiento />
    </MemoryRouter>,
  );
}

const campoProveedor = () => screen.queryByLabelText("Proveedor (opcional)");

async function elegir(producto, tipo) {
  await userEvent.selectOptions(await screen.findByLabelText("Producto"), producto);
  await userEvent.selectOptions(screen.getByLabelText("Tipo de movimiento"), tipo);
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerProductos.mockResolvedValue(PRODUCTOS);
  obtenerUbicaciones.mockResolvedValue([{ id: "u1", nombre: "Local" }]);
  obtenerProveedores.mockResolvedValue(PROVEEDORES);
  obtenerProveedoresDeProducto.mockResolvedValue([]);
  registrarMovimiento.mockResolvedValue({
    movimiento: { id: "m1" },
    stock: { id: "s1", ubicacionId: "u1", cantidad: 17 },
  });
});

describe("Cuándo aparece", () => {
  test("solo en una compra", async () => {
    renderizar();

    await elegir("p1", "venta");
    expect(campoProveedor()).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Tipo de movimiento"), "compra");
    expect(campoProveedor()).toBeInTheDocument();
  });

  test("no aparece si el comercio no tiene proveedores", async () => {
    obtenerProveedores.mockResolvedValue([]);
    renderizar();

    await elegir("p1", "compra");

    expect(campoProveedor()).not.toBeInTheDocument();
  });

  test("si la lista de proveedores no carga, el formulario funciona igual", async () => {
    obtenerProveedores.mockRejectedValue(new Error("Error interno del servidor"));
    renderizar();

    await elegir("p1", "compra");
    await userEvent.type(screen.getByLabelText("Cantidad"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(registrarMovimiento).toHaveBeenCalledWith({
      productoId: "p1",
      tipo: "compra",
      cantidad: 5,
    });
  });
});

describe("Sugeridos del producto", () => {
  test("los proveedores asociados al producto van primero, en su propio grupo", async () => {
    obtenerProveedoresDeProducto.mockResolvedValue([{ id: "v2", nombre: "Mayorista Norte" }]);
    renderizar();

    await elegir("p1", "compra");

    const sugeridos = await screen.findByRole("group", { name: "Le comprás este producto a" });
    expect(within(sugeridos).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Mayorista Norte",
    ]);
    const otros = screen.getByRole("group", { name: "Otros proveedores" });
    expect(within(otros).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Distribuidora Sur",
      "Bebidas del Oeste",
    ]);
    expect(obtenerProveedoresDeProducto).toHaveBeenCalledWith("p1");
  });

  test("no preselecciona ninguno: el proveedor lo elige la persona", async () => {
    obtenerProveedoresDeProducto.mockResolvedValue([{ id: "v2", nombre: "Mayorista Norte" }]);
    renderizar();

    await elegir("p1", "compra");
    await screen.findByRole("group", { name: "Le comprás este producto a" });

    expect(campoProveedor()).toHaveValue("");
  });

  test("al cambiar de producto, los sugeridos son los del nuevo", async () => {
    obtenerProveedoresDeProducto.mockImplementation(async (productoId) =>
      productoId === "p1"
        ? [{ id: "v1", nombre: "Distribuidora Sur" }]
        : [{ id: "v3", nombre: "Bebidas del Oeste" }],
    );
    renderizar();

    await elegir("p1", "compra");
    await screen.findByRole("group", { name: "Le comprás este producto a" });
    await userEvent.selectOptions(screen.getByLabelText("Producto"), "p2");

    await waitFor(() => {
      const sugeridos = screen.getByRole("group", { name: "Le comprás este producto a" });
      expect(within(sugeridos).getAllByRole("option").map((o) => o.textContent)).toEqual([
        "Bebidas del Oeste",
      ]);
    });
  });

  test("sin asociados, la lista va entera y sin grupos", async () => {
    renderizar();

    await elegir("p1", "compra");
    await waitFor(() => expect(obtenerProveedoresDeProducto).toHaveBeenCalled());

    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(within(campoProveedor()).getAllByRole("option")).toHaveLength(4);
  });

  test("si no se pueden traer los sugeridos, se ofrece la lista entera", async () => {
    obtenerProveedoresDeProducto.mockRejectedValue(new Error("sin red"));
    renderizar();

    await elegir("p1", "compra");
    await waitFor(() => expect(obtenerProveedoresDeProducto).toHaveBeenCalled());

    expect(within(campoProveedor()).getAllByRole("option")).toHaveLength(4);
  });
});

describe("Lo que se envía", () => {
  test("la compra viaja con el proveedor elegido", async () => {
    renderizar();

    await elegir("p1", "compra");
    await userEvent.selectOptions(campoProveedor(), "v3");
    await userEvent.type(screen.getByLabelText("Cantidad"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));

    expect(registrarMovimiento).toHaveBeenCalledWith({
      productoId: "p1",
      tipo: "compra",
      cantidad: 12,
      proveedorId: "v3",
    });
  });

  test("sin elegir, la compra viaja sin proveedor", async () => {
    renderizar();

    await elegir("p1", "compra");
    await userEvent.type(screen.getByLabelText("Cantidad"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));

    expect(registrarMovimiento.mock.calls.at(-1)[0]).not.toHaveProperty("proveedorId");
  });

  test("pasar de compra a venta descarta el proveedor elegido", async () => {
    renderizar();

    await elegir("p1", "compra");
    await userEvent.selectOptions(campoProveedor(), "v1");
    await userEvent.selectOptions(screen.getByLabelText("Tipo de movimiento"), "venta");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));

    expect(registrarMovimiento.mock.calls.at(-1)[0]).not.toHaveProperty("proveedorId");

    // Y al volver a compra, no reaparece elegido.
    await userEvent.selectOptions(screen.getByLabelText("Tipo de movimiento"), "compra");
    expect(campoProveedor()).toHaveValue("");
  });

  test("un proveedor que desapareció de la lista no viaja", async () => {
    renderizar();

    await elegir("p1", "compra");
    await userEvent.selectOptions(campoProveedor(), "v2");

    // Lo dieron de baja desde otra pantalla y un refresco trae la lista sin él.
    obtenerProveedores.mockResolvedValue(PROVEEDORES.filter((p) => p.id !== "v2"));
    registrarMovimiento.mockRejectedValueOnce(Object.assign(new Error("Falla"), { status: 500 }));
    await userEvent.type(screen.getByLabelText("Cantidad"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));
    await userEvent.click(await screen.findByRole("button", { name: "Actualizar datos" }));
    await waitFor(() => expect(obtenerProveedores).toHaveBeenCalledTimes(2));

    expect(campoProveedor()).toHaveValue("");
    registrarMovimiento.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));

    expect(registrarMovimiento.mock.calls.at(-1)[0]).not.toHaveProperty("proveedorId");
  });
});
