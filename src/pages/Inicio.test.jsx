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

vi.mock("../services/asistente", async (original) => ({
  ...(await original()),
  obtenerRecomendaciones: vi.fn(),
}));

vi.mock("../services/alertas", async (original) => ({
  ...(await original()),
  obtenerAlertas: vi.fn(),
}));

const { useAuth } = await import("../hooks/useAuth");
const { obtenerConfiguracion } = await import("../services/configuracion");
const { obtenerProductos } = await import("../services/productos");
const { obtenerHistorial } = await import("../services/movimientos");
const { obtenerRecomendaciones } = await import("../services/asistente");
const { obtenerAlertas } = await import("../services/alertas");

/** Una alerta de reposición, para los tests que necesitan una fila. */
function alerta() {
  return {
    id: "a1",
    generadaEn: "2026-10-29T13:05:00.000Z",
    producto: {
      id: "p1",
      nombre: "Yerba 1 kg",
      codigoBarras: "7790000000000",
      categoria: "Almacén",
      unidadMedida: "unidad",
    },
    stockActual: 3,
    umbralMinimo: 10,
    faltanteHastaElUmbral: 7,
    stockAlGenerar: 3,
    umbralAlGenerar: 10,
    ubicaciones: [{ id: "u1", nombre: "Depósito", cantidad: 3 }],
    proveedorSugerido: {
      id: "v1",
      nombre: "Distribuidora Sur",
      telefono: "11 5555-0000",
      correo: "ventas@distrisur.com",
    },
    proveedores: [
      {
        id: "v1",
        nombre: "Distribuidora Sur",
        telefono: "11 5555-0000",
        correo: "ventas@distrisur.com",
      },
    ],
  };
}

function alertas(lista = []) {
  return {
    alertas: lista,
    paginacion: {
      pagina: 1,
      limite: 6,
      total: lista.length,
      totalPaginas: lista.length ? 1 : 0,
    },
  };
}

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
  obtenerRecomendaciones.mockResolvedValue({
    generadoEn: "2026-10-07T19:51:02.100Z",
    ventana: { dias: 30, desde: "2026-09-07T19:51:02.100Z" },
    modo: "sin_novedades",
    resumen: "Por ahora no tengo sugerencias para hacerte.",
    recomendaciones: [],
  });
  obtenerAlertas.mockResolvedValue(alertas());
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

describe("Recomendaciones (HU-27)", () => {
  test("con permiso, la sección está y se pide al entrar", async () => {
    renderizar();

    expect(await screen.findByTestId("recomendaciones")).toBeInTheDocument();
    expect(obtenerRecomendaciones).toHaveBeenCalledTimes(1);
  });

  test("va ANTES del banner del asistente", async () => {
    // El banner dice «preguntale qué reponer hoy»: arriba de la sección que ya
    // lo contesta se lee como un formulario para preguntar algo respondido más
    // abajo.
    renderizar();

    const seccion = await screen.findByTestId("recomendaciones");
    const banner = screen.getByRole("button", { name: /Preguntale al asistente/ });

    expect(
      seccion.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("sin el permiso `recomendaciones` no aparece NI se pide", async () => {
    // El empleado tiene `asistente: ["consultar"]` y no `recomendaciones`: ve
    // el asistente, no las sugerencias de gestión. Que no se pida importa tanto
    // como que no se muestre: si se pidiera, cada carga de Inicio de un
    // empleado sería un 403 garantizado.
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    renderizar();

    await screen.findByRole("button", { name: /Preguntale al asistente/ });
    expect(screen.queryByTestId("recomendaciones")).not.toBeInTheDocument();
    expect(obtenerRecomendaciones).not.toHaveBeenCalled();
  });

  test("mientras los permisos no están resueltos no se pide nada", async () => {
    obtenerConfiguracion.mockReturnValue(new Promise(() => {}));

    renderizar();

    await waitFor(() => expect(obtenerProductos).toHaveBeenCalled());
    expect(screen.queryByTestId("recomendaciones")).not.toBeInTheDocument();
    expect(obtenerRecomendaciones).not.toHaveBeenCalled();
    // Lo mismo para el panel de alertas: con los permisos en vuelo no se monta
    // ni se pide, así que no aparece y desaparece un instante después.
    expect(screen.queryByTestId("alertas")).not.toBeInTheDocument();
    expect(obtenerAlertas).not.toHaveBeenCalled();
  });

  test("si no se pudieron averiguar los permisos, se ofrece igual", async () => {
    // `puedeSalvoQueFalle`: esconderla le sacaría las sugerencias a quien sí
    // puede verlas. Mostrarla de más termina en un 403 del backend, que es la
    // autoridad y además lo explica.
    obtenerConfiguracion.mockRejectedValue(new Error("sin red"));

    renderizar();

    expect(await screen.findByTestId("recomendaciones")).toBeInTheDocument();
  });
});

describe("Alertas de reposición (HU-17)", () => {
  test("con `alerta.read`, el panel está y se pide al entrar", async () => {
    renderizar();

    expect(await screen.findByTestId("alertas")).toBeInTheDocument();
    expect(obtenerAlertas).toHaveBeenCalledTimes(1);
  });

  test("sin el permiso `alerta.read` no aparece NI se pide", async () => {
    // Hoy los tres roles lo tienen, así que este caso no ocurre en producción.
    // El test está igual porque el gate no es «todos pueden» sino «lo dice
    // /api/configuracion»: si mañana el backend le saca el permiso a un rol,
    // el panel tiene que desaparecer solo y sin pedir un 403 en cada carga.
    const base = configuracionDe("empleado");
    const permisos = Object.fromEntries(
      Object.entries(base.permisos).filter(([recurso]) => recurso !== "alerta"),
    );
    obtenerConfiguracion.mockResolvedValue({ ...base, permisos });

    renderizar();

    await screen.findByRole("button", { name: /Preguntale al asistente/ });
    expect(screen.queryByTestId("alertas")).not.toBeInTheDocument();
    expect(obtenerAlertas).not.toHaveBeenCalled();
  });

  test("el empleado, que solo tiene `alerta.read`, igual lo ve", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    renderizar();

    expect(await screen.findByTestId("alertas")).toBeInTheDocument();
  });

  test("si no se pudieron averiguar los permisos, se muestra igual", async () => {
    // `puedeSalvoQueFalle`: esconderlo le saca al comerciante lo más accionable
    // del dashboard por un problema de red. Mostrarlo de más termina —en el
    // peor caso— en un 403 que el aviso explica.
    obtenerConfiguracion.mockRejectedValue(new Error("sin red"));

    renderizar();

    expect(await screen.findByTestId("alertas")).toBeInTheDocument();
  });

  test("va DESPUÉS del resumen y ANTES de las sugerencias de HU-27", async () => {
    // Las alertas son el dato duro del backend; las sugerencias las arma el
    // asistente y pueden venir degradadas. El dato va arriba de la sugerencia.
    renderizar();

    const panelDeAlertas = await screen.findByTestId("alertas");
    const resumen = screen.getByText("Tu resumen");
    const sugerencias = await screen.findByTestId("recomendaciones");

    expect(
      resumen.compareDocumentPosition(panelDeAlertas) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      panelDeAlertas.compareDocumentPosition(sugerencias) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("no desplaza ninguna de las tarjetas del resumen", async () => {
    renderizar();

    await screen.findByTestId("alertas");
    await waitFor(() =>
      expect(tarjeta("Productos en el catálogo")).toHaveTextContent("3"),
    );
    expect(tarjeta("Movimientos de hoy")).toHaveTextContent("12");
    expect(tarjeta("Ubicaciones de stock")).toHaveTextContent("2");
  });
});

describe("Contrato con la navegación", () => {
  /** Los nombres accesibles de los accesos de `components/Navegacion.jsx`. */
  const NOMBRES_DE_LA_NAVEGACION = [
    "Inicio",
    "Productos",
    "Configuración",
    "Registrar movimiento",
    "Historial de movimientos",
    "Transferir stock",
    "Escanear producto",
  ];

  test("ningún link de Inicio choca por nombre con uno de la navegación", async () => {
    // La regla no es «Inicio no tiene links» sino que ninguno colisione: un
    // «Ver productos» contendría «Productos» y la búsqueda del link
    // «Productos» que hacen los E2E encontraría dos. Las sugerencias de HU-27
    // traen links «Ver stock de <producto>», que no colisionan con ninguno.
    obtenerRecomendaciones.mockResolvedValue({
      generadoEn: "2026-10-07T19:51:02.100Z",
      ventana: { dias: 30, desde: "2026-09-07T19:51:02.100Z" },
      modo: "ia",
      resumen: "Encontré 1 producto para reponer.",
      recomendaciones: [
        {
          tipo: "reponer",
          prioridad: "alta",
          producto: { id: "p-1", nombre: "Yerba Playadito" },
          texto: "No te queda nada de Yerba Playadito.",
          porQue: "No quedan existencias y el mínimo configurado es 1.",
          datos: { enStock: 0, umbralMinimo: 1, unidadMedida: "unidad", faltanteHastaElUmbral: 1 },
        },
      ],
    });

    // Con una alerta puesta, para que los links del panel de HU-17 —el del
    // detalle y los de contacto del proveedor— entren en el chequeo. Sin esto
    // el test pasaría sin haber mirado ninguno de los tres.
    obtenerAlertas.mockResolvedValue(alertas([alerta()]));

    renderizar();
    await screen.findByTestId("recomendacion-reponer");
    await screen.findByTestId("alerta-fila");

    const nombres = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("aria-label") ?? link.textContent);

    // Aserción completa y en orden, no un match parcial: lo que se verifica es
    // justamente que no se haya colado ningún link de más en el dashboard.
    //
    // «Ver el detalle de» y no «Ver stock de» a propósito: HU-27 ya usa ese
    // segundo texto para el MISMO producto, y dos links con el mismo nombre
    // accesible en la misma pantalla romperían cualquier búsqueda por nombre.
    expect(nombres).toEqual([
      "11 5555-0000",
      "ventas@distrisur.com",
      "Ver el detalle de Yerba 1 kg",
      "Ver stock de Yerba Playadito",
    ]);

    // Por SUBSTRING y no por igualdad: así matchea Playwright cuando no se le
    // pasa `exact`, que es como buscan los page objects de Infraestructura. Un
    // link «Ver productos» no es igual a «Productos» pero lo contiene, y la
    // búsqueda del link «Productos» encontraría dos. Comparar por igualdad
    // dejaba pasar justo ese caso.
    for (const nombre of nombres) {
      for (const deLaNavegacion of NOMBRES_DE_LA_NAVEGACION) {
        expect(nombre.toLowerCase()).not.toContain(deLaNavegacion.toLowerCase());
      }
    }
  });
});
