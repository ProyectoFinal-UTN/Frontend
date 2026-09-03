import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import Productos from "./Productos";

/**
 * Expone la query actual en el DOM.
 *
 * `MemoryRouter` no toca `window.location`, así que es la única forma de
 * afirmar sobre la URL desde un test.
 */
function SondaDeUrl() {
  return <span data-testid="query">{useLocation().search}</span>;
}

vi.mock("../services/productos", async (original) => ({
  ...(await original()),
  obtenerProductos: vi.fn(),
  eliminarProducto: vi.fn(),
}));

const { obtenerProductos, eliminarProducto } = await import(
  "../services/productos"
);

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
      <SondaDeUrl />
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

  test("el código desaparece de la URL una vez usado", async () => {
    renderizar("/productos?nuevo=7791234567890&otro=1");

    expect(await screen.findByLabelText(/código de barras/i)).toHaveValue(
      "7791234567890",
    );
    // El formulario sigue abierto con el código, pero la URL ya no lo lleva.
    const query = screen.getByTestId("query").textContent;
    expect(query).not.toContain("nuevo=");
    // Y se borró solo `nuevo`, no la query entera.
    expect(query).toContain("otro=1");
  });

  test("si la carga falla antes de abrir el alta, el reintento sí la abre", async () => {
    obtenerProductos.mockRejectedValueOnce(new Error("Se cayó el servidor"));
    renderizar("/productos?nuevo=7791234567890");

    await userEvent.click(
      await screen.findByRole("button", { name: "Reintentar" }),
    );

    // El código nunca se consumió, porque la sección nunca llegó a montarse.
    // El usuario venía del escáner y todavía no creó nada: le corresponde ver
    // el alta que vino a buscar.
    expect(await screen.findByLabelText(/código de barras/i)).toHaveValue(
      "7791234567890",
    );
  });

  test("una vez usado, un remonte de la sección no reabre el alta", async () => {
    // Recorrido del bug: el alta se abre con el código, se cierra, una recarga
    // posterior falla y el «Reintentar» vuelve a montar la sección. Si el
    // código siguiera vivo, el alta reaparecería con uno que quizá ya se dio
    // de alta y guardar devolvería un 409 que el usuario no pidió.
    eliminarProducto.mockResolvedValue(null);
    obtenerProductos
      .mockResolvedValueOnce(PRODUCTOS)
      .mockRejectedValueOnce(new Error("Se cayó el servidor"))
      .mockResolvedValue(PRODUCTOS);

    const usuario = userEvent.setup();
    renderizar("/productos?nuevo=7791234567890");

    expect(await screen.findByLabelText(/código de barras/i)).toHaveValue(
      "7791234567890",
    );
    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));

    // Una operación cualquiera dispara la recarga, y esa recarga falla.
    await usuario.click(
      screen.getByRole("button", { name: "Eliminar Coca-Cola 500ml" }),
    );
    await usuario.click(screen.getByRole("button", { name: /sí, eliminar/i }));

    await usuario.click(
      await screen.findByRole("button", { name: "Reintentar" }),
    );

    expect(await screen.findByText("Coca-Cola 500ml")).toBeInTheDocument();
    expect(screen.queryByLabelText(/código de barras/i)).not.toBeInTheDocument();
  });
});
