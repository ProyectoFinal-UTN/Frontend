import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import RegistrarMovimiento from "./RegistrarMovimiento";

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

const { obtenerProductos } = await import("../services/productos");
const { obtenerUbicaciones } = await import("../services/configuracion");
const { registrarMovimiento } = await import("../services/movimientos");

const PRODUCTOS = [
  { id: "p1", nombre: "Yerba Playadito 1kg" },
  { id: "p2", nombre: "Coca-Cola 500ml" },
];

const UNA_UBICACION = [{ id: "u1", nombre: "Local" }];
const DOS_UBICACIONES = [
  { id: "u1", nombre: "Local" },
  { id: "u2", nombre: "Depósito" },
];

function renderizar() {
  return render(
    <MemoryRouter initialEntries={["/movimientos/nuevo"]}>
      <RegistrarMovimiento />
    </MemoryRouter>,
  );
}

/** El cuerpo JSON del último POST, ya parseado. */
function ultimoEnvio() {
  return registrarMovimiento.mock.calls.at(-1)[0];
}

/** Completa producto, tipo y cantidad, que es el mínimo de todo movimiento. */
async function completarBase({ tipo = "venta", cantidad = "3" } = {}) {
  await userEvent.selectOptions(screen.getByLabelText("Producto"), "p1");
  await userEvent.selectOptions(screen.getByLabelText("Tipo de movimiento"), tipo);
  await userEvent.type(screen.getByLabelText("Cantidad"), cantidad);
}

function botonRegistrar() {
  return screen.getByRole("button", { name: "Registrar movimiento" });
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerProductos.mockResolvedValue(PRODUCTOS);
  obtenerUbicaciones.mockResolvedValue(UNA_UBICACION);
  registrarMovimiento.mockResolvedValue({
    movimiento: { id: "m1" },
    stock: { id: "s1", ubicacionId: "u1", cantidad: 17 },
  });
});

describe("Carga de la pantalla", () => {
  test("avisa mientras trae productos y ubicaciones", () => {
    obtenerProductos.mockReturnValue(new Promise(() => {}));
    renderizar();

    expect(screen.getByText(/cargando datos/i)).toBeInTheDocument();
  });

  test("muestra el formulario cuando llegan los dos pedidos", async () => {
    renderizar();

    expect(await screen.findByLabelText("Producto")).toBeInTheDocument();
    expect(obtenerProductos).toHaveBeenCalled();
    expect(obtenerUbicaciones).toHaveBeenCalled();
  });

  test("muestra el mensaje del backend y deja reintentar si falla la carga", async () => {
    obtenerUbicaciones.mockRejectedValueOnce(new Error("No hay sesion activa"));
    renderizar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no hay sesion activa/i,
    );

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByLabelText("Producto")).toBeInTheDocument();
  });
});

describe("Cuando falta configurar algo", () => {
  test("sin productos, manda a cargarlos en vez de dejar elegir la nada", async () => {
    obtenerProductos.mockResolvedValue([]);
    renderizar();

    expect(
      await screen.findByText(/todavía no cargaste ningún producto/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /cargar el primero/i })).toHaveAttribute(
      "href",
      "/productos",
    );
    expect(screen.queryByLabelText("Cantidad")).not.toBeInTheDocument();
  });

  test("sin ubicaciones, manda a crear una", async () => {
    obtenerUbicaciones.mockResolvedValue([]);
    renderizar();

    expect(
      await screen.findByText(/no configuraste dónde guardás/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /crear una ubicación/i }),
    ).toHaveAttribute("href", "/configuracion?seccion=ubicaciones");
  });
});

describe("Selector de ubicacion (RNF1: no pedir lo que no tiene alternativa)", () => {
  test("no aparece cuando el comercio tiene una sola ubicacion", async () => {
    renderizar();

    await screen.findByLabelText("Producto");
    expect(screen.queryByLabelText("Ubicación")).not.toBeInTheDocument();
  });

  test("aparece cuando el comercio tiene mas de una", async () => {
    obtenerUbicaciones.mockResolvedValue(DOS_UBICACIONES);
    renderizar();

    expect(await screen.findByLabelText("Ubicación")).toBeInTheDocument();
  });

  test("con una sola ubicacion el body sale sin ubicacionId", async () => {
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase();
    await userEvent.click(botonRegistrar());

    // El backend la resuelve solo; mandarla desde acá sería adivinar.
    expect(ultimoEnvio()).not.toHaveProperty("ubicacionId");
  });

  test("con varias ubicaciones la manda, y no deja enviar sin elegirla", async () => {
    obtenerUbicaciones.mockResolvedValue(DOS_UBICACIONES);
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase();
    await userEvent.click(botonRegistrar());

    expect(registrarMovimiento).not.toHaveBeenCalled();
    expect(screen.getByText(/elegí de qué ubicación/i)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Ubicación"), "u2");
    await userEvent.click(botonRegistrar());

    expect(ultimoEnvio().ubicacionId).toBe("u2");
  });
});

describe("Sentido del ajuste", () => {
  test("solo se pide cuando el tipo es ajuste", async () => {
    renderizar();
    await screen.findByLabelText("Producto");

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("Tipo de movimiento"),
      "ajuste",
    );

    expect(screen.getByRole("radio", { name: /entrada/i })).toBeInTheDocument();
  });

  test("un ajuste sin sentido no se envia", async () => {
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase({ tipo: "ajuste" });
    await userEvent.click(botonRegistrar());

    expect(registrarMovimiento).not.toHaveBeenCalled();
    // Específico a propósito: la leyenda del fieldset también dice "suma o
    // resta", y lo que se busca acá es el mensaje de error.
    expect(screen.getByText(/indicá si el ajuste/i)).toBeInTheDocument();
  });

  test("con el sentido elegido, viaja en el body", async () => {
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase({ tipo: "ajuste" });
    await userEvent.click(screen.getByRole("radio", { name: /salida/i }));
    await userEvent.click(botonRegistrar());

    expect(ultimoEnvio()).toMatchObject({ tipo: "ajuste", sentido: "salida" });
  });

  test("cambiar de ajuste a otro tipo no deja el sentido colgado", async () => {
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase({ tipo: "ajuste" });
    await userEvent.click(screen.getByRole("radio", { name: /salida/i }));
    await userEvent.selectOptions(
      screen.getByLabelText("Tipo de movimiento"),
      "venta",
    );
    await userEvent.click(botonRegistrar());

    expect(ultimoEnvio()).not.toHaveProperty("sentido");
  });
});

describe("Envio del movimiento", () => {
  test("manda la cantidad como numero y en positivo", async () => {
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase({ tipo: "venta", cantidad: "3" });
    await userEvent.click(botonRegistrar());

    // El signo lo pone el backend según el tipo; desde acá siempre positivo.
    expect(ultimoEnvio()).toMatchObject({
      productoId: "p1",
      tipo: "venta",
      cantidad: 3,
    });
    expect(typeof ultimoEnvio().cantidad).toBe("number");
  });

  test("nunca manda proveedorId ni transferenciaId, que no son de esta HU", async () => {
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase();
    await userEvent.click(botonRegistrar());

    expect(ultimoEnvio()).not.toHaveProperty("proveedorId");
    expect(ultimoEnvio()).not.toHaveProperty("transferenciaId");
  });

  test("confirma con el stock que quedo, no con un 'listo' a secas", async () => {
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase();
    await userEvent.click(botonRegistrar());

    // El criterio de aceptación es que el stock se actualice: se muestra el
    // saldo que devolvió el backend para que se vea, y no quede supuesto.
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Yerba Playadito 1kg quedó con 17 unidades en Local/i,
    );
  });

  test("deja listo el siguiente movimiento: limpia la cantidad y conserva el resto", async () => {
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase();
    await userEvent.click(botonRegistrar());

    await screen.findByRole("status");
    expect(screen.getByLabelText("Cantidad")).toHaveValue(null);
    expect(screen.getByLabelText("Producto")).toHaveValue("p1");
    expect(screen.getByLabelText("Tipo de movimiento")).toHaveValue("venta");
  });
});

describe("Rechazo por stock insuficiente", () => {
  const MENSAJE =
    "Stock insuficiente: hay 4 unidades disponibles y se intentan descontar 10";

  function rechazarPorStock() {
    const error = new Error(MENSAJE);
    error.status = 409;
    registrarMovimiento.mockRejectedValueOnce(error);
  }

  test("muestra el mensaje del backend, con el disponible y lo pedido", async () => {
    rechazarPorStock();
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase({ cantidad: "10" });
    await userEvent.click(botonRegistrar());

    expect(await screen.findByRole("alert")).toHaveTextContent(MENSAJE);
  });

  test("no lo muestra como un error generico", async () => {
    rechazarPorStock();
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase({ cantidad: "10" });
    await userEvent.click(botonRegistrar());

    await screen.findByRole("alert");
    expect(screen.queryByText(/no se pudo completar la operación/i)).toBeNull();
    expect(screen.getByText(/corregí la cantidad/i)).toBeInTheDocument();
  });

  test("menciona la otra ubicacion como salida solo si hay mas de una", async () => {
    obtenerUbicaciones.mockResolvedValue(DOS_UBICACIONES);
    rechazarPorStock();
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase({ cantidad: "10" });
    await userEvent.selectOptions(screen.getByLabelText("Ubicación"), "u2");
    await userEvent.click(botonRegistrar());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /probá con otra ubicación/i,
    );
  });

  test("conserva lo cargado y devuelve el foco a la cantidad", async () => {
    rechazarPorStock();
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase({ cantidad: "10" });
    await userEvent.click(botonRegistrar());

    await screen.findByRole("alert");
    // Rehacer el formulario entero por un número mal puesto sería el camino
    // largo justo en el flujo que RNF1 pide corto.
    expect(screen.getByLabelText("Producto")).toHaveValue("p1");
    expect(screen.getByLabelText("Tipo de movimiento")).toHaveValue("venta");
    expect(screen.getByLabelText("Cantidad")).toHaveFocus();
  });

  test("el aviso desaparece al corregir la cantidad", async () => {
    rechazarPorStock();
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase({ cantidad: "10" });
    await userEvent.click(botonRegistrar());

    await screen.findByRole("alert");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Otros errores del backend", () => {
  test("un 400 se muestra como error, no como aviso de stock", async () => {
    const error = new Error("El producto no existe");
    error.status = 404;
    registrarMovimiento.mockRejectedValueOnce(error);
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase();
    await userEvent.click(botonRegistrar());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /el producto no existe/i,
    );
    expect(screen.queryByText(/corregí la cantidad/i)).toBeNull();
  });
});
