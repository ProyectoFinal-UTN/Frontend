import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Inicio from "./Inicio";
import { configuracionDe } from "../tests/permisos";

vi.mock("../hooks/useAuth", () => ({ useAuth: vi.fn() }));

vi.mock("../services/auth", () => ({ cerrarSesion: vi.fn() }));

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

const { useAuth } = await import("../hooks/useAuth");
const { obtenerConfiguracion } = await import("../services/configuracion");

/** Los seis accesos de la pantalla, por el testid que usa también el E2E. */
const ACCESOS = [
  "acceso-registrar-movimiento",
  "acceso-historial",
  "acceso-transferir",
  "acceso-productos",
  "acceso-escanear",
  "acceso-configuracion",
];

function renderizar() {
  return render(
    <MemoryRouter>
      <Inicio />
    </MemoryRouter>,
  );
}

/** Los accesos que están hoy en pantalla, en orden. */
function visibles() {
  return ACCESOS.filter((id) => screen.queryByTestId(id) !== null);
}

beforeEach(async () => {
  vi.clearAllMocks();
  const { olvidarPermisos } = await import("../services/permisos");
  olvidarPermisos();
  useAuth.mockReturnValue({ usuario: { name: "Ana" } });
});

describe("Accesos según el rol", () => {
  test("el propietario ve los seis", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("propietario"));

    renderizar();

    await waitFor(() => expect(visibles()).toEqual(ACCESOS));
  });

  test("el gerente ve los seis: opera el negocio completo", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("gerente"));

    renderizar();

    await waitFor(() => expect(visibles()).toEqual(ACCESOS));
  });

  // El único acceso que se pierde hoy, y el motivo de este punto de la HU: el
  // escaneo consulta `GET /api/productos/codigo/:codigo`, que exige
  // `producto:create`. Dejárselo al empleado era mandarlo derecho a un 403.
  test("el empleado no ve «Escanear producto», y sí todo lo demás", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    renderizar();

    await waitFor(() =>
      expect(visibles()).toEqual([
        "acceso-registrar-movimiento",
        "acceso-historial",
        "acceso-transferir",
        "acceso-productos",
        "acceso-configuracion",
      ]),
    );

    expect(screen.queryByTestId("acceso-escanear")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Escanear producto" }),
    ).not.toBeInTheDocument();
  });

  // Configuración no cuelga de ningún permiso: aunque el empleado no vea
  // Usuarios ni Auditoría, «Mis datos» (HU-31) es un derecho de los tres.
  test("Configuración le queda a todos", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    renderizar();

    expect(await screen.findByTestId("acceso-configuracion")).toHaveAttribute(
      "href",
      "/configuracion",
    );
  });
});

describe("Cuando no se sabe qué puede", () => {
  // Dejar la pantalla de inicio con dos botones porque se cayó una request
  // convierte un problema de red en una app que parece rota.
  test("si la consulta falla se muestran todos", async () => {
    obtenerConfiguracion.mockRejectedValue(new Error("sin red"));

    renderizar();

    await waitFor(() => expect(visibles()).toEqual(ACCESOS));
  });

  test("mientras carga no se muestra ninguno de los que dependen del rol", () => {
    obtenerConfiguracion.mockReturnValue(new Promise(() => {}));

    renderizar();

    // Configuración y «Cerrar sesión» no dependen del rol y están desde el
    // primer render; el resto aparece cuando se sabe.
    expect(visibles()).toEqual(["acceso-configuracion"]);
    expect(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    ).toBeInTheDocument();
  });
});
