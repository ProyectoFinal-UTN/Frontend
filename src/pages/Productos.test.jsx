import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import Productos from "./Productos";
import { configuracionDe } from "../tests/permisos";

/**
 * Expone la query actual en el DOM.
 *
 * `MemoryRouter` no toca `window.location`, así que es la única forma de
 * afirmar sobre la URL desde un test.
 */
function SondaDeUrl() {
  return <span data-testid="query">{useLocation().search}</span>;
}

vi.mock("../services/productos", async (original) => ({
  ...(await original()),
  obtenerProductos: vi.fn(),
  eliminarProducto: vi.fn(),
}));

// De acá salen los permisos del rol (HU-32): qué acciones del catálogo se
// ofrecen y cuáles no. Se mockea para no salir a la red.
vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

const { obtenerProductos, eliminarProducto } = await import(
  "../services/productos"
);
const { obtenerConfiguracion } = await import("../services/configuracion");

const PRODUCTOS = [
  {
    id: "p1",
    nombre: "Coca-Cola 500ml",
    codigoBarras: "7790895000782",
    categoria: "Bebidas",
    unidadMedida: "unidad",
    umbralMinimo: 5,
  },
];

function renderizar(rutaInicial = "/productos") {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <Productos />
      <SondaDeUrl />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerProductos.mockResolvedValue(PRODUCTOS);
  obtenerConfiguracion.mockResolvedValue(configuracionDe("propietario"));
});

describe("Carga de la pantalla", () => {
  test("avisa mientras trae el catálogo", () => {
    obtenerProductos.mockReturnValue(new Promise(() => {}));
    renderizar();

    expect(screen.getByText(/cargando productos/i)).toBeInTheDocument();
  });

  test("muestra el catálogo cuando llega", async () => {
    renderizar();

    expect(await screen.findByText("Coca-Cola 500ml")).toBeInTheDocument();
    expect(obtenerProductos).toHaveBeenCalled();
  });

  test("no deja el 'Cargando…' colgado si la lista vuelve vacía", async () => {
    obtenerProductos.mockResolvedValue([]);
    renderizar();

    expect(await screen.findByText(/todavía no cargaste/i)).toBeInTheDocument();
    expect(screen.queryByText(/cargando productos/i)).not.toBeInTheDocument();
  });
});

describe("Entrada a la importación (HU-7)", () => {
  test("se ofrece a quien puede crear productos", async () => {
    renderizar();

    expect(
      await screen.findByRole("link", { name: "Importar desde CSV" }),
    ).toHaveAttribute("href", "/productos/importar");
  });

  test("no se le ofrece al empleado, que terminaría en un 403", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));
    renderizar();

    await screen.findByText("Coca-Cola 500ml");
    expect(
      screen.queryByRole("link", { name: "Importar desde CSV" }),
    ).not.toBeInTheDocument();
  });

  test("si no se puede saber el rol, el catálogo se muestra igual", async () => {
    // El link se ofrece de más y el backend corta si no corresponde. Romper el
    // catálogo por una request secundaria sería mucho peor.
    obtenerConfiguracion.mockRejectedValue(new Error("sin red"));
    renderizar();

    expect(await screen.findByText("Coca-Cola 500ml")).toBeInTheDocument();
  });
});

describe("Cuando el backend no responde", () => {
  test("muestra el mensaje del backend en vez de la lista", async () => {
    obtenerProductos.mockRejectedValue(new Error("No hay sesion activa"));
    renderizar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no hay sesion activa/i,
    );
  });

  test("ofrece reintentar, para no dejar la pantalla sin salida", async () => {
    obtenerProductos.mockRejectedValueOnce(new Error("Se cayó el servidor"));
    renderizar();

    await userEvent.click(
      await screen.findByRole("button", { name: "Reintentar" }),
    );

    // El segundo intento usa el mock por defecto, que sí resuelve.
    expect(await screen.findByText("Coca-Cola 500ml")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Llegar desde el escáner", () => {
  test("abre el alta con el código puesto si viene en ?nuevo=", async () => {
    renderizar("/productos?nuevo=7791234567890");

    expect(await screen.findByLabelText(/código de barras/i)).toHaveValue(
      "7791234567890",
    );
  });

  test("sin ese parámetro el formulario arranca cerrado", async () => {
    renderizar();

    expect(await screen.findByText("Coca-Cola 500ml")).toBeInTheDocument();
    expect(screen.queryByLabelText(/código de barras/i)).not.toBeInTheDocument();
  });

  test("precarga nombre/categoria si vienen junto con ?nuevo= (sugerencia de Open Food Facts)", async () => {
    renderizar(
      "/productos?nuevo=7790580146115&nombre=pur%C3%A9%20arcor&categoria=Tomate",
    );

    expect(await screen.findByLabelText(/código de barras/i)).toHaveValue(
      "7790580146115",
    );
    expect(screen.getByLabelText(/nombre/i)).toHaveValue("puré arcor");
    expect(screen.getByLabelText(/categoría/i)).toHaveValue("Tomate");
  });

  test("nombre/categoria tambien desaparecen de la URL una vez usados", async () => {
    renderizar("/productos?nuevo=7790580146115&nombre=puré+arcor&categoria=Tomate");

    await screen.findByLabelText(/código de barras/i);

    const query = screen.getByTestId("query").textContent;
    expect(query).not.toContain("nombre=");
    expect(query).not.toContain("categoria=");
  });

  test("el código desaparece de la URL una vez usado", async () => {
    renderizar("/productos?nuevo=7791234567890&otro=1");

    expect(await screen.findByLabelText(/código de barras/i)).toHaveValue(
      "7791234567890",
    );
    // El formulario sigue abierto con el código, pero la URL ya no lo lleva.
    const query = screen.getByTestId("query").textContent;
    expect(query).not.toContain("nuevo=");
    // Y se borró solo `nuevo`, no la query entera.
    expect(query).toContain("otro=1");
  });

  test("si la carga falla antes de abrir el alta, el reintento sí la abre", async () => {
    obtenerProductos.mockRejectedValueOnce(new Error("Se cayó el servidor"));
    renderizar("/productos?nuevo=7791234567890");

    await userEvent.click(
      await screen.findByRole("button", { name: "Reintentar" }),
    );

    // El código nunca se consumió, porque la sección nunca llegó a montarse.
    // El usuario venía del escáner y todavía no creó nada: le corresponde ver
    // el alta que vino a buscar.
    expect(await screen.findByLabelText(/código de barras/i)).toHaveValue(
      "7791234567890",
    );
  });

  test("una vez usado, un remonte de la sección no reabre el alta", async () => {
    // Recorrido del bug: el alta se abre con el código, se cierra, una recarga
    // posterior falla y el «Reintentar» vuelve a montar la sección. Si el
    // código siguiera vivo, el alta reaparecería con uno que quizá ya se dio
    // de alta y guardar devolvería un 409 que el usuario no pidió.
    eliminarProducto.mockResolvedValue(null);
    obtenerProductos
      .mockResolvedValueOnce(PRODUCTOS)
      .mockRejectedValueOnce(new Error("Se cayó el servidor"))
      .mockResolvedValue(PRODUCTOS);

    const usuario = userEvent.setup();
    renderizar("/productos?nuevo=7791234567890");

    expect(await screen.findByLabelText(/código de barras/i)).toHaveValue(
      "7791234567890",
    );
    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));

    // Una operación cualquiera dispara la recarga, y esa recarga falla.
    await usuario.click(
      screen.getByRole("button", { name: "Eliminar Coca-Cola 500ml" }),
    );
    await usuario.click(screen.getByRole("button", { name: /sí, eliminar/i }));

    await usuario.click(
      await screen.findByRole("button", { name: "Reintentar" }),
    );

    expect(await screen.findByText("Coca-Cola 500ml")).toBeInTheDocument();
    expect(screen.queryByLabelText(/código de barras/i)).not.toBeInTheDocument();
  });
});

describe("Control de acceso por rol (HU-32)", () => {
  /** Los controles de escritura del catálogo, por su testid. */
  const ACCIONES = [
    "productos-importar-csv",
    "productos-escanear",
    "productos-nuevo-manual",
    "producto-editar-p1",
    "producto-eliminar-p1",
  ];

  test("el propietario las ve todas", async () => {
    renderizar();

    await screen.findByText("Coca-Cola 500ml");

    for (const id of ACCIONES) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(
      screen.queryByTestId("productos-solo-lectura"),
    ).not.toBeInTheDocument();
  });

  test("el gerente también: puede crear productos", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("gerente"));

    renderizar();
    await screen.findByText("Coca-Cola 500ml");

    for (const id of ACCIONES) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  // El empleado tiene `producto:["read"]`: la pantalla le sigue sirviendo para
  // consultar, y desaparece todo lo que terminaría en un 403.
  test("al empleado no le queda ninguna, pero sí el catálogo", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    renderizar();
    await screen.findByTestId("productos-solo-lectura");

    for (const id of ACCIONES) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }

    // Lo que sí conserva: la lista y el detalle.
    expect(screen.getByText("Coca-Cola 500ml")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver stock de Coca-Cola 500ml" }),
    ).toBeInTheDocument();
  });

  test("el aviso de solo lectura explica por qué falta todo eso", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    renderizar();

    expect(await screen.findByTestId("productos-solo-lectura")).toHaveTextContent(
      "Tu rol puede consultar el catálogo, pero no modificarlo.",
    );
  });

  // La puerta de atrás del alta: el escáner manda `?nuevo=<codigo>` y el
  // formulario se abre solo. Escrito a mano no puede saltear el permiso.
  test("«?nuevo=» no abre el alta para quien no puede crear", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    renderizar("/productos?nuevo=7790895000782");

    await screen.findByTestId("productos-solo-lectura");
    expect(
      screen.queryByLabelText(/código de barras/i),
    ).not.toBeInTheDocument();
  });
});

describe("Un 403 no cierra la sesión (HU-32)", () => {
  test("muestra el aviso y deja la pantalla donde estaba", async () => {
    const fallo = new Error("El rol no tiene permiso para esta accion");
    fallo.status = 403;
    fallo.tipo = "permiso";
    eliminarProducto.mockRejectedValue(fallo);

    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(await screen.findByTestId("producto-eliminar-p1"));
    await usuario.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    // El mensaje del backend, tal cual.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El rol no tiene permiso para esta accion",
    );

    // Y lo que importa: sigue parada en Productos. Si la UI desloguease por un
    // 403, el login funcionaría, la acción volvería a fallar y la persona
    // quedaría en un loop del que no puede salir.
    expect(
      screen.getByRole("heading", { name: "Productos" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("query")).toHaveTextContent("");
  });

  // El caso completo de la HU: al gerente lo bajan a empleado con la pantalla
  // abierta. Intenta borrar, ve el aviso, y los botones que ya no le
  // corresponden desaparecen solos, sin que recargue nada.
  test("relee los permisos y la UI se pone al día sola", async () => {
    const fallo = new Error("El rol no tiene permiso para esta accion");
    fallo.status = 403;
    fallo.tipo = "permiso";
    eliminarProducto.mockRejectedValue(fallo);

    const usuario = userEvent.setup();
    renderizar();

    await screen.findByText("Coca-Cola 500ml");
    expect(obtenerConfiguracion).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("producto-editar-p1")).toBeInTheDocument();

    // Mientras tanto, el propietario le cambió el rol.
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    await usuario.click(screen.getByTestId("producto-eliminar-p1"));
    await usuario.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    // El aviso dispara el refresco: son dos llamadas, no una.
    await waitFor(() =>
      expect(obtenerConfiguracion).toHaveBeenCalledTimes(2),
    );

    await waitFor(() =>
      expect(screen.getByTestId("productos-solo-lectura")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("producto-editar-p1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("productos-importar-csv")).not.toBeInTheDocument();
  });
});

// Regresión de HU-32 sobre el flujo del escáner (HU-10 → HU-9).
//
// `SeccionProductos` decide en su PRIMER render si abre el alta con el código
// que llega por `?nuevo=`, y desde HU-32 eso depende de `puedeEditar`. Si la
// sección se montaba antes de que llegaran los permisos, `puedeEditar` era
// false, el alta no se abría, y el efecto que consume el código igual lo
// borraba del estado y de la URL: el escaneo se perdía sin dejar rastro.
describe("El código del escáner sobrevive a la carrera con los permisos", () => {
  test("abre el alta aunque el catálogo llegue antes que los permisos", async () => {
    let entregarPermisos;
    obtenerConfiguracion.mockReturnValue(
      new Promise((resolver) => {
        entregarPermisos = resolver;
      }),
    );

    renderizar("/productos?nuevo=7791234567890");

    // El catálogo ya está, los permisos todavía no: no se muestra la sección.
    await waitFor(() => expect(obtenerProductos).toHaveBeenCalled());
    expect(screen.queryByLabelText(/código de barras/i)).not.toBeInTheDocument();

    entregarPermisos(configuracionDe("propietario"));

    // Y cuando llegan, el alta aparece con el código que trajo el escáner.
    expect(await screen.findByLabelText(/código de barras/i)).toHaveValue(
      "7791234567890",
    );
  });

  test("al empleado no se le abre, y tampoco se le rompe la pantalla", async () => {
    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));

    renderizar("/productos?nuevo=7791234567890");

    await screen.findByTestId("productos-solo-lectura");
    expect(screen.queryByLabelText(/código de barras/i)).not.toBeInTheDocument();
    expect(screen.getByText("Coca-Cola 500ml")).toBeInTheDocument();
  });
});
