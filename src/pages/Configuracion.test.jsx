import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Configuracion from "./Configuracion";
import { configuracionDe } from "../tests/permisos";

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

vi.mock("../services/comercio", () => ({
  obtenerPerfil: vi.fn(),
  guardarPerfil: vi.fn(),
}));

// Las dos secciones que dependen de un permiso traen sus propios datos. Se
// mockean para poder abrirlas en los tests de control de acceso sin red.
vi.mock("../services/miembros", async (original) => ({
  ...(await original()),
  obtenerEquipo: vi.fn(),
}));

vi.mock("../services/auditoria", async (original) => ({
  ...(await original()),
  obtenerAuditoria: vi.fn(),
}));

const { obtenerConfiguracion } = await import("../services/configuracion");
const { obtenerPerfil, guardarPerfil } = await import("../services/comercio");
const { obtenerEquipo } = await import("../services/miembros");
const { obtenerAuditoria } = await import("../services/auditoria");

function renderizar(rutaInicial = "/configuracion") {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <Configuracion />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Por defecto, propietario: es quien ve las cinco pestañas, así que los
  // tests de armazón siguen valiendo tal cual. Los de control de acceso
  // (HU-32) pisan este mock con el rol que les interesa.
  obtenerConfiguracion.mockResolvedValue(
    configuracionDe("propietario", {
      nombre: "Mi comercio",
      ubicaciones: [{ id: "u1", nombre: "Depósito" }],
    }),
  );
  obtenerPerfil.mockResolvedValue({
    nombre: "Mi comercio",
    rubro: null,
    direccion: null,
    telefono: null,
    correoContacto: null,
  });
  obtenerEquipo.mockResolvedValue({
    miembros: [
      { id: "m1", userId: "u9", nombre: "Ana", correo: "ana@kiosco.com", rol: "empleado" },
    ],
    invitaciones: [],
    roles: [],
  });
  obtenerAuditoria.mockResolvedValue({
    eventos: [],
    filtros: { acciones: [], recursos: [] },
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
    // Sin `comercio:update`, `puedeEditar` queda en false y los campos salen
    // `readOnly`: el formulario no se puede ni completar.
    obtenerConfiguracion.mockResolvedValue(
      configuracionDe("propietario", {
        nombre: "Mi comercio",
        ubicaciones: [{ id: "u1", nombre: "Depósito" }],
      }),
    );
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

describe("Control de acceso por rol (HU-32)", () => {
  /**
   * Espera a que las pestañas sean las definitivas y las devuelve.
   *
   * Hace falta esperar: hasta que llegan los permisos se muestran todas —ver
   * "si no se pudo saber el rol"— así que leerlas en el primer render daría
   * siempre cinco.
   */
  async function pestanasVisibles(esperadas) {
    await waitFor(() =>
      expect(screen.getAllByRole("tab")).toHaveLength(esperadas.length),
    );
    return screen.getAllByRole("tab").map((p) => p.textContent);
  }

  test("el propietario ve las cinco secciones", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("propietario"));

    renderizar();

    const esperadas = [
      "Perfil del comercio",
      "Ubicaciones y moneda",
      "Usuarios y roles",
      "Auditoría",
      "Mis datos",
    ];
    expect(await pestanasVisibles(esperadas)).toEqual(esperadas);
  });

  // El gerente tiene `member:read` pero no `auditoria`: ve el equipo, no el
  // registro de accesos.
  test("el gerente ve Usuarios pero no Auditoría", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("gerente"));

    renderizar();

    const esperadas = [
      "Perfil del comercio",
      "Ubicaciones y moneda",
      "Usuarios y roles",
      "Mis datos",
    ];
    expect(await pestanasVisibles(esperadas)).toEqual(esperadas);
    expect(screen.queryByTestId("pestana-auditoria")).not.toBeInTheDocument();
  });

  test("el gerente abre Usuarios en modo lectura", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("gerente"));
    const usuario = userEvent.setup();

    renderizar();
    await usuario.click(await screen.findByTestId("pestana-usuarios"));

    // Ve a su compañera…
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    // …y ninguna de las cuatro acciones que no le corresponden.
    expect(screen.queryByTestId("usuario-rol-m1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("usuario-quitar-m1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("usuarios-invitar")).not.toBeInTheDocument();
    expect(screen.getByTestId("usuarios-solo-lectura")).toBeInTheDocument();
  });

  // HU-4 pide que el empleado no vea siquiera la lista del equipo, así que la
  // pestaña se oculta en vez de deshabilitarse.
  test("el empleado no ve ni Usuarios ni Auditoría", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    renderizar();

    const esperadas = [
      "Perfil del comercio",
      "Ubicaciones y moneda",
      "Mis datos",
    ];
    expect(await pestanasVisibles(esperadas)).toEqual(esperadas);
    expect(screen.queryByTestId("pestana-usuarios")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pestana-auditoria")).not.toBeInTheDocument();
  });

  // Escribir la sección en la barra de direcciones no puede ser la puerta de
  // atrás que la pestaña escondida cierra.
  test("pedir una sección sin permiso por URL cae en Perfil", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    renderizar("/configuracion?seccion=auditoria");

    expect(await screen.findByLabelText(/nombre del negocio/i)).toBeInTheDocument();
    expect(obtenerAuditoria).not.toHaveBeenCalled();
    expect(screen.getByTestId("pestana-perfil")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("el empleado tampoco llega a Usuarios por URL", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    renderizar("/configuracion?seccion=usuarios");

    expect(await screen.findByLabelText(/nombre del negocio/i)).toBeInTheDocument();
    expect(obtenerEquipo).not.toHaveBeenCalled();
  });

  // Perfil y moneda ya se deshabilitaban bien; lo que cambió es de dónde sale
  // el booleano. El comportamiento visible tiene que ser el mismo de siempre.
  test("al empleado los campos del perfil le salen de solo lectura", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    renderizar();

    expect(await screen.findByLabelText(/nombre del negocio/i)).toHaveAttribute(
      "readonly",
    );
  });

  test("al propietario no", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("propietario"));

    renderizar();

    expect(
      await screen.findByLabelText(/nombre del negocio/i),
    ).not.toHaveAttribute("readonly");
  });

  // Si averiguar los permisos falla, esconder pestañas le sacaría secciones a
  // quien sí podía usarlas. Cada sección pide sus datos igual y el backend
  // corta con un 403 si de verdad no corresponde.
  test("si no se pudo saber el rol, se muestran todas", async () => {
    obtenerConfiguracion.mockRejectedValue(new Error("sin red"));

    renderizar();

    expect(await screen.findAllByRole("tab")).toHaveLength(5);
  });
});

describe("La carrera entre el perfil y la configuración", () => {
  // Regresión: `cargando` pasó a cubrir solo el perfil cuando la configuración
  // se mudó al store de permisos. Si el perfil contestaba primero, no había ni
  // "Cargando…", ni error, ni sección: el panel quedaba completamente vacío.
  test("si el perfil llega primero se sigue avisando que falta algo", async () => {
    let entregarConfiguracion;
    obtenerConfiguracion.mockReturnValue(
      new Promise((resolver) => {
        entregarConfiguracion = resolver;
      }),
    );

    renderizar();

    // El perfil ya resolvió; la configuración no.
    await waitFor(() => expect(obtenerPerfil).toHaveBeenCalled());
    expect(screen.getByText("Cargando datos…")).toBeInTheDocument();

    entregarConfiguracion(
      configuracionDe("propietario", {
        nombre: "Mi comercio",
        ubicaciones: [{ id: "u1", nombre: "Depósito" }],
      }),
    );

    // Y cuando llega, la sección aparece.
    expect(
      await screen.findByLabelText(/nombre del negocio/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Cargando datos…")).not.toBeInTheDocument();
  });

  test("si la configuración llega primero, tampoco queda en blanco", async () => {
    let entregarPerfil;
    obtenerPerfil.mockReturnValue(
      new Promise((resolver) => {
        entregarPerfil = resolver;
      }),
    );

    renderizar();

    await waitFor(() => expect(obtenerConfiguracion).toHaveBeenCalled());
    expect(screen.getByText("Cargando datos…")).toBeInTheDocument();

    entregarPerfil({
      nombre: "Mi comercio",
      rubro: null,
      direccion: null,
      telefono: null,
      correoContacto: null,
    });

    expect(
      await screen.findByLabelText(/nombre del negocio/i),
    ).toBeInTheDocument();
  });
});
