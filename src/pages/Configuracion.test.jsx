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
const { obtenerPerfil, guardarPerfil } = await import("../services/comercio");

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
  test("muestra las cuatro secciones del prototipo, más Mis datos", async () => {
    renderizar();

    const pestanas = await screen.findAllByRole("tab");

    expect(pestanas.map((p) => p.textContent)).toEqual([
      "Perfil del comercio",
      "Ubicaciones y moneda",
      "Usuarios y roles",
      "Auditoría",
      // Esta no estaba en el prototipo. Va última porque no es del comercio
      // sino de la persona (HU-31).
      "Mis datos",
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

  test("ya no queda ninguna sección sin construir", async () => {
    const usuario = userEvent.setup();
    renderizar();

    // Con HU-5 se completó la última. Si alguien agrega una pestaña nueva sin
    // contenido, este test lo detecta.
    for (const etiqueta of [
      "Perfil del comercio",
      "Ubicaciones y moneda",
      "Usuarios y roles",
      "Auditoría",
      "Mis datos",
    ]) {
      await usuario.click(await screen.findByRole("tab", { name: etiqueta }));
      expect(screen.queryByText(/se construye en/i)).not.toBeInTheDocument();
    }
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

  test("Mis datos se abre aunque falle la carga del comercio", async () => {
    // Sería absurdo que un error leyendo el negocio le impidiera a alguien
    // ejercer un derecho que la ley le da sobre sus propios datos (HU-31).
    obtenerConfiguracion.mockRejectedValue(new Error("El comercio no existe"));
    obtenerPerfil.mockRejectedValue(new Error("El comercio no existe"));

    renderizar("/configuracion?seccion=mis-datos");

    expect(
      await screen.findByRole("button", { name: /descargar mis datos/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Aviso de guardado del perfil (regresión)", () => {
  test("cambiar el nombre del negocio muestra la confirmación", async () => {
    // Lo detectó el E2E de HU-6 y no se podía ver en SeccionPerfil.test.jsx:
    // ahí el componente se renderiza suelto, sin el padre. El bug estaba
    // justamente en el padre — un `key={perfil.nombre}` remontaba el formulario
    // en medio del `await` de la recarga, y el `setGuardado(true)` posterior
    // caía sobre un componente que React ya había reemplazado. El dato se
    // guardaba, pero no aparecía ninguna confirmación.
    //
    // Por eso el test vive acá: hace falta la pantalla entera, y hace falta que
    // la recarga devuelva un nombre distinto, que es lo que cambiaba el `key`.
    guardarPerfil.mockResolvedValue({});
    // Sin el rol, `puedeEditar` queda en false y los campos salen `readOnly`:
    // el formulario no se puede ni completar.
    obtenerConfiguracion.mockResolvedValue({
      nombre: "Mi comercio",
      moneda: "ARS",
      rol: "propietario",
      ubicaciones: [{ id: "u1", nombre: "Depósito" }],
    });
    obtenerPerfil
      .mockResolvedValueOnce({
        nombre: "Mi comercio",
        rubro: null,
        direccion: null,
        telefono: null,
        correoContacto: null,
      })
      .mockResolvedValue({
        nombre: "Kiosco Don Pepe",
        rubro: "Kiosco",
        direccion: null,
        telefono: null,
        correoContacto: null,
      });

    const usuario = userEvent.setup();
    renderizar();

    const nombre = await screen.findByLabelText(/nombre del negocio/i);
    await usuario.clear(nombre);
    await usuario.type(nombre, "Kiosco Don Pepe");
    await usuario.type(screen.getByLabelText(/^rubro$/i), "Kiosco");
    await usuario.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /datos guardados/i,
    );
  });
});
