import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RutaProtegida from "./RutaProtegida";
import { configuracionDe } from "../tests/permisos";

vi.mock("../hooks/useAuth", () => ({ useAuth: vi.fn() }));

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

const { useAuth } = await import("../hooks/useAuth");
const { obtenerConfiguracion } = await import("../services/configuracion");

/**
 * Monta la ruta protegida junto con el login y el inicio, para poder afirmar
 * que NO se navegó a ninguno de los dos.
 */
function renderizar({ permiso, mensajeSinPermiso } = {}) {
  return render(
    <MemoryRouter initialEntries={["/protegida"]}>
      <Routes>
        <Route
          path="/protegida"
          element={
            <RutaProtegida
              permiso={permiso}
              mensajeSinPermiso={mensajeSinPermiso}
            >
              <p>Contenido reservado</p>
            </RutaProtegida>
          }
        />
        <Route path="/login" element={<p>Pantalla de login</p>} />
        <Route path="/" element={<p>Pantalla de inicio</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const contenido = () => screen.queryByText("Contenido reservado");
const login = () => screen.queryByText("Pantalla de login");

beforeEach(async () => {
  vi.clearAllMocks();
  const { olvidarPermisos } = await import("../services/permisos");
  olvidarPermisos();
  useAuth.mockReturnValue({ autenticado: true, cargando: false });
  obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));
});

describe("Sin permiso pedido", () => {
  test("deja pasar a quien tiene sesión", async () => {
    renderizar();

    expect(await screen.findByText("Contenido reservado")).toBeInTheDocument();
  });

  test("manda al login a quien no la tiene", async () => {
    useAuth.mockReturnValue({ autenticado: false, cargando: false });

    renderizar();

    expect(await screen.findByText("Pantalla de login")).toBeInTheDocument();
    expect(contenido()).not.toBeInTheDocument();
  });

  test("mientras la sesión se resuelve no manda a ningún lado", () => {
    useAuth.mockReturnValue({ autenticado: false, cargando: true });

    renderizar();

    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(login()).not.toBeInTheDocument();
  });
});

describe("Con permiso pedido", () => {
  test("deja pasar a quien lo tiene", async () => {
    renderizar({ permiso: { movimiento: ["create"] } });

    expect(await screen.findByText("Contenido reservado")).toBeInTheDocument();
    expect(screen.queryByTestId("sin-permiso")).not.toBeInTheDocument();
  });

  // El caso de la HU: escribir /productos/importar en la barra de direcciones
  // siendo empleado.
  test("a quien no lo tiene le explica, en vez de dejar que la pantalla se rompa", async () => {
    renderizar({ permiso: { producto: ["create"] } });

    const cartel = await screen.findByTestId("sin-permiso");

    expect(cartel).toHaveTextContent(/no tenés permiso para entrar acá/i);
    expect(contenido()).not.toBeInTheDocument();
  });

  // Que no desloguee es la mitad del punto: un 403 no es una sesión vencida.
  test("no lo desloguea ni lo manda al inicio: le muestra la salida", async () => {
    renderizar({ permiso: { producto: ["create"] } });

    await screen.findByTestId("sin-permiso");

    expect(login()).not.toBeInTheDocument();
    expect(screen.queryByText("Pantalla de inicio")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Volver al inicio →" }),
    ).toHaveAttribute("href", "/");
  });

  test("cada ruta puede explicar mejor que el mensaje genérico", async () => {
    renderizar({
      permiso: { producto: ["create"] },
      mensajeSinPermiso: "Tu rol no puede importar productos.",
    });

    expect(await screen.findByTestId("sin-permiso")).toHaveTextContent(
      "Tu rol no puede importar productos.",
    );
  });

  // Sin esto, TODA navegación directa a una ruta con permiso mostraría el
  // cartel un instante, incluso para el propietario.
  test("mientras los permisos no llegaron no acusa a nadie", () => {
    obtenerConfiguracion.mockReturnValue(new Promise(() => {}));

    renderizar({ permiso: { producto: ["create"] } });

    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(screen.queryByTestId("sin-permiso")).not.toBeInTheDocument();
    expect(contenido()).not.toBeInTheDocument();
  });

  // Decirle "no tenés permiso" a alguien porque se cayó una request es
  // mentirle. Si de verdad no le toca, el backend responde 403 y la pantalla
  // lo muestra.
  test("si no se pudo averiguar, deja pasar y que decida el backend", async () => {
    obtenerConfiguracion.mockRejectedValue(new Error("sin red"));

    renderizar({ permiso: { producto: ["create"] } });

    expect(await screen.findByText("Contenido reservado")).toBeInTheDocument();
    expect(screen.queryByTestId("sin-permiso")).not.toBeInTheDocument();
  });

  test("la falta de sesión gana sobre la falta de permiso", async () => {
    useAuth.mockReturnValue({ autenticado: false, cargando: false });

    renderizar({ permiso: { producto: ["create"] } });

    expect(await screen.findByText("Pantalla de login")).toBeInTheDocument();
    expect(screen.queryByTestId("sin-permiso")).not.toBeInTheDocument();
  });

  test("alcanza con tener una de las acciones pedidas", async () => {
    renderizar({ permiso: { producto: ["create", "read"] } });

    expect(await screen.findByText("Contenido reservado")).toBeInTheDocument();
  });
});

describe("Las rutas reales de la app", () => {
  // Los cuatro permisos que App.jsx le pasa hoy, contra el rol que más
  // restricciones tiene. Si alguno cambiara de recurso, esto lo avisa.
  test.each([
    ["transferencia", ["create"], true],
    ["movimiento", ["create"], true],
    ["producto", ["create"], false],
  ])("como empleado, %s:%s deja pasar: %s", async (recurso, acciones, pasa) => {
    renderizar({ permiso: { [recurso]: acciones } });

    if (pasa) {
      expect(await screen.findByText("Contenido reservado")).toBeInTheDocument();
    } else {
      expect(await screen.findByTestId("sin-permiso")).toBeInTheDocument();
    }
  });
});
