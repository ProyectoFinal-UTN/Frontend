import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AvisoDeError from "./AvisoDeError";
import { configuracionDe } from "../tests/permisos";

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

const { obtenerConfiguracion } = await import("../services/configuracion");

/** Un error como el que arma `apiFetch`, con su `tipo` ya puesto. */
async function fallo(status, mensaje) {
  const { clasificar } = await import("../services/errores");
  const error = new Error(mensaje);
  error.status = status;
  error.tipo = clasificar(error);
  return error;
}

function renderizar(error, props = {}) {
  return render(
    <MemoryRouter>
      <AvisoDeError fallo={error} {...props} />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  const { olvidarPermisos } = await import("../services/permisos");
  olvidarPermisos();
  obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));
});

describe("401: la sesión no sirve", () => {
  test("ofrece volver a entrar", async () => {
    renderizar(await fallo(401, "No hay sesion activa"));

    const aviso = screen.getByTestId("aviso-sesion");
    expect(aviso).toHaveTextContent("No hay sesion activa");
    expect(
      screen.getByRole("link", { name: "Volver a entrar" }),
    ).toHaveAttribute("href", "/login");
  });
});

describe("403 de permisos: el rol no alcanza", () => {
  test("muestra el mensaje del backend sin ofrecer el login", async () => {
    renderizar(await fallo(403, "El rol no tiene permiso para esta accion"));

    const aviso = screen.getByTestId("aviso-permiso");
    expect(aviso).toHaveTextContent("El rol no tiene permiso para esta accion");

    // Lo que no tiene que estar: la salida al login. Ofrecerla acá es lo que
    // lleva a la gente al loop de desloguear, entrar y volver a fallar.
    expect(
      screen.queryByRole("link", { name: "Volver a entrar" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("aviso-sesion")).not.toBeInTheDocument();
  });

  // Al rol se lo pudieron haber cambiado hace un segundo, con la app abierta.
  test("relee los permisos, para que la UI se ponga al día sola", async () => {
    renderizar(await fallo(403, "El rol no tiene permiso para esta accion"));

    await waitFor(() => expect(obtenerConfiguracion).toHaveBeenCalledTimes(1));
  });
});

describe("403 de cuenta: no es problema del rol", () => {
  test("sin comercio asociado se explica aparte y dice qué hacer", async () => {
    renderizar(await fallo(403, "El usuario no tiene un comercio asociado"));

    const aviso = screen.getByTestId("aviso-cuenta");
    expect(aviso).toHaveTextContent(/no está asociada a ningún comercio/i);
    expect(aviso).toHaveTextContent(/pedile al propietario/i);
    expect(screen.queryByTestId("aviso-permiso")).not.toBeInTheDocument();
  });

  test("rol inválido también, y con su propio texto", async () => {
    renderizar(await fallo(403, "El rol del usuario no es valido"));

    const aviso = screen.getByTestId("aviso-cuenta");
    expect(aviso).toHaveTextContent(/un rol que el sistema no reconoce/i);
    expect(screen.queryByTestId("aviso-permiso")).not.toBeInTheDocument();
  });

  test("no relee permisos: releerlos no arregla una cuenta", async () => {
    renderizar(await fallo(403, "El usuario no tiene un comercio asociado"));

    await waitFor(() => expect(screen.getByTestId("aviso-cuenta")).toBeInTheDocument());
    expect(obtenerConfiguracion).not.toHaveBeenCalled();
  });
});

describe("El resto de los fallos", () => {
  test("muestra el mensaje y ofrece reintentar si hay con qué", async () => {
    const reintentar = vi.fn();
    renderizar(await fallo(404, "El producto no existe"), {
      alReintentar: reintentar,
    });

    const aviso = screen.getByTestId("aviso-general");
    expect(aviso).toHaveTextContent("El producto no existe");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  test("sin `alReintentar` no muestra un botón que no hace nada", async () => {
    renderizar(await fallo(500, "Error interno"));

    expect(
      screen.queryByRole("button", { name: "Reintentar" }),
    ).not.toBeInTheDocument();
  });

  test("sin fallo no dibuja nada", () => {
    const { container } = renderizar(null);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("Cuando el fallo viene sin clasificar", () => {
  // Un error armado a mano —en un test, o por un camino que no pasó por
  // `apiFetch`— tiene que clasificarse igual y no caer en el cajón general.
  test("lo clasifica por su cuenta", () => {
    const suelto = new Error("El rol no tiene permiso para esta accion");
    suelto.status = 403;

    renderizar(suelto);

    expect(screen.getByTestId("aviso-permiso")).toBeInTheDocument();
  });
});
