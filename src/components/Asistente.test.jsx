import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Asistente from "./Asistente";
import { configuracionDe } from "../tests/permisos";

/**
 * Asistente Inteligente (HU-26).
 *
 * El service del asistente está mockeado siempre: el de verdad le pega al
 * backend, que a su vez llama a un modelo de lenguaje pago con un crédito
 * compartido por el equipo. Ningún test de este repo lo llama.
 */

vi.mock("../hooks/useAuth", () => ({ useAuth: vi.fn() }));

vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

vi.mock("../services/asistente", async (original) => ({
  ...(await original()),
  consultarAsistente: vi.fn(),
}));

const { useAuth } = await import("../hooks/useAuth");
const { obtenerConfiguracion } = await import("../services/configuracion");
const { consultarAsistente } = await import("../services/asistente");

const RESPUESTA_IA = {
  respuesta: "Tenés que reponer el Alfajor Jorgito: te faltan 5 unidades.",
  modo: "ia",
  herramientasUsadas: ["productosParaReponer"],
};

const RESPUESTA_LIMITADA = {
  respuesta: "Por ahora no puedo analizar tu pregunta.",
  modo: "limitado",
  herramientasUsadas: [],
};

/** Un fallo como los que tira `apiFetch`. */
function falloHttp(status, mensaje) {
  return Object.assign(new Error(mensaje), { status });
}

function renderizar() {
  return render(
    <MemoryRouter>
      <Asistente />
    </MemoryRouter>,
  );
}

/** Renderiza con sesión y abre el panel. */
async function abrirPanel() {
  const usuario = userEvent.setup();
  renderizar();
  await usuario.click(await screen.findByRole("button", { name: "Asistente" }));
  return usuario;
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({
    usuario: { name: "Ana" },
    autenticado: true,
    cargando: false,
  });
  obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));
  consultarAsistente.mockResolvedValue(RESPUESTA_IA);
});

describe("Quién lo ve", () => {
  test("sin sesión no aparece, y ni siquiera pregunta los permisos", async () => {
    // Si preguntara, el 401 del login quedaría guardado en el store
    // compartido de permisos, donde lo leen todas las pantallas.
    useAuth.mockReturnValue({ usuario: null, autenticado: false, cargando: false });

    renderizar();

    expect(screen.queryByRole("button", { name: "Asistente" })).not.toBeInTheDocument();
    expect(obtenerConfiguracion).not.toHaveBeenCalled();
  });

  test("con sesión y permiso aparece el botón, con el panel cerrado", async () => {
    renderizar();

    const boton = await screen.findByRole("button", { name: "Asistente" });

    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Tu pregunta")).not.toBeInTheDocument();
  });

  test("no aparece para un rol sin permiso", async () => {
    // Copia sin `asistente`, sin tocar la de tests/permisos.js: es compartida
    // y Object.freeze no congela los objetos de adentro, así que un `delete`
    // acá le sacaría el permiso al empleado de todos los tests siguientes.
    const base = configuracionDe("empleado");
    const permisos = Object.fromEntries(
      Object.entries(base.permisos).filter(([recurso]) => recurso !== "asistente"),
    );
    obtenerConfiguracion.mockResolvedValue({ ...base, permisos });

    renderizar();

    // Se espera a que los permisos lleguen, para no afirmar sobre el render
    // de antes, donde tampoco estaría.
    await waitFor(() => expect(obtenerConfiguracion).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Asistente" })).not.toBeInTheDocument(),
    );
  });

  test("si los permisos no se pudieron averiguar, se ofrece igual", async () => {
    // Esconderlo le sacaría el asistente a quien sí puede usarlo. Mostrarlo de
    // más termina, como mucho, en un 403 del backend que lo explica.
    obtenerConfiguracion.mockRejectedValue(new Error("Sin conexión"));

    renderizar();

    expect(await screen.findByRole("button", { name: "Asistente" })).toBeInTheDocument();
  });
});

describe("Abrir y cerrar", () => {
  test("al abrir, el foco queda listo para escribir", async () => {
    await abrirPanel();

    expect(screen.getByLabelText("Tu pregunta")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Asistente" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  test("muestra sugerencias mientras no hay conversación", async () => {
    await abrirPanel();

    expect(
      screen.getByRole("button", { name: "¿Qué productos tengo que reponer?" }),
    ).toBeInTheDocument();
  });

  test("Escape cierra el panel y devuelve el foco al botón", async () => {
    const usuario = await abrirPanel();

    await usuario.keyboard("{Escape}");

    expect(screen.queryByLabelText("Tu pregunta")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asistente" })).toHaveFocus();
  });

  test("la conversación sobrevive a cerrar y volver a abrir", async () => {
    const usuario = await abrirPanel();
    await usuario.type(screen.getByLabelText("Tu pregunta"), "¿qué repongo?{Enter}");
    await screen.findByText(RESPUESTA_IA.respuesta);

    await usuario.click(screen.getByRole("button", { name: "Cerrar el asistente" }));
    await usuario.click(screen.getByRole("button", { name: "Asistente" }));

    expect(screen.getByText(RESPUESTA_IA.respuesta)).toBeInTheDocument();
  });
});

describe("Preguntar", () => {
  test("manda la pregunta sin espacios de más y muestra la respuesta", async () => {
    const usuario = await abrirPanel();

    await usuario.type(screen.getByLabelText("Tu pregunta"), "  ¿qué repongo?  ");
    await usuario.click(screen.getByRole("button", { name: "Preguntar" }));

    expect(await screen.findByText(RESPUESTA_IA.respuesta)).toBeInTheDocument();
    expect(consultarAsistente).toHaveBeenCalledWith("¿qué repongo?");
    expect(screen.getByText("¿qué repongo?")).toBeInTheDocument();
  });

  test("limpia el campo al enviar", async () => {
    const usuario = await abrirPanel();
    const campo = screen.getByLabelText("Tu pregunta");

    await usuario.type(campo, "¿qué repongo?{Enter}");

    expect(campo).toHaveValue("");
  });

  test("avisa mientras busca la respuesta", async () => {
    consultarAsistente.mockReturnValue(new Promise(() => {}));
    const usuario = await abrirPanel();

    await usuario.type(screen.getByLabelText("Tu pregunta"), "¿qué repongo?{Enter}");

    expect(screen.getByText("Buscando en tus datos…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preguntar" })).toBeDisabled();
  });

  test("Shift+Enter baja de línea en vez de enviar", async () => {
    const usuario = await abrirPanel();

    await usuario.type(screen.getByLabelText("Tu pregunta"), "línea uno{Shift>}{Enter}{/Shift}");

    expect(consultarAsistente).not.toHaveBeenCalled();
  });

  test("con el campo vacío no se puede enviar", async () => {
    const usuario = await abrirPanel();
    const boton = screen.getByRole("button", { name: "Preguntar" });

    expect(boton).toBeDisabled();

    await usuario.type(screen.getByLabelText("Tu pregunta"), "   {Enter}");

    expect(consultarAsistente).not.toHaveBeenCalled();
  });

  test("no deja escribir más de lo que acepta el backend", async () => {
    await abrirPanel();

    expect(screen.getByLabelText("Tu pregunta")).toHaveAttribute("maxLength", "500");
  });

  test("una sugerencia se pregunta con un clic", async () => {
    const usuario = await abrirPanel();

    await usuario.click(
      screen.getByRole("button", { name: "¿Qué productos tengo que reponer?" }),
    );

    expect(consultarAsistente).toHaveBeenCalledWith("¿Qué productos tengo que reponer?");
    expect(await screen.findByText(RESPUESTA_IA.respuesta)).toBeInTheDocument();
  });

  test("dos envíos antes de que React re-renderice hacen una sola consulta", async () => {
    // Cada consulta repetida se paga del crédito compartido del equipo.
    //
    // Los dos clics van dentro del MISMO `act`, así React no re-renderiza
    // entre uno y otro: es lo que pasa en el navegador con Enter + clic o con
    // un doble clic rápido. Con `userEvent.dblClick` este test pasaba incluso
    // sin el candado, porque el segundo clic chocaba contra el botón ya
    // deshabilitado y nunca llegaba a la ref. Verificado sacando el candado:
    // así escrito, falla.
    consultarAsistente.mockReturnValue(new Promise(() => {}));
    const usuario = await abrirPanel();
    await usuario.type(screen.getByLabelText("Tu pregunta"), "¿qué repongo?");

    const boton = screen.getByRole("button", { name: "Preguntar" });
    act(() => {
      boton.click();
      boton.click();
    });

    expect(consultarAsistente).toHaveBeenCalledTimes(1);
  });

  test("dos clics en una sugerencia antes del re-render hacen una sola consulta", async () => {
    // Las sugerencias no pasan por el campo de texto, así que lo único que las
    // frena es el candado.
    consultarAsistente.mockReturnValue(new Promise(() => {}));
    await abrirPanel();

    const sugerencia = screen.getByRole("button", {
      name: "¿Qué productos tengo que reponer?",
    });
    act(() => {
      sugerencia.click();
      sugerencia.click();
    });

    expect(consultarAsistente).toHaveBeenCalledTimes(1);
  });
});

describe("Modo limitado (HU-28)", () => {
  test("avisa que la respuesta es limitada", async () => {
    consultarAsistente.mockResolvedValue(RESPUESTA_LIMITADA);
    const usuario = await abrirPanel();

    await usuario.type(screen.getByLabelText("Tu pregunta"), "¿qué repongo?{Enter}");

    expect(await screen.findByText(RESPUESTA_LIMITADA.respuesta)).toBeInTheDocument();
    expect(screen.getByText(/respuesta limitada/i)).toBeInTheDocument();
  });

  test("una respuesta normal no muestra el aviso", async () => {
    const usuario = await abrirPanel();

    await usuario.type(screen.getByLabelText("Tu pregunta"), "¿qué repongo?{Enter}");
    await screen.findByText(RESPUESTA_IA.respuesta);

    expect(screen.queryByText(/respuesta limitada/i)).not.toBeInTheDocument();
  });
});

describe("Errores", () => {
  test("un 403 se explica sin mandar al login", async () => {
    consultarAsistente.mockRejectedValue(
      falloHttp(403, "El rol no tiene permiso para esta accion"),
    );
    const usuario = await abrirPanel();

    await usuario.type(screen.getByLabelText("Tu pregunta"), "¿qué repongo?{Enter}");

    expect(await screen.findByTestId("aviso-permiso")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /volver a entrar/i })).not.toBeInTheDocument();
  });

  test("un 401 ofrece volver a entrar", async () => {
    consultarAsistente.mockRejectedValue(falloHttp(401, "No hay sesion activa"));
    const usuario = await abrirPanel();

    await usuario.type(screen.getByLabelText("Tu pregunta"), "¿qué repongo?{Enter}");

    expect(await screen.findByRole("link", { name: /volver a entrar/i })).toBeInTheDocument();
  });

  test("un error del servidor se puede reintentar, y el reintento pregunta lo mismo", async () => {
    consultarAsistente
      .mockRejectedValueOnce(falloHttp(500, "No se pudo completar la operación"))
      .mockResolvedValueOnce(RESPUESTA_IA);
    const usuario = await abrirPanel();

    await usuario.type(screen.getByLabelText("Tu pregunta"), "¿qué repongo?{Enter}");
    await usuario.click(await screen.findByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText(RESPUESTA_IA.respuesta)).toBeInTheDocument();
    expect(consultarAsistente).toHaveBeenCalledTimes(2);
    expect(consultarAsistente).toHaveBeenLastCalledWith("¿qué repongo?");
    // El error no queda colgado arriba de la respuesta buena.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("reintentar no borra lo que se está escribiendo para la siguiente", async () => {
    consultarAsistente
      .mockRejectedValueOnce(falloHttp(500, "No se pudo completar la operación"))
      .mockResolvedValueOnce(RESPUESTA_IA);
    const usuario = await abrirPanel();
    const campo = screen.getByLabelText("Tu pregunta");

    await usuario.type(campo, "¿qué repongo?{Enter}");
    await usuario.type(campo, "y la yerba");
    await usuario.click(await screen.findByRole("button", { name: "Reintentar" }));

    expect(campo).toHaveValue("y la yerba");
  });
});
