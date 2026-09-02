import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Productos from "./Productos";

vi.mock("../services/productos", async (original) => ({
  ...(await original()),
  obtenerProductos: vi.fn(),
}));

const { obtenerProductos } = await import("../services/productos");

const PRODUCTOS = [
  {
    id: "p1",
    nombre: "Coca-Cola 500ml",
    codigoBarras: "7790895000782",
    categoria: "Bebidas",
    unidadMedida: "unidad",
    umbralMinimo: 5,
  },
];

function renderizar(rutaInicial = "/productos") {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <Productos />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerProductos.mockResolvedValue(PRODUCTOS);
});

describe("Carga de la pantalla", () => {
  test("avisa mientras trae el catálogo", () => {
    obtenerProductos.mockReturnValue(new Promise(() => {}));
    renderizar();

    expect(screen.getByText(/cargando productos/i)).toBeInTheDocument();
  });

  test("muestra el catálogo cuando llega", async () => {
    renderizar();

    expect(await screen.findByText("Coca-Cola 500ml")).toBeInTheDocument();
    expect(obtenerProductos).toHaveBeenCalled();
  });

  test("no deja el 'Cargando…' colgado si la lista vuelve vacía", async () => {
    obtenerProductos.mockResolvedValue([]);
    renderizar();

    expect(await screen.findByText(/todavía no cargaste/i)).toBeInTheDocument();
    expect(screen.queryByText(/cargando productos/i)).not.toBeInTheDocument();
  });
});

describe("Cuando el backend no responde", () => {
  test("muestra el mensaje del backend en vez de la lista", async () => {
    obtenerProductos.mockRejectedValue(new Error("No hay sesion activa"));
    renderizar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no hay sesion activa/i,
    );
  });

  test("ofrece reintentar, para no dejar la pantalla sin salida", async () => {
    obtenerProductos.mockRejectedValueOnce(new Error("Se cayó el servidor"));
    renderizar();

    await userEvent.click(
      await screen.findByRole("button", { name: "Reintentar" }),
    );

    // El segundo intento usa el mock por defecto, que sí resuelve.
    expect(await screen.findByText("Coca-Cola 500ml")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Llegar desde el escáner", () => {
  test("abre el alta con el código puesto si viene en ?nuevo=", async () => {
    renderizar("/productos?nuevo=7791234567890");

    expect(await screen.findByLabelText(/código de barras/i)).toHaveValue(
      "7791234567890",
    );
  });

  test("sin ese parámetro el formulario arranca cerrado", async () => {
    renderizar();

    expect(await screen.findByText("Coca-Cola 500ml")).toBeInTheDocument();
    expect(screen.queryByLabelText(/código de barras/i)).not.toBeInTheDocument();
  });
});
