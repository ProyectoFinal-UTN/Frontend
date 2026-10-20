import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Proveedores from "./Proveedores";
import { configuracionDe } from "../tests/permisos";

vi.mock("../services/proveedores", async (original) => ({
  ...(await original()),
  obtenerProveedores: vi.fn(),
}));

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

const { obtenerProveedores } = await import("../services/proveedores");
const { obtenerConfiguracion } = await import("../services/configuracion");

const PROVEEDORES = [
  {
    id: "v1",
    nombre: "Distribuidora Sur",
    contacto: null,
    telefono: null,
    correo: null,
    rubro: "Bebidas",
    condicionesPago: null,
  },
];

function renderizar() {
  return render(
    <MemoryRouter initialEntries={["/proveedores"]}>
      <Proveedores />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerProveedores.mockResolvedValue(PROVEEDORES);
  obtenerConfiguracion.mockResolvedValue(configuracionDe("propietario"));
});

describe("Carga de la pantalla", () => {
  test("avisa mientras trae los proveedores", () => {
    obtenerProveedores.mockReturnValue(new Promise(() => {}));
    renderizar();

    expect(screen.getByText(/cargando proveedores/i)).toBeInTheDocument();
  });

  test("muestra los proveedores cuando llegan", async () => {
    renderizar();

    expect(await screen.findByText("Distribuidora Sur")).toBeInTheDocument();
    expect(screen.queryByText(/cargando proveedores/i)).not.toBeInTheDocument();
  });

  test("si la carga falla, muestra el error y deja reintentar", async () => {
    const usuario = userEvent.setup();
    obtenerProveedores.mockRejectedValueOnce(new Error("No hay conexión"));
    renderizar();

    expect(await screen.findByRole("alert")).toHaveTextContent("No hay conexión");

    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Distribuidora Sur")).toBeInTheDocument();
    expect(obtenerProveedores).toHaveBeenCalledTimes(2);
  });
});

describe("Según el rol (HU-32)", () => {
  test("el propietario puede cargar proveedores", async () => {
    renderizar();

    expect(
      await screen.findByRole("button", { name: /nuevo proveedor/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("proveedores-solo-lectura")).not.toBeInTheDocument();
  });

  test("el empleado consulta, pero no modifica", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));
    renderizar();

    expect(await screen.findByTestId("proveedores-solo-lectura")).toBeInTheDocument();
    expect(screen.getByText("Distribuidora Sur")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nuevo proveedor/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Editar Distribuidora Sur" }),
    ).not.toBeInTheDocument();
  });

  test("si no se pudo saber qué puede, ofrece las acciones y el backend decide", async () => {
    obtenerConfiguracion.mockRejectedValue(new Error("sin red"));
    renderizar();

    expect(
      await screen.findByRole("button", { name: /nuevo proveedor/i }),
    ).toBeInTheDocument();
  });
});
