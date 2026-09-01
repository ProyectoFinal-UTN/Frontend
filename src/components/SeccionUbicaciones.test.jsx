import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SeccionUbicaciones from "./SeccionUbicaciones";

// El service es la única puerta a la API, así que es lo único que se mockea.
vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  crearUbicacion: vi.fn(),
  renombrarUbicacion: vi.fn(),
  eliminarUbicacion: vi.fn(),
  cambiarMoneda: vi.fn(),
}));

const {
  crearUbicacion,
  renombrarUbicacion,
  eliminarUbicacion,
  cambiarMoneda,
} = await import("../services/configuracion");

const alRecargar = vi.fn();

function renderizar(configuracion = {}) {
  return render(
    <SeccionUbicaciones
      configuracion={{
        moneda: "ARS",
        ubicaciones: [
          { id: "u1", nombre: "Depósito" },
          { id: "u2", nombre: "Local" },
        ],
        ...configuracion,
      }}
      alRecargar={alRecargar}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Listado", () => {
  test("muestra las ubicaciones del comercio", () => {
    renderizar();

    expect(screen.getByText("Depósito")).toBeInTheDocument();
    expect(screen.getByText("Local")).toBeInTheDocument();
  });

  test("avisa cuando todavía no hay ninguna", () => {
    renderizar({ ubicaciones: [] });

    expect(screen.getByText(/todavía no cargaste/i)).toBeInTheDocument();
  });
});

describe("Alta", () => {
  test("crea la ubicación y recarga la configuración", async () => {
    crearUbicacion.mockResolvedValue({ id: "u3", nombre: "Vidriera" });

    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(
      screen.getByLabelText(/nombre de la ubicación/i),
      "Vidriera",
    );
    await usuario.click(screen.getByRole("button", { name: "Agregar" }));

    expect(crearUbicacion).toHaveBeenCalledWith("Vidriera");
    expect(alRecargar).toHaveBeenCalled();
  });

  test("recorta los espacios del nombre", async () => {
    crearUbicacion.mockResolvedValue({});

    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(
      screen.getByLabelText(/nombre de la ubicación/i),
      "   Altillo   ",
    );
    await usuario.click(screen.getByRole("button", { name: "Agregar" }));

    expect(crearUbicacion).toHaveBeenCalledWith("Altillo");
  });

  test("no llama al backend con un nombre vacío", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/escribí un nombre/i);
    expect(crearUbicacion).not.toHaveBeenCalled();
  });

  test("muestra el mensaje del backend si el nombre ya existe", async () => {
    crearUbicacion.mockRejectedValue(
      new Error('Ya existe una ubicación llamada "Local"'),
    );

    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(screen.getByLabelText(/nombre de la ubicación/i), "Local");
    await usuario.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/ya existe/i);
  });
});

describe("Renombrar", () => {
  test("guarda el nombre nuevo", async () => {
    renombrarUbicacion.mockResolvedValue({});

    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Renombrar Depósito" }),
    );

    const campo = screen.getByLabelText(/nuevo nombre de depósito/i);
    await usuario.clear(campo);
    await usuario.type(campo, "Depósito grande");
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));

    expect(renombrarUbicacion).toHaveBeenCalledWith("u1", "Depósito grande");
  });
});

describe("Eliminar", () => {
  test("pide confirmación antes de borrar", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Eliminar Depósito" }),
    );

    expect(screen.getByText(/¿eliminar «depósito»\?/i)).toBeInTheDocument();
    expect(eliminarUbicacion).not.toHaveBeenCalled();
  });

  test("borra solo cuando se confirma", async () => {
    eliminarUbicacion.mockResolvedValue(null);

    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Eliminar Depósito" }),
    );
    await usuario.click(screen.getByRole("button", { name: /sí, eliminar/i }));

    expect(eliminarUbicacion).toHaveBeenCalledWith("u1");
    expect(alRecargar).toHaveBeenCalled();
  });

  test("cancelar no borra nada", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      screen.getByRole("button", { name: "Eliminar Depósito" }),
    );
    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(eliminarUbicacion).not.toHaveBeenCalled();
    expect(screen.getByText("Depósito")).toBeInTheDocument();
  });
});

describe("Moneda", () => {
  test("muestra la moneda actual del comercio", () => {
    renderizar({ moneda: "USD" });

    expect(screen.getByLabelText(/moneda del negocio/i)).toHaveValue("USD");
  });

  test("guarda el cambio de moneda", async () => {
    cambiarMoneda.mockResolvedValue({ moneda: "USD" });

    const usuario = userEvent.setup();
    renderizar();

    await usuario.selectOptions(
      screen.getByLabelText(/moneda del negocio/i),
      "USD",
    );

    expect(cambiarMoneda).toHaveBeenCalledWith("USD");
    expect(alRecargar).toHaveBeenCalled();
  });
});
