import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Navegacion from "./Navegacion";
import { configuracionDe } from "../tests/permisos";

/**
 * Navegación principal (sidebar en escritorio, barra abajo en celular).
 *
 * Los tests de "Accesos según el rol" y "Cuando no se sabe qué puede" vivían en
 * `pages/Inicio.test.jsx` y se mudaron con los accesos: son las mismas reglas
 * de HU-32, sobre el mismo `data-testid` que usa el E2E.
 */

vi.mock("../services/auth", () => ({ cerrarSesion: vi.fn() }));

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

const { cerrarSesion } = await import("../services/auth");
const { obtenerConfiguracion } = await import("../services/configuracion");

/** Los seis accesos que dependen del rol, por el testid que usa también el E2E. */
const ACCESOS = [
  "acceso-registrar-movimiento",
  "acceso-historial",
  "acceso-productos",
  "acceso-transferir",
  "acceso-escanear",
  "acceso-configuracion",
];

function renderizar(ruta = "/") {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="*" element={<Navegacion />} />
        <Route path="/login" element={<p>Pantalla de login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Los accesos que están hoy en pantalla, en orden. */
function visibles() {
  return ACCESOS.filter((id) => screen.queryByTestId(id) !== null);
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerConfiguracion.mockResolvedValue(configuracionDe("propietario"));
});

describe("Accesos según el rol", () => {
  test("el propietario ve los seis", async () => {
    renderizar();

    await waitFor(() => expect(visibles()).toEqual(ACCESOS));
  });

  test("el gerente ve los seis: opera el negocio completo", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("gerente"));

    renderizar();

    await waitFor(() => expect(visibles()).toEqual(ACCESOS));
  });

  // El único acceso que se pierde hoy: el escaneo consulta
  // `GET /api/productos/codigo/:codigo`, que exige `producto:create`.
  // Dejárselo al empleado era mandarlo derecho a un 403.
  test("el empleado no ve «Escanear producto», y sí todo lo demás", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    renderizar();

    await waitFor(() =>
      expect(visibles()).toEqual([
        "acceso-registrar-movimiento",
        "acceso-historial",
        "acceso-productos",
        "acceso-transferir",
        "acceso-configuracion",
      ]),
    );

    expect(
      screen.queryByRole("link", { name: "Escanear producto" }),
    ).not.toBeInTheDocument();
  });

  // Configuración no cuelga de ningún permiso: «Mis datos» (HU-31) es un
  // derecho de los tres roles.
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
  // Dejar la navegación con dos links porque se cayó una request convierte un
  // problema de red en una app que parece rota.
  test("si la consulta falla se muestran todos", async () => {
    obtenerConfiguracion.mockRejectedValue(new Error("sin red"));

    renderizar();

    await waitFor(() => expect(visibles()).toEqual(ACCESOS));
  });

  test("mientras carga no se muestra ninguno de los que dependen del rol", () => {
    obtenerConfiguracion.mockReturnValue(new Promise(() => {}));

    renderizar();

    // Inicio, Configuración y «Cerrar sesión» no dependen del rol y están
    // desde el primer render; el resto aparece cuando se sabe.
    expect(visibles()).toEqual(["acceso-configuracion"]);
    expect(screen.getByRole("link", { name: "Inicio" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    ).toBeInTheDocument();
    // El mismo texto de carga que usa `soporte/accesos.js` en el E2E.
    expect(screen.getByText("Cargando accesos…")).toBeInTheDocument();
  });
});

describe("El nombre accesible es el contrato", () => {
  test("los accesos se llaman igual que cuando vivían en Inicio", async () => {
    // Los E2E entran por estos nombres. En celular el texto visible es más
    // corto, pero el nombre accesible no cambia.
    renderizar();

    for (const nombre of [
      "Registrar movimiento",
      "Historial de movimientos",
      "Productos",
      "Transferir stock",
      "Escanear producto",
      "Configuración",
    ]) {
      expect(
        await screen.findByRole("link", { name: nombre }),
      ).toBeInTheDocument();
    }
  });

  test("no usa listas ni títulos, que se sumarían a los de cada pantalla", async () => {
    renderizar();
    await screen.findByTestId("acceso-productos");

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
  });
});

describe("Dónde estás", () => {
  test("marca la pantalla actual con aria-current", async () => {
    renderizar("/movimientos");

    expect(await screen.findByTestId("acceso-historial")).toHaveAttribute(
      "aria-current",
      "page",
    );
    // «Registrar movimiento» vive en /movimientos/nuevo: no se marca.
    expect(screen.getByTestId("acceso-registrar-movimiento")).not.toHaveAttribute(
      "aria-current",
    );
  });

  test("el detalle de un producto marca Productos", async () => {
    renderizar("/productos/abc-123");

    expect(await screen.findByTestId("acceso-productos")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("escanear marca solo Escanear, no también Productos", async () => {
    renderizar("/productos/escanear");

    expect(await screen.findByTestId("acceso-escanear")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId("acceso-productos")).not.toHaveAttribute(
      "aria-current",
    );
  });
});

describe("Acciones", () => {
  test("«Más» abre y cierra los accesos secundarios (en celular)", async () => {
    const usuario = userEvent.setup();
    renderizar();

    const mas = await screen.findByRole("button", { name: "Más" });
    expect(mas).toHaveAttribute("aria-expanded", "false");

    await usuario.click(mas);
    expect(mas).toHaveAttribute("aria-expanded", "true");

    await usuario.click(mas);
    expect(mas).toHaveAttribute("aria-expanded", "false");
  });

  test("cerrar sesión lleva al login", async () => {
    const usuario = userEvent.setup();
    cerrarSesion.mockResolvedValue();
    renderizar();

    await usuario.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(cerrarSesion).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Pantalla de login")).toBeInTheDocument();
  });
});
