import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Configuracion from "./Configuracion";

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

vi.mock("../services/comercio", () => ({
  obtenerPerfil: vi.fn(),
  guardarPerfil: vi.fn(),
}));

const { obtenerConfiguracion } = await import("../services/configuracion");
const { obtenerPerfil } = await import("../services/comercio");

function renderizar(rutaInicial = "/configuracion") {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <Configuracion />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerConfiguracion.mockResolvedValue({
    nombre: "Mi comercio",
    moneda: "ARS",
    ubicaciones: [{ id: "u1", nombre: "Depósito" }],
  });
  obtenerPerfil.mockResolvedValue({
    nombre: "Mi comercio",
    rubro: null,
    direccion: null,
    telefono: null,
    correoContacto: null,
  });
});

describe("Armazón de la pantalla", () => {
  test("muestra las cuatro secciones del prototipo", async () => {
    renderizar();

    const pestanas = await screen.findAllByRole("tab");

    expect(pestanas.map((p) => p.textContent)).toEqual([
      "Perfil del comercio",
      "Ubicaciones y moneda",
      "Usuarios y roles",
      "Auditoría",
    ]);
  });

  test("abre en Perfil del comercio", async () => {
    renderizar();

    expect(
      await screen.findByLabelText(/nombre del negocio/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Perfil del comercio" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("muestra las ubicaciones al cambiar a esa pestaña", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      await screen.findByRole("tab", { name: "Ubicaciones y moneda" }),
    );

    expect(screen.getByText("Depósito")).toBeInTheDocument();
  });

  test("respeta la sección que venga en la URL", async () => {
    renderizar("/configuracion?seccion=auditoria");

    expect(
      await screen.findByRole("tab", { name: "Auditoría" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("las secciones sin construir dicen qué HU las va a traer", async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(
      await screen.findByRole("tab", { name: "Usuarios y roles" }),
    );

    expect(screen.getByText(/se construye en HU-4/i)).toBeInTheDocument();
  });

  test("cambiar de pestaña cambia el contenido", async () => {
    const usuario = userEvent.setup();
    renderizar();

    expect(
      await screen.findByLabelText(/nombre del negocio/i),
    ).toBeInTheDocument();

    await usuario.click(
      screen.getByRole("tab", { name: "Ubicaciones y moneda" }),
    );

    expect(
      screen.queryByLabelText(/nombre del negocio/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Depósito")).toBeInTheDocument();
  });
});

describe("Carga de datos", () => {
  test("pide el perfil y la configuración una sola vez cada uno", async () => {
    renderizar();

    await screen.findByLabelText(/nombre del negocio/i);

    expect(obtenerConfiguracion).toHaveBeenCalledTimes(1);
    expect(obtenerPerfil).toHaveBeenCalledTimes(1);
  });

  test("si falla el perfil también se muestra el error", async () => {
    // Las dos cargas van en paralelo: cualquiera que falle tiene que verse.
    obtenerPerfil.mockRejectedValue(new Error("El comercio no existe"));

    renderizar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /el comercio no existe/i,
    );
  });

  test("muestra el error si el backend falla", async () => {
    obtenerConfiguracion.mockRejectedValue(new Error("No hay sesión activa"));

    renderizar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no hay sesión activa/i,
    );
  });
});
