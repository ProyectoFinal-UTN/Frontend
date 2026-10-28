import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import UmbralReposicion from "./UmbralReposicion";
import { actualizarUmbral, obtenerUmbral } from "../services/productos";

vi.mock("../services/productos");

// `AvisoDeError` relee los permisos ante un 403; sin este mock saldría una
// request de verdad desde jsdom.
vi.mock("../services/permisos", async (original) => ({
  ...(await original()),
  refrescarPermisos: vi.fn(),
}));

function renderizar({ puedeEditar = true } = {}) {
  // MemoryRouter porque `AvisoDeError` puede dibujar un <Link> (ante un 401).
  return render(
    <MemoryRouter>
      <UmbralReposicion productoId="p1" puedeEditar={puedeEditar} />
    </MemoryRouter>,
  );
}

function errorDelBackend(status, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function guardarConValor(usuario, valor) {
  const campo = screen.getByLabelText("Umbral mínimo");
  await usuario.clear(campo);
  if (valor) await usuario.type(campo, valor);
  await usuario.click(screen.getByRole("button", { name: "Guardar umbral" }));
}

describe("UmbralReposicion (HU-16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerUmbral.mockResolvedValue({ productoId: "p1", umbralMinimo: 10 });
  });

  test("muestra 'Cargando umbral…' mientras espera la respuesta", () => {
    obtenerUmbral.mockReturnValue(new Promise(() => {}));

    renderizar();

    expect(screen.getByText("Cargando umbral…")).toBeInTheDocument();
  });

  test("muestra el umbral actual del producto", async () => {
    renderizar();

    expect(await screen.findByTestId("umbral-actual")).toHaveTextContent(
      "cuando el stock total llega a 10 o menos",
    );
    expect(obtenerUmbral).toHaveBeenCalledWith("p1");
    expect(screen.getByLabelText("Umbral mínimo")).toHaveValue(10);
  });

  test("un umbral en 0 se muestra como 'sin umbral', no como mínimo 0", async () => {
    obtenerUmbral.mockResolvedValue({ productoId: "p1", umbralMinimo: 0 });

    renderizar();

    expect(await screen.findByTestId("umbral-actual")).toHaveTextContent(
      "Sin umbral configurado.",
    );
  });

  test("guardar un valor válido llama al service con un número y muestra el nuevo", async () => {
    const usuario = userEvent.setup();
    actualizarUmbral.mockResolvedValueOnce({
      productoId: "p1",
      umbralMinimo: 25,
    });

    renderizar();
    await screen.findByTestId("umbral-actual");

    await guardarConValor(usuario, "25");

    // 25 y no "25": `toHaveBeenCalledWith` los distingue, y el backend
    // responde 400 a un string.
    await waitFor(() => {
      expect(actualizarUmbral).toHaveBeenCalledWith("p1", 25);
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Umbral actualizado.",
    );
    expect(screen.getByTestId("umbral-actual")).toHaveTextContent(
      "llega a 25 o menos",
    );
  });

  test("guardar 0 quita el umbral", async () => {
    const usuario = userEvent.setup();
    actualizarUmbral.mockResolvedValueOnce({ productoId: "p1", umbralMinimo: 0 });

    renderizar();
    await screen.findByTestId("umbral-actual");

    await guardarConValor(usuario, "0");

    expect(await screen.findByTestId("umbral-actual")).toHaveTextContent(
      "Sin umbral configurado.",
    );
    expect(actualizarUmbral).toHaveBeenCalledWith("p1", 0);
  });

  test.each([
    ["-1", "Tiene que ser un número entero, sin decimales ni signos."],
    ["2.5", "Tiene que ser un número entero, sin decimales ni signos."],
    // Un <input type="number"> no acepta letras: "abc" queda vacío, igual que
    // en el navegador. La regla del texto se prueba en Productos.validacion.
    ["abc", "Ingresá un número."],
    ["", "Ingresá un número."],
  ])("rechaza %j sin llamar al service", async (valor, mensaje) => {
    const usuario = userEvent.setup();

    renderizar();
    await screen.findByTestId("umbral-actual");

    await guardarConValor(usuario, valor);

    expect(await screen.findByText(mensaje)).toBeInTheDocument();
    expect(screen.getByLabelText("Umbral mínimo")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(actualizarUmbral).not.toHaveBeenCalled();
  });

  test("un 400 del backend muestra su mensaje en el campo", async () => {
    const usuario = userEvent.setup();
    actualizarUmbral.mockRejectedValueOnce(
      errorDelBackend(400, "El umbral mínimo no puede superar 2147483647"),
    );

    renderizar();
    await screen.findByTestId("umbral-actual");

    await guardarConValor(usuario, "30");

    expect(
      await screen.findByText("El umbral mínimo no puede superar 2147483647"),
    ).toBeInTheDocument();
    // El valor de antes sigue siendo el que vale.
    expect(screen.getByTestId("umbral-actual")).toHaveTextContent(
      "llega a 10 o menos",
    );
  });

  test("un 404 al guardar avisa que el producto no existe", async () => {
    const usuario = userEvent.setup();
    actualizarUmbral.mockRejectedValueOnce(
      errorDelBackend(404, "Producto no encontrado"),
    );

    renderizar();
    await screen.findByTestId("umbral-actual");

    await guardarConValor(usuario, "30");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ese producto ya no existe.",
    );
  });

  test("un 404 al cargar avisa que el producto no existe", async () => {
    obtenerUmbral.mockRejectedValueOnce(
      errorDelBackend(404, "Producto no encontrado"),
    );

    renderizar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ese producto ya no existe.",
    );
    expect(screen.queryByLabelText("Umbral mínimo")).not.toBeInTheDocument();
  });

  test("un 403 al guardar se muestra como falta de permiso, sin desloguear", async () => {
    // Al rol le sacaron `producto:update` con la pantalla abierta.
    const usuario = userEvent.setup();
    actualizarUmbral.mockRejectedValueOnce(
      errorDelBackend(403, "El rol no tiene permiso para esta accion"),
    );

    renderizar();
    await screen.findByTestId("umbral-actual");

    await guardarConValor(usuario, "30");

    expect(await screen.findByTestId("aviso-permiso")).toHaveTextContent(
      "El rol no tiene permiso para esta accion",
    );
  });

  test("sin permiso de edición ve el valor pero no el formulario", async () => {
    renderizar({ puedeEditar: false });

    expect(await screen.findByTestId("umbral-actual")).toHaveTextContent(
      "llega a 10 o menos",
    );
    expect(
      screen.queryByRole("form", { name: "Configurar umbral de reposición" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Guardar umbral" }),
    ).not.toBeInTheDocument();
  });
});
