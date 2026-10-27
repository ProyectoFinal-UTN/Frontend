import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SeccionNotificaciones from "./SeccionNotificaciones";
import { ESTADO } from "../services/pushNavegador";
import { clasificar } from "../services/errores";

/**
 * El interruptor de HU-18. La parte del navegador (permiso, service worker,
 * `pushManager`) se prueba en `pushNavegador.test.js`; acá se mockea ese
 * service y se mira lo que ve la persona en cada caso.
 */

vi.mock("../services/pushNavegador", async (original) => ({
  ...(await original()),
  leerEstado: vi.fn(),
  activar: vi.fn(),
  desactivar: vi.fn(),
}));

// Un 403 hace que `AvisoDeError` relea los permisos: sin esto saldría a la red.
vi.mock("../services/configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(async () => null),
}));

const { leerEstado, activar, desactivar } = await import(
  "../services/pushNavegador"
);

function renderizar() {
  return render(
    <MemoryRouter>
      <SeccionNotificaciones />
    </MemoryRouter>,
  );
}

/** Un error como los arma `apiFetch`. */
function falloDeApi(status, mensaje) {
  const fallo = Object.assign(new Error(mensaje), { status });
  fallo.tipo = clasificar(fallo);
  return fallo;
}

async function interruptor() {
  const boton = await screen.findByRole("switch", {
    name: /notificaciones push/i,
  });
  // Espera a que termine de leer el estado inicial.
  await screen.findByText(/en este dispositivo\.$/i);
  return boton;
}

beforeEach(() => {
  vi.clearAllMocks();
  leerEstado.mockResolvedValue(ESTADO.INACTIVO);
});

describe("Estado inicial", () => {
  test("mientras revisa, el interruptor está deshabilitado", () => {
    leerEstado.mockReturnValue(new Promise(() => {}));

    renderizar();

    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText(/revisando este dispositivo/i)).toBeInTheDocument();
  });

  test("abrir la pantalla no activa nada: hace falta un toque", async () => {
    renderizar();

    expect(await interruptor()).toHaveAttribute("aria-checked", "false");
    expect(activar).not.toHaveBeenCalled();
  });

  test("con suscripción activa se muestra encendido", async () => {
    leerEstado.mockResolvedValue(ESTADO.ACTIVO);

    renderizar();

    expect(await interruptor()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Activadas en este dispositivo.")).toBeInTheDocument();
  });

  test("relee el estado al volver a la pestaña", async () => {
    renderizar();
    await interruptor();

    leerEstado.mockResolvedValue(ESTADO.ACTIVO);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
});

describe("Activar", () => {
  test("con permiso concedido queda encendido", async () => {
    activar.mockResolvedValue(ESTADO.ACTIVO);
    const usuario = userEvent.setup();

    renderizar();
    await usuario.click(await interruptor());

    expect(activar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("con el permiso denegado explica cómo habilitarlo y deshabilita el interruptor", async () => {
    activar.mockResolvedValue(ESTADO.DENEGADO);
    const usuario = userEvent.setup();

    renderizar();
    await usuario.click(await interruptor());

    expect(screen.getByTestId("push-explicacion")).toHaveTextContent(
      /bloqueadas.*no deja volver a preguntar/i,
    );
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  test("si cierran el cartel sin elegir, avisa que se puede volver a tocar", async () => {
    activar.mockResolvedValue(ESTADO.SIN_RESPUESTA);
    const usuario = userEvent.setup();

    renderizar();
    await usuario.click(await interruptor());

    expect(screen.getByText(/permiso quedó sin responder/i)).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeEnabled();
  });

  test("503 del servidor: mensaje en gris, sin error rojo", async () => {
    activar.mockRejectedValue(falloDeApi(503, "Push desactivado"));
    const usuario = userEvent.setup();

    renderizar();
    await usuario.click(await interruptor());

    expect(screen.getByTestId("push-explicacion")).toHaveTextContent(
      /el servidor no las tiene activadas/i,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  test("403 del rol: aviso de permiso, y la pantalla sigue en pie", async () => {
    activar.mockRejectedValue(
      falloDeApi(403, "El rol no tiene permiso para esta accion"),
    );
    const usuario = userEvent.setup();

    renderizar();
    await usuario.click(await interruptor());

    expect(await screen.findByTestId("aviso-permiso")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  test("un error del navegador se muestra con su mensaje", async () => {
    activar.mockRejectedValue(
      new Error("Este navegador no pudo activar las notificaciones."),
    );
    const usuario = userEvent.setup();

    renderizar();
    await usuario.click(await interruptor());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no pudo activar las notificaciones/i,
    );
  });
});

describe("Silenciar", () => {
  test("apagarlo desuscribe y queda apagado", async () => {
    leerEstado.mockResolvedValue(ESTADO.ACTIVO);
    desactivar.mockResolvedValue(ESTADO.INACTIVO);
    const usuario = userEvent.setup();

    renderizar();
    await usuario.click(await interruptor());

    expect(desactivar).toHaveBeenCalledTimes(1);
    expect(activar).not.toHaveBeenCalled();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });
});

describe("Sin poder usarlas", () => {
  test("navegador sin soporte", async () => {
    leerEstado.mockResolvedValue(ESTADO.SIN_SOPORTE);

    renderizar();

    expect(await screen.findByTestId("push-explicacion")).toHaveTextContent(
      /no permite notificaciones push/i,
    );
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  test("iPhone sin la app instalada: explica cómo instalarla", async () => {
    leerEstado.mockResolvedValue(ESTADO.IOS_SIN_INSTALAR);

    renderizar();

    const explicacion = await screen.findByTestId("push-explicacion");
    expect(explicacion).toHaveTextContent(/iOS 16\.4 o superior/i);
    expect(explicacion).toHaveTextContent(/agregar a pantalla de inicio/i);
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  test("push apagado en el servidor desde que abre la pantalla", async () => {
    leerEstado.mockResolvedValue(ESTADO.SERVIDOR_APAGADO);

    renderizar();

    expect(await screen.findByTestId("push-explicacion")).toHaveTextContent(
      /servidor no las tiene activadas/i,
    );
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  test("permiso bloqueado desde antes", async () => {
    leerEstado.mockResolvedValue(ESTADO.DENEGADO);

    renderizar();

    expect(await screen.findByTestId("push-explicacion")).toHaveTextContent(
      /configuración de sitios/i,
    );
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});
