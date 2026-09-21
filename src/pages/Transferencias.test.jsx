import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Transferencias from "./Transferencias";

vi.mock("../services/productos", async (original) => ({
  ...(await original()),
  obtenerProductos: vi.fn(),
  obtenerProducto: vi.fn(),
}));

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerUbicaciones: vi.fn(),
}));

vi.mock("../services/transferencias", () => ({
  transferirStock: vi.fn(),
}));

const { obtenerProductos, obtenerProducto } = await import("../services/productos");
const { obtenerUbicaciones } = await import("../services/configuracion");
const { transferirStock } = await import("../services/transferencias");

const YERBA = { id: "p1", nombre: "Yerba Playadito 1kg", unidadMedida: "unidad" };

const DEPOSITO = { id: "u1", nombre: "Depósito" };
const LOCAL = { id: "u2", nombre: "Local" };
const DOS_UBICACIONES = [DEPOSITO, LOCAL];

/** La respuesta de `GET /productos/:id` con el saldo de cada ubicación. */
function conStock({ deposito = 12, local = 3, producto = YERBA } = {}) {
  return {
    ...producto,
    stock: {
      porUbicacion: [
        { ubicacionId: "u1", ubicacionNombre: "Depósito", cantidad: deposito },
        { ubicacionId: "u2", ubicacionNombre: "Local", cantidad: local },
      ],
      total: deposito + local,
    },
  };
}

/** Una promesa que el test resuelve cuando quiere. */
function diferido() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fallo(status, mensaje) {
  return Object.assign(new Error(mensaje), { status });
}

function renderizar(entrada = "/transferencias") {
  return render(
    <MemoryRouter initialEntries={[entrada]}>
      <Transferencias />
    </MemoryRouter>,
  );
}

const campo = {
  producto: () => screen.getByLabelText("Producto"),
  origen: () => screen.getByLabelText("Origen"),
  destino: () => screen.getByLabelText("Destino"),
  cantidad: () => screen.getByLabelText("Cantidad"),
  motivo: () => screen.getByLabelText("Motivo (opcional)"),
};

function formulario() {
  return screen.getByRole("form", { name: "Transferir stock" });
}

function botonTransferir() {
  return screen.getByRole("button", { name: /^(Transferir|Transfiriendo…)$/ });
}

function disponible() {
  return screen.getByTestId("transferencia-disponible");
}

/** Producto, origen y destino elegidos, con el disponible ya consultado. */
async function elegirBase() {
  await screen.findByRole("form", { name: "Transferir stock" });
  await userEvent.selectOptions(campo.producto(), "p1");
  await userEvent.selectOptions(campo.origen(), "u1");
  await waitFor(() =>
    expect(disponible()).toHaveTextContent("Disponible en Depósito:"),
  );
  await userEvent.selectOptions(campo.destino(), "u2");
}

async function completar({ cantidad = "5", motivo = "" } = {}) {
  await elegirBase();
  await userEvent.type(campo.cantidad(), cantidad);
  if (motivo) await userEvent.type(campo.motivo(), motivo);
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerProductos.mockResolvedValue([YERBA]);
  obtenerUbicaciones.mockResolvedValue(DOS_UBICACIONES);
  obtenerProducto.mockResolvedValue(conStock());
});

describe("carga y estados vacíos", () => {
  test("muestra «Cargando datos…» mientras espera", () => {
    obtenerProductos.mockReturnValue(new Promise(() => {}));

    renderizar();

    expect(screen.getByText("Cargando datos…")).toBeInTheDocument();
  });

  test.each([
    ["una sola ubicación", [DEPOSITO]],
    ["ninguna ubicación", []],
  ])("con %s muestra el estado vacío con el acceso a Configuración y no el formulario", async (_, ubicaciones) => {
    obtenerUbicaciones.mockResolvedValue(ubicaciones);

    renderizar();

    const vacio = await screen.findByTestId("transferencia-sin-ubicaciones");
    expect(vacio).toHaveTextContent(
      "Para transferir necesitás al menos dos ubicaciones (por ejemplo Depósito y Local).",
    );
    expect(within(vacio).getByRole("link", { name: "Ir a Configuración →" })).toHaveAttribute(
      "href",
      "/configuracion?seccion=ubicaciones",
    );
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  test("sin productos manda a Productos", async () => {
    obtenerProductos.mockResolvedValue([]);

    renderizar();

    expect(await screen.findByText("Todavía no hay productos cargados.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Productos →" })).toHaveAttribute("href", "/productos");
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  test("si falla la carga ofrece reintentar", async () => {
    obtenerProductos.mockRejectedValueOnce(new Error("No pudimos conectar"));

    renderizar();

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("form", { name: "Transferir stock" })).toBeInTheDocument();
    expect(obtenerProductos).toHaveBeenCalledTimes(2);
  });
});

describe("formulario", () => {
  test("el destino no ofrece la ubicación de origen", async () => {
    renderizar();
    await screen.findByRole("form", { name: "Transferir stock" });

    await userEvent.selectOptions(campo.origen(), "u1");

    const opciones = within(campo.destino())
      .getAllByRole("option")
      .map((opcion) => opcion.value);
    expect(opciones).toEqual(["", "u2"]);
  });

  test("si el origen pasa a ser el destino elegido, el destino se vacía", async () => {
    renderizar();
    await elegirBase();

    await userEvent.selectOptions(campo.origen(), "u2");

    expect(campo.destino()).toHaveValue("");
  });

  test("muestra el disponible en origen apenas hay producto y origen, y el saldo en cada opción", async () => {
    renderizar();
    await screen.findByRole("form", { name: "Transferir stock" });

    await userEvent.selectOptions(campo.producto(), "p1");
    expect(screen.queryByTestId("transferencia-disponible")).not.toBeInTheDocument();

    await userEvent.selectOptions(campo.origen(), "u1");

    await waitFor(() =>
      expect(disponible()).toHaveTextContent("Disponible en Depósito: 12 unidades"),
    );
    expect(obtenerProducto).toHaveBeenCalledTimes(1);
    expect(obtenerProducto).toHaveBeenCalledWith("p1");
    expect(within(campo.origen()).getByRole("option", { name: "Depósito (12 unidades)" })).toBeInTheDocument();
    expect(within(campo.destino()).getByRole("option", { name: "Local (3 unidades)" })).toBeInTheDocument();
    expect(campo.cantidad()).toHaveAttribute("max", "12");
  });

  test("mientras consulta el stock muestra «Consultando stock…» y no deja enviar", async () => {
    obtenerProducto.mockReturnValue(new Promise(() => {}));
    renderizar();
    await screen.findByRole("form", { name: "Transferir stock" });

    await userEvent.selectOptions(campo.producto(), "p1");
    await userEvent.selectOptions(campo.origen(), "u1");

    expect(disponible()).toHaveTextContent("Consultando stock…");
    expect(botonTransferir()).toBeDisabled();
  });

  test("si falla la consulta del stock lo dice y deja reintentarla", async () => {
    obtenerProducto
      .mockRejectedValueOnce(new Error("El producto no existe"))
      .mockResolvedValueOnce(conStock());
    renderizar();
    await screen.findByRole("form", { name: "Transferir stock" });

    await userEvent.selectOptions(campo.producto(), "p1");
    await userEvent.selectOptions(campo.origen(), "u1");

    expect(await within(disponible()).findByText("El producto no existe")).toBeInTheDocument();
    await userEvent.click(within(disponible()).getByRole("button", { name: "Reintentar" }));

    await waitFor(() =>
      expect(disponible()).toHaveTextContent("Disponible en Depósito: 12 unidades"),
    );
    expect(obtenerProducto).toHaveBeenCalledTimes(2);
  });

  test("sin stock en el origen lo avisa y deshabilita la cantidad y el envío", async () => {
    obtenerProducto.mockResolvedValue(conStock({ deposito: 0 }));
    renderizar();
    await screen.findByRole("form", { name: "Transferir stock" });

    await userEvent.selectOptions(campo.producto(), "p1");
    await userEvent.selectOptions(campo.origen(), "u1");

    await waitFor(() =>
      expect(disponible()).toHaveTextContent(
        "No hay stock de Yerba Playadito 1kg en Depósito. Elegí otro origen.",
      ),
    );
    expect(campo.cantidad()).toBeDisabled();
    expect(botonTransferir()).toBeDisabled();
  });

  test("una respuesta vieja del stock no pisa la del producto elegido después", async () => {
    const FERNET = { id: "p2", nombre: "Fernet 750ml", unidadMedida: "unidad" };
    obtenerProductos.mockResolvedValue([YERBA, FERNET]);
    const lenta = diferido();
    obtenerProducto.mockImplementation((id) =>
      id === "p1" ? lenta.promise : Promise.resolve(conStock({ deposito: 4, producto: FERNET })),
    );
    renderizar();
    await screen.findByRole("form", { name: "Transferir stock" });

    await userEvent.selectOptions(campo.origen(), "u1");
    await userEvent.selectOptions(campo.producto(), "p1");
    await userEvent.selectOptions(campo.producto(), "p2");
    await waitFor(() =>
      expect(disponible()).toHaveTextContent("Disponible en Depósito: 4 unidades"),
    );

    await act(async () => lenta.resolve(conStock({ deposito: 12 })));

    expect(disponible()).toHaveTextContent("Disponible en Depósito: 4 unidades");
  });

  test("con ?productoId= llega con el producto elegido", async () => {
    renderizar("/transferencias?productoId=p1");

    await screen.findByRole("form", { name: "Transferir stock" });

    expect(campo.producto()).toHaveValue("p1");
    await waitFor(() => expect(obtenerProducto).toHaveBeenCalledWith("p1"));
  });

  test("con un ?productoId= que no está en el catálogo el producto queda sin elegir", async () => {
    renderizar("/transferencias?productoId=no-existe");

    await screen.findByRole("form", { name: "Transferir stock" });

    expect(campo.producto()).toHaveValue("");
    expect(obtenerProducto).not.toHaveBeenCalled();
  });

  test("en productos por kg explica que la cantidad va entera", async () => {
    obtenerProductos.mockResolvedValue([{ ...YERBA, unidadMedida: "kg" }]);
    renderizar();
    await screen.findByRole("form", { name: "Transferir stock" });

    await userEvent.selectOptions(campo.producto(), "p1");

    expect(
      screen.getByText(
        "Las transferencias se cargan en números enteros (por ejemplo 3 kg). Todavía no se admiten fracciones.",
      ),
    ).toBeInTheDocument();
    expect(campo.cantidad()).toHaveAttribute("step", "1");
  });

  test("en productos por unidad no muestra la aclaración", async () => {
    renderizar();
    await screen.findByRole("form", { name: "Transferir stock" });

    await userEvent.selectOptions(campo.producto(), "p1");

    expect(screen.queryByText(/números enteros/)).not.toBeInTheDocument();
  });

  test("el motivo tiene tope de 255 y un contador visible", async () => {
    renderizar();
    await screen.findByRole("form", { name: "Transferir stock" });

    await userEvent.type(campo.motivo(), "abc");

    expect(campo.motivo()).toHaveAttribute("maxLength", "255");
    expect(screen.getByText("3/255")).toBeInTheDocument();
  });
});

describe("bloqueo por stock en el cliente", () => {
  test("una cantidad mayor al disponible no se envía y dice cuánto hay", async () => {
    renderizar();
    await completar({ cantidad: "13" });

    await userEvent.click(botonTransferir());

    expect(
      screen.getByText("Hay 12 unidades disponibles en Depósito. No podés transferir más."),
    ).toBeInTheDocument();
    expect(transferirStock).not.toHaveBeenCalled();
  });

  test("con el formulario vacío marca los campos y no envía", async () => {
    renderizar();
    await screen.findByRole("form", { name: "Transferir stock" });

    await userEvent.click(botonTransferir());

    expect(screen.getByText("Elegí el producto.")).toBeInTheDocument();
    expect(screen.getByText("Elegí de dónde sale.")).toBeInTheDocument();
    expect(screen.getByText("Elegí a dónde va.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá cuántas unidades.")).toBeInTheDocument();
    expect(transferirStock).not.toHaveBeenCalled();
  });
});

describe("envío", () => {
  test("manda el cuerpo exacto, con la cantidad como número y sin motivo si está vacío", async () => {
    transferirStock.mockReturnValue(new Promise(() => {}));
    renderizar();
    await completar({ cantidad: "5" });

    await userEvent.click(botonTransferir());

    expect(transferirStock).toHaveBeenCalledTimes(1);
    expect(transferirStock.mock.calls[0][0]).toEqual({
      productoId: "p1",
      ubicacionOrigenId: "u1",
      ubicacionDestinoId: "u2",
      cantidad: 5,
    });
  });

  test("el motivo viaja recortado", async () => {
    transferirStock.mockReturnValue(new Promise(() => {}));
    renderizar();
    await completar({ cantidad: "5", motivo: "  Reposición de góndola  " });

    await userEvent.click(botonTransferir());

    expect(transferirStock.mock.calls[0][0]).toEqual({
      productoId: "p1",
      ubicacionOrigenId: "u1",
      ubicacionDestinoId: "u2",
      cantidad: 5,
      motivo: "Reposición de góndola",
    });
  });

  test("mientras está en vuelo deshabilita el botón, muestra «Transfiriendo…» y bloquea los campos", async () => {
    transferirStock.mockReturnValue(new Promise(() => {}));
    renderizar();
    await completar();

    await userEvent.click(botonTransferir());

    expect(botonTransferir()).toBeDisabled();
    expect(botonTransferir()).toHaveTextContent("Transfiriendo…");
    expect(formulario()).toHaveAttribute("aria-busy", "true");
    expect(campo.cantidad()).toBeDisabled();
  });

  test("dos submits seguidos con la primera request en vuelo mandan una sola transferencia", async () => {
    transferirStock.mockReturnValue(diferido().promise);
    renderizar();
    await completar();

    // `fireEvent.submit` dispara el evento aunque el botón ya esté
    // deshabilitado: es lo que prueba que el candado es la ref y no el estado
    // visual. Mismo camino que un Enter en un campo.
    fireEvent.submit(formulario());
    fireEvent.submit(formulario());
    fireEvent.submit(formulario());

    expect(transferirStock).toHaveBeenCalledTimes(1);
  });

  // Este lo frena el botón deshabilitado, no la ref (sacando el candado sigue
  // pasando): cubre lo que ve el usuario. El de arriba es el que prueba la ref.
  test("un doble click manda una sola transferencia", async () => {
    transferirStock.mockReturnValue(diferido().promise);
    renderizar();
    await completar();

    await userEvent.dblClick(botonTransferir());

    expect(transferirStock).toHaveBeenCalledTimes(1);
  });

  test("después de una respuesta, el candado se libera para la transferencia siguiente", async () => {
    transferirStock.mockResolvedValue({
      stock: {
        origen: { id: "s1", ubicacionId: "u1", cantidad: 7 },
        destino: { id: "s2", ubicacionId: "u2", cantidad: 8 },
      },
    });
    renderizar();
    await completar();
    await userEvent.click(botonTransferir());
    await screen.findByTestId("transferencia-confirmacion");

    await userEvent.type(campo.cantidad(), "2");
    await userEvent.click(botonTransferir());

    await waitFor(() => expect(transferirStock).toHaveBeenCalledTimes(2));
  });
});

describe("después del 201", () => {
  const RESPUESTA = {
    transferencia: { id: "t1" },
    movimientos: [
      { tipo: "transferencia", cantidad: -5, ubicacionId: "u1", transferenciaId: "t1" },
      { tipo: "transferencia", cantidad: 5, ubicacionId: "u2", transferenciaId: "t1" },
    ],
    stock: {
      origen: { id: "s1", ubicacionId: "u1", cantidad: 7 },
      destino: { id: "s2", ubicacionId: "u2", cantidad: 8 },
    },
  };

  test("confirma con el resumen y los saldos de la respuesta, sin otro GET", async () => {
    transferirStock.mockResolvedValueOnce(RESPUESTA);
    renderizar();
    await completar({ cantidad: "5" });

    await userEvent.click(botonTransferir());

    expect(await screen.findByTestId("transferencia-confirmacion")).toHaveTextContent(
      "Listo. Transferiste 5 unidades de Yerba Playadito 1kg de Depósito a Local. " +
        "Ahora hay 7 unidades en Depósito y 8 unidades en Local.",
    );
    expect(screen.getByRole("status")).toBe(screen.getByTestId("transferencia-confirmacion"));
    expect(obtenerProducto).toHaveBeenCalledTimes(1);
    // El disponible quedó al día con la respuesta.
    expect(disponible()).toHaveTextContent("Disponible en Depósito: 7 unidades");
    expect(within(campo.destino()).getByRole("option", { name: "Local (8 unidades)" })).toBeInTheDocument();
  });

  test("deja producto, origen y destino y limpia cantidad y motivo", async () => {
    transferirStock.mockResolvedValueOnce(RESPUESTA);
    renderizar();
    await completar({ cantidad: "5", motivo: "Reposición" });

    await userEvent.click(botonTransferir());
    await screen.findByTestId("transferencia-confirmacion");

    expect(campo.producto()).toHaveValue("p1");
    expect(campo.origen()).toHaveValue("u1");
    expect(campo.destino()).toHaveValue("u2");
    expect(campo.cantidad()).toHaveValue(null);
    expect(campo.motivo()).toHaveValue("");
  });

  test("la confirmación se va al empezar la siguiente", async () => {
    transferirStock.mockResolvedValueOnce(RESPUESTA);
    renderizar();
    await completar();
    await userEvent.click(botonTransferir());
    await screen.findByTestId("transferencia-confirmacion");

    await userEvent.type(campo.cantidad(), "1");

    expect(screen.queryByTestId("transferencia-confirmacion")).not.toBeInTheDocument();
  });

  test("un 2xx sin cuerpo se confirma igual, sin saldos, y vuelve a pedir el stock", async () => {
    transferirStock.mockResolvedValueOnce(null);
    obtenerProducto
      .mockResolvedValueOnce(conStock())
      .mockResolvedValueOnce(conStock({ deposito: 7, local: 8 }));
    renderizar();
    await completar({ cantidad: "5" });

    await userEvent.click(botonTransferir());

    const confirmacion = await screen.findByTestId("transferencia-confirmacion");
    expect(confirmacion).toHaveTextContent(
      /^Listo\. Transferiste 5 unidades de Yerba Playadito 1kg de Depósito a Local\.$/,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(disponible()).toHaveTextContent("Disponible en Depósito: 7 unidades"),
    );
    expect(obtenerProducto).toHaveBeenCalledTimes(2);
  });
});

describe("errores del backend", () => {
  const MENSAJE_409 =
    "Stock insuficiente: hay 2 unidades disponibles y se intentan descontar 5";

  test("un 409 muestra el mensaje tal cual, refresca el disponible y enfoca la cantidad", async () => {
    transferirStock.mockRejectedValueOnce(fallo(409, MENSAJE_409));
    obtenerProducto
      .mockResolvedValueOnce(conStock())
      .mockResolvedValueOnce(conStock({ deposito: 2 }));
    renderizar();
    await completar({ cantidad: "5" });

    await userEvent.click(botonTransferir());

    const aviso = await screen.findByTestId("transferencia-aviso-stock");
    expect(aviso).toHaveTextContent(`${MENSAJE_409}Revisá la cantidad.`);
    await waitFor(() =>
      expect(disponible()).toHaveTextContent("Disponible en Depósito: 2 unidades"),
    );
    expect(obtenerProducto).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(campo.cantidad()).toHaveFocus());
    // El resto del formulario queda como estaba.
    expect(campo.cantidad()).toHaveValue(5);
    expect(campo.destino()).toHaveValue("u2");
    expect(screen.queryByTestId("transferencia-confirmacion")).not.toBeInTheDocument();
  });

  test("un error de red no dice que no se hizo: pide revisar y vuelve a pedir el stock", async () => {
    transferirStock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderizar();
    await completar();

    await userEvent.click(botonTransferir());

    const error = await screen.findByTestId("transferencia-error");
    expect(error).toHaveTextContent(
      "No pudimos confirmar si la transferencia se hizo. Revisá el stock antes de volver a intentar.",
    );
    expect(within(error).getByRole("link", { name: "Ver transferencias de este producto →" })).toHaveAttribute(
      "href",
      "/movimientos?tipo=transferencia&productoId=p1",
    );
    await waitFor(() => expect(obtenerProducto).toHaveBeenCalledTimes(2));
  });

  test("un 401 muestra el mensaje y el acceso al login", async () => {
    transferirStock.mockRejectedValueOnce(fallo(401, "No hay sesion activa"));
    renderizar();
    await completar();

    await userEvent.click(botonTransferir());

    const error = await screen.findByTestId("transferencia-error");
    expect(error).toHaveTextContent("No hay sesion activa");
    expect(within(error).getByRole("link", { name: "Volver a iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  test("un 403 muestra el mensaje tal cual, sin ofrecer reintentar", async () => {
    transferirStock.mockRejectedValueOnce(fallo(403, "El rol no tiene permiso para esta accion"));
    renderizar();
    await completar();

    await userEvent.click(botonTransferir());

    const error = await screen.findByTestId("transferencia-error");
    expect(error).toHaveTextContent("El rol no tiene permiso para esta accion");
    expect(within(error).queryByRole("button")).not.toBeInTheDocument();
  });

  test("un 404 muestra el mensaje y «Actualizar datos» recarga las listas sin perder el formulario", async () => {
    transferirStock.mockRejectedValueOnce(fallo(404, "La ubicación no existe"));
    renderizar();
    await completar();

    await userEvent.click(botonTransferir());

    const error = await screen.findByTestId("transferencia-error");
    expect(error).toHaveTextContent("La ubicación no existe");
    await userEvent.click(within(error).getByRole("button", { name: "Actualizar datos" }));

    await waitFor(() => expect(screen.queryByTestId("transferencia-error")).not.toBeInTheDocument());
    expect(obtenerProductos).toHaveBeenCalledTimes(2);
    expect(obtenerUbicaciones).toHaveBeenCalledTimes(2);
    expect(campo.producto()).toHaveValue("p1");
    expect(campo.cantidad()).toHaveValue(5);
  });

  test("después de un error se puede volver a enviar", async () => {
    transferirStock
      .mockRejectedValueOnce(fallo(403, "El rol no tiene permiso para esta accion"))
      .mockReturnValueOnce(new Promise(() => {}));
    renderizar();
    await completar();

    await userEvent.click(botonTransferir());
    await screen.findByTestId("transferencia-error");
    await userEvent.click(botonTransferir());

    expect(transferirStock).toHaveBeenCalledTimes(2);
  });
});
