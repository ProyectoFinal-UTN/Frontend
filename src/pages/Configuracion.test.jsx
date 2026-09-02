import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Configuracion from "./Configuracion";

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

const { obtenerConfiguracion } = await import("../services/configuracion");

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

  test("abre en Ubicaciones y moneda, que es la única construida", async () => {
    renderizar();

    expect(await screen.findByText("Depósito")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Ubicaciones y moneda" }),
    ).toHaveAttribute("aria-selected", "true");
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

    expect(await screen.findByText("Depósito")).toBeInTheDocument();

    await usuario.click(screen.getByRole("tab", { name: "Perfil del comercio" }));

    expect(screen.queryByText("Depósito")).not.toBeInTheDocument();
    expect(screen.getByText(/se construye en HU-6/i)).toBeInTheDocument();
  });
});

describe("Carga de datos", () => {
  test("pide la configuración una sola vez", async () => {
    renderizar();

    await screen.findByText("Depósito");
    expect(obtenerConfiguracion).toHaveBeenCalledTimes(1);
  });

  test("muestra el error si el backend falla", async () => {
    obtenerConfiguracion.mockRejectedValue(new Error("No hay sesión activa"));

    renderizar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no hay sesión activa/i,
    );
  });
});
