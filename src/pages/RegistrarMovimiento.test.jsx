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
  test("sin productos, lleva al catalogo en vez de dejar elegir la nada", async () => {
    obtenerProductos.mockResolvedValue([]);
    renderizar();

    expect(
      await screen.findByText(/todavía no hay productos cargados/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ir a productos/i })).toHaveAttribute(
      "href",
      "/productos",
    );
    expect(screen.queryByLabelText("Cantidad")).not.toBeInTheDocument();
  });

  test("sin ubicaciones, lleva a configuracion", async () => {
    obtenerUbicaciones.mockResolvedValue([]);
    renderizar();

    expect(
      await screen.findByText(/no hay ninguna ubicación configurada/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ir a configuración/i }),
    ).toHaveAttribute("href", "/configuracion?seccion=ubicaciones");
  });

  test("no promete crear: un empleado solo tiene lectura sobre esas pantallas", async () => {
    obtenerProductos.mockResolvedValue([]);
    renderizar();

    // El front todavía no conoce el rol (llega con HU-4), así que el texto no
    // puede asegurar que quien lee pueda cargar el producto.
    await screen.findByRole("link", { name: /ir a productos/i });
    expect(screen.queryByText(/cargar el primero/i)).toBeNull();
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

describe("Respuesta incompleta con el movimiento ya registrado", () => {
  test("un 2xx sin cuerpo legible se confirma, nunca se muestra como error", async () => {
    // `apiFetch` devuelve null ante un 2xx con cuerpo vacío o no parseable. El
    // movimiento ya está en el libro: mostrarlo como error hace que el usuario
    // reintente y el stock se descuente dos veces.
    registrarMovimiento.mockResolvedValueOnce(null);
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase();
    await userEvent.click(botonRegistrar());

    expect(await screen.findByRole("status")).toHaveTextContent(
      /registramos el movimiento de Yerba Playadito 1kg/i,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("sin stock en la respuesta tampoco inventa un numero", async () => {
    registrarMovimiento.mockResolvedValueOnce({ movimiento: { id: "m1" } });
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase();
    await userEvent.click(botonRegistrar());

    const confirmacion = await screen.findByRole("status");
    expect(confirmacion).toHaveTextContent(/registramos el movimiento/i);
    expect(confirmacion).not.toHaveTextContent(/unidades/i);
  });

  test("una ubicacion desconocida omite la frase en vez de dejar un hueco", async () => {
    // La lista cargada no tiene "u9": puede pasar si se creó después de abrir
    // la pantalla. Antes esto renderizaba "…quedó con 17 unidades en .".
    registrarMovimiento.mockResolvedValueOnce({
      movimiento: { id: "m1" },
      stock: { id: "s1", ubicacionId: "u9", cantidad: 17 },
    });
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase();
    await userEvent.click(botonRegistrar());

    const confirmacion = await screen.findByRole("status");
    expect(confirmacion).toHaveTextContent(
      /Yerba Playadito 1kg quedó con 17 unidades\./i,
    );
    expect(confirmacion).not.toHaveTextContent(/ en \./i);
  });
});

describe("Datos viejos en pantalla", () => {
  test("Actualizar datos vuelve a pedir las listas y dibuja el selector", async () => {
    const error = new Error("Se requiere indicar la ubicación: el comercio tiene más de una");
    error.status = 400;
    registrarMovimiento.mockRejectedValueOnce(error);
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase();
    expect(screen.queryByLabelText("Ubicación")).not.toBeInTheDocument();

    await userEvent.click(botonRegistrar());
    await screen.findByRole("alert");

    // Mientras tanto alguien creó una segunda ubicación.
    obtenerUbicaciones.mockResolvedValue(DOS_UBICACIONES);
    await userEvent.click(
      screen.getByRole("button", { name: "Actualizar datos" }),
    );

    expect(await screen.findByLabelText("Ubicación")).toBeInTheDocument();
    expect(obtenerProductos).toHaveBeenCalledTimes(2);
  });

  test("el refresco conserva lo ya cargado en el formulario", async () => {
    const error = new Error("Se requiere indicar la ubicación");
    error.status = 400;
    registrarMovimiento.mockRejectedValueOnce(error);
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase({ cantidad: "5" });
    await userEvent.click(botonRegistrar());
    await screen.findByRole("alert");

    obtenerUbicaciones.mockResolvedValue(DOS_UBICACIONES);
    await userEvent.click(
      screen.getByRole("button", { name: "Actualizar datos" }),
    );

    await screen.findByLabelText("Ubicación");
    // Rehacer el formulario por un dato que envejeció sería el camino largo.
    expect(screen.getByLabelText("Producto")).toHaveValue("p1");
    expect(screen.getByLabelText("Cantidad")).toHaveValue(5);
  });

  test("si el refresco falla, el formulario sigue en pantalla con sus datos", async () => {
    const error = new Error("Se requiere indicar la ubicación");
    error.status = 400;
    registrarMovimiento.mockRejectedValueOnce(error);
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase({ cantidad: "5" });
    await userEvent.click(botonRegistrar());
    await screen.findByRole("alert");

    obtenerUbicaciones.mockRejectedValueOnce(new Error("Se cayó el servidor"));
    await userEvent.click(
      screen.getByRole("button", { name: "Actualizar datos" }),
    );

    expect(await screen.findByText(/se cayó el servidor/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad")).toHaveValue(5);
  });
});

describe("Refresco y envio no se pisan", () => {
  /** Deja la pantalla con el banner de error, que es donde vive el refresco. */
  async function conBannerDeError() {
    const error = new Error("Se requiere indicar la ubicación");
    error.status = 400;
    registrarMovimiento.mockRejectedValueOnce(error);
    renderizar();
    await screen.findByLabelText("Producto");
    await completarBase();
    await userEvent.click(botonRegistrar());
    await screen.findByRole("alert");
  }

  test("con un envio en curso el refresco ni siquiera esta a mano", async () => {
    registrarMovimiento.mockReturnValue(new Promise(() => {}));
    await conBannerDeError();
    await userEvent.click(botonRegistrar());

    // El envío limpia `errorGeneral` al arrancar, así que el banner —y con él
    // el botón— se van de la pantalla mientras dura. La otra mitad de la
    // exclusión (el envío bloqueado durante el refresco) es la que cierra la
    // carrera, y va en el test siguiente.
    expect(
      screen.queryByRole("button", { name: "Actualizar datos" }),
    ).not.toBeInTheDocument();
  });

  test("con un refresco en curso no se puede enviar", async () => {
    await conBannerDeError();

    obtenerUbicaciones.mockReturnValue(new Promise(() => {}));
    await userEvent.click(
      screen.getByRole("button", { name: "Actualizar datos" }),
    );

    expect(screen.getByRole("button", { name: /registrar movimiento/i }))
      .toBeDisabled();
  });

  test("el refresco muestra el motivo real, no un consejo de conexion", async () => {
    await conBannerDeError();

    // Una sesión vencida no se arregla revisando la conexión: el backend ya
    // redacta el mensaje para un comerciante y hay que mostrar ese.
    obtenerUbicaciones.mockRejectedValueOnce(new Error("No hay sesión activa"));
    await userEvent.click(
      screen.getByRole("button", { name: "Actualizar datos" }),
    );

    expect(await screen.findByText(/no hay sesión activa/i)).toBeInTheDocument();
    expect(screen.queryByText(/revisá tu conexión/i)).toBeNull();
  });
});

describe("Seleccion que desaparecio del catalogo", () => {
  test("un producto dado de baja no viaja en el POST", async () => {
    const error = new Error("Se requiere indicar la ubicación");
    error.status = 400;
    registrarMovimiento.mockRejectedValueOnce(error);
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase();
    await userEvent.click(botonRegistrar());
    await screen.findByRole("alert");

    // Mientras tanto dieron de baja el producto elegido desde otra pantalla.
    obtenerProductos.mockResolvedValue([PRODUCTOS[1]]);
    await userEvent.click(
      screen.getByRole("button", { name: "Actualizar datos" }),
    );

    await screen.findByRole("option", { name: "Coca-Cola 500ml" });
    expect(screen.getByLabelText("Producto")).toHaveValue("");

    registrarMovimiento.mockClear();
    await userEvent.click(botonRegistrar());

    // Sin esto el id viejo seguía en el estado, pasaba la validación —no está
    // vacío— y se enviaba un producto que ya no existe.
    expect(registrarMovimiento).not.toHaveBeenCalled();
    expect(screen.getByText(/elegí el producto/i)).toBeInTheDocument();
  });
});

describe("Accesibilidad del sentido", () => {
  test("los radios anuncian el error, no solo lo pintan", async () => {
    renderizar();
    await screen.findByLabelText("Producto");

    await completarBase({ tipo: "ajuste" });
    await userEvent.click(botonRegistrar());

    const radio = screen.getByRole("radio", { name: /entrada/i });
    expect(radio).toHaveAttribute("aria-invalid", "true");
    expect(radio).toHaveAttribute("aria-describedby", "error-sentido");
    expect(document.getElementById("error-sentido")).toHaveTextContent(
      /indicá si el ajuste/i,
    );
  });

  test("sin error, los radios no quedan marcados como invalidos", async () => {
    renderizar();
    await screen.findByLabelText("Producto");

    await userEvent.selectOptions(
      screen.getByLabelText("Tipo de movimiento"),
      "ajuste",
    );

    const radio = screen.getByRole("radio", { name: /entrada/i });
    expect(radio).toHaveAttribute("aria-invalid", "false");
    expect(radio).not.toHaveAttribute("aria-describedby");
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
