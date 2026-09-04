import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import DetalleProducto from "./DetalleProducto";
import { obtenerProducto } from "../services/productos";
import { registrarMovimiento } from "../services/movimientos";

vi.mock("../services/productos");
vi.mock("../services/movimientos", async (original) => ({
  ...(await original()),
  registrarMovimiento: vi.fn(),
}));

function renderizar(id = "p1") {
  return render(
    <MemoryRouter initialEntries={[`/productos/${id}`]}>
      <Routes>
        <Route path="/productos/:id" element={<DetalleProducto />} />
        <Route path="/configuracion" element={<p>Configuración</p>} />
        <Route path="/productos" element={<p>Catálogo</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function productoConStock(overrides = {}) {
  return {
    id: "p1",
    nombre: "Gaseosa 1.5L",
    codigoBarras: "7791234567890",
    categoria: "Bebidas",
    stock: { porUbicacion: [], total: 0 },
    ...overrides,
  };
}

describe("DetalleProducto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("muestra 'Cargando datos…' mientras espera la respuesta", () => {
    obtenerProducto.mockReturnValue(new Promise(() => {}));

    renderizar();

    expect(screen.getByText("Cargando datos…")).toBeInTheDocument();
  });

  test("muestra el nombre, el stock por ubicación y el total", async () => {
    obtenerProducto.mockResolvedValueOnce(
      productoConStock({
        stock: {
          porUbicacion: [
            { ubicacionId: "u1", ubicacionNombre: "Local", cantidad: 7 },
            { ubicacionId: "u2", ubicacionNombre: "Depósito", cantidad: 5 },
          ],
          total: 12,
        },
      }),
    );

    renderizar();

    expect(await screen.findByText("Gaseosa 1.5L")).toBeInTheDocument();
    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(screen.getByText("Depósito")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  test("sin ubicaciones configuradas muestra el mensaje y el link a Configuración", async () => {
    obtenerProducto.mockResolvedValueOnce(productoConStock());

    renderizar();

    expect(
      await screen.findByText(/no hay ubicaciones de stock configuradas/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ir a Configuración" }),
    ).toHaveAttribute("href", "/configuracion?seccion=ubicaciones");
  });

  test("muestra el error cuando el producto no existe o es de otro comercio", async () => {
    const error = new Error("El producto no existe");
    error.status = 404;
    obtenerProducto.mockRejectedValueOnce(error);

    renderizar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El producto no existe",
    );
  });

  test("ajusta el stock de una ubicación (entrada) y refresca la lista", async () => {
    const usuario = userEvent.setup();
    obtenerProducto
      .mockResolvedValueOnce(
        productoConStock({
          stock: {
            porUbicacion: [
              { ubicacionId: "u1", ubicacionNombre: "Local", cantidad: 0 },
            ],
            total: 0,
          },
        }),
      )
      .mockResolvedValueOnce(
        productoConStock({
          stock: {
            porUbicacion: [
              { ubicacionId: "u1", ubicacionNombre: "Local", cantidad: 5 },
            ],
            total: 5,
          },
        }),
      );
    registrarMovimiento.mockResolvedValueOnce({
      movimiento: {},
      stock: { cantidad: 5 },
    });

    renderizar();
    await screen.findByText("Local");

    await usuario.type(screen.getByLabelText("Cantidad"), "5");
    await usuario.selectOptions(
      screen.getByLabelText("Sentido"),
      "Entrada (suma al stock)",
    );
    await usuario.click(screen.getByRole("button", { name: "Ajustar" }));

    await waitFor(() => {
      expect(registrarMovimiento).toHaveBeenCalledWith({
        productoId: "p1",
        tipo: "ajuste",
        cantidad: 5,
        sentido: "entrada",
        ubicacionId: "u1",
      });
    });

    await waitFor(() => {
      // La cantidad de la fila y el total quedan ambos en 5.
      expect(screen.getAllByText("5")).toHaveLength(2);
    });
  });

  test("rechaza un ajuste sin cantidad ni sentido, sin llamar al service", async () => {
    const usuario = userEvent.setup();
    obtenerProducto.mockResolvedValueOnce(
      productoConStock({
        stock: {
          porUbicacion: [
            { ubicacionId: "u1", ubicacionNombre: "Local", cantidad: 0 },
          ],
          total: 0,
        },
      }),
    );

    renderizar();
    await screen.findByText("Local");

    await usuario.click(screen.getByRole("button", { name: "Ajustar" }));

    expect(
      await screen.findByText("Ingresá cuántas unidades."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Indicá si el ajuste suma o resta stock."),
    ).toBeInTheDocument();
    expect(registrarMovimiento).not.toHaveBeenCalled();
  });
});
