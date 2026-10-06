import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Inicio from "./Inicio";
import { EVENTO_ABRIR_ASISTENTE } from "../services/asistente";
import { configuracionDe } from "../tests/permisos";

/**
 * Inicio: el resumen del negocio.
 *
 * Los tests de accesos por rol que vivían acá se mudaron a
 * `components/Navegacion.test.jsx`, junto con los accesos.
 */

vi.mock("../hooks/useAuth", () => ({ useAuth: vi.fn() }));

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

vi.mock("../services/productos", async (original) => ({
  ...(await original()),
  obtenerProductos: vi.fn(),
}));

vi.mock("../services/movimientos", async (original) => ({
  ...(await original()),
  obtenerHistorial: vi.fn(),
}));

const { useAuth } = await import("../hooks/useAuth");
const { obtenerConfiguracion } = await import("../services/configuracion");
const { obtenerProductos } = await import("../services/productos");
const { obtenerHistorial } = await import("../services/movimientos");

function renderizar() {
  return render(
    <MemoryRouter>
      <Inicio />
    </MemoryRouter>,
  );
}

/** La tarjeta del resumen que tiene ese título. */
function tarjeta(titulo) {
  return screen.getByText(titulo).parentElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ usuario: { name: "Ana" } });
  obtenerConfiguracion.mockResolvedValue(
    configuracionDe("propietario", {
      ubicaciones: [{ id: "u1", nombre: "Local" }, { id: "u2", nombre: "Depósito" }],
    }),
  );
  obtenerProductos.mockResolvedValue([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);
  obtenerHistorial.mockResolvedValue({ movimientos: [], paginacion: { total: 12 } });
});

describe("Saludo", () => {
  test("saluda por el nombre, con el título que buscan los E2E", () => {
    renderizar();

    expect(
      screen.getByRole("heading", { level: 1, name: "Hola, Ana" }),
    ).toBeInTheDocument();
  });
});

describe("Resumen", () => {
  test("muestra productos, movimientos de hoy y ubicaciones", async () => {
    renderizar();

    await waitFor(() =>
      expect(tarjeta("Productos en el catálogo")).toHaveTextContent("3"),
    );
    expect(tarjeta("Movimientos de hoy")).toHaveTextContent("12");
    expect(tarjeta("Ubicaciones de stock")).toHaveTextContent("2");
  });

  test("los movimientos de hoy se piden filtrados por el día de hoy", async () => {
    renderizar();

    const hoy = new Date().toLocaleDateString("en-CA");
    await waitFor(() =>
      expect(obtenerHistorial).toHaveBeenCalledWith({ desde: hoy, hasta: hoy }),
    );
  });

  test("si un dato no se pudo traer, muestra «—» y no rompe el resto", async () => {
    obtenerProductos.mockRejectedValue(new Error("sin red"));

    renderizar();

    await waitFor(() => expect(tarjeta("Movimientos de hoy")).toHaveTextContent("12"));
    expect(tarjeta("Productos en el catálogo")).toHaveTextContent("—");
  });
});

describe("Asistente", () => {
  test("el banner abre el asistente", async () => {
    const usuario = userEvent.setup();
    const escuchar = vi.fn();
    window.addEventListener(EVENTO_ABRIR_ASISTENTE, escuchar);

    renderizar();
    await usuario.click(
      await screen.findByRole("button", { name: /Preguntale al asistente/ }),
    );

    expect(escuchar).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTO_ABRIR_ASISTENTE, escuchar);
  });

  test("sin permiso de asistente no se ofrece", async () => {
    const base = configuracionDe("empleado");
    const permisos = Object.fromEntries(
      Object.entries(base.permisos).filter(([recurso]) => recurso !== "asistente"),
    );
    obtenerConfiguracion.mockResolvedValue({ ...base, permisos });

    renderizar();

    await waitFor(() => expect(obtenerConfiguracion).toHaveBeenCalled());
    await waitFor(() =>
      expect(tarjeta("Ubicaciones de stock")).not.toHaveTextContent("—"),
    );
    expect(
      screen.queryByRole("button", { name: /Preguntale al asistente/ }),
    ).not.toBeInTheDocument();
  });
});

describe("Contrato con la navegación", () => {
  test("Inicio no tiene links: los accesos están en la navegación", async () => {
    // Cualquier link acá chocaría por nombre con uno de la navegación —«Ver
    // productos» contiene «productos»— y la búsqueda del link «Productos» que
    // hacen los E2E encontraría dos.
    renderizar();
    await screen.findByRole("button", { name: /Preguntale al asistente/ });

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
