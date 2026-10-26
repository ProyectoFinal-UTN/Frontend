import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ProductosDelProveedor from "./ProductosDelProveedor";

/**
 * El otro lado del vínculo (HU-20). El ciclo del editor ya está probado en
 * `ProveedoresDelProducto.test.jsx`; acá se prueba lo propio: qué carga, cómo
 * dibuja cada producto y en qué orden van los ids al asociar y quitar.
 */

vi.mock("../services/proveedores", () => ({
  obtenerProductosDeProveedor: vi.fn(),
  asociarProveedor: vi.fn(),
  desasociarProveedor: vi.fn(),
}));

vi.mock("../services/productos", () => ({
  obtenerProductos: vi.fn(),
}));

const { obtenerProductosDeProveedor, asociarProveedor, desasociarProveedor } =
  await import("../services/proveedores");
const { obtenerProductos } = await import("../services/productos");

const YERBA = { id: "p1", nombre: "Yerba 1kg" };
const FIDEOS = { id: "p2", nombre: "Fideos 500g" };

function renderizar(props = {}) {
  return render(
    <MemoryRouter>
      <ProductosDelProveedor proveedorId="v1" puedeEditar {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerProductosDeProveedor.mockResolvedValue([YERBA]);
  obtenerProductos.mockResolvedValue([YERBA, FIDEOS]);
  asociarProveedor.mockResolvedValue({});
  desasociarProveedor.mockResolvedValue(null);
});

test("cada producto linkea a su ficha de stock", async () => {
  renderizar();

  expect(await screen.findByRole("link", { name: "Yerba 1kg" })).toHaveAttribute(
    "href",
    "/productos/p1",
  );
  expect(obtenerProductosDeProveedor).toHaveBeenCalledWith("v1");
});

describe("Escribe sobre el mismo vínculo que el detalle del producto", () => {
  test("asociar manda primero el producto y después el proveedor", async () => {
    renderizar();
    await screen.findByRole("link", { name: "Yerba 1kg" });

    await userEvent.selectOptions(screen.getByLabelText("Agregar producto"), "p2");
    await userEvent.click(screen.getByRole("button", { name: "Asociar" }));

    expect(asociarProveedor).toHaveBeenCalledWith("p2", "v1");
  });

  test("quitar también", async () => {
    renderizar();

    await userEvent.click(await screen.findByRole("button", { name: "Quitar Yerba 1kg" }));

    expect(desasociarProveedor).toHaveBeenCalledWith("p1", "v1");
  });
});

test("sin productos asociados lo dice", async () => {
  obtenerProductosDeProveedor.mockResolvedValue([]);
  renderizar();

  expect(
    await screen.findByText("Todavía no le asociaste ningún producto."),
  ).toBeInTheDocument();
});
