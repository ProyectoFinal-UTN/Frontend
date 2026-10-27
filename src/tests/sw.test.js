import { beforeEach, describe, expect, test, vi } from "vitest";
import codigo from "../../public/sw.js?raw";

/**
 * El service worker (`public/sw.js`, HU-18).
 *
 * No es un módulo: el navegador lo corre en un contexto propio donde `self` es
 * el service worker. Acá se ejecuta su código con un `self` falso, se capturan
 * los manejadores que registra y se los llama como lo haría el navegador.
 */

const ORIGEN = "https://app.example";
const PRODUCTO = "123e4567-e89b-12d3-a456-426614174000";

const AVISO = {
  tipo: "alerta_reposicion",
  titulo: "Reponer: Yerba 1 kg",
  cuerpo: "Stock actual: 3 (mínimo 10)",
  productoId: PRODUCTO,
  stockActual: 3,
  umbralMinimo: 10,
};

let manejadores;
let sw;

function cargarServiceWorker({ pestanas = [] } = {}) {
  manejadores = {};
  sw = {
    location: new URL(`${ORIGEN}/sw.js`),
    addEventListener: (tipo, manejador) => {
      manejadores[tipo] = manejador;
    },
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => {}) },
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async () => pestanas),
      openWindow: vi.fn(async () => null),
    },
  };

  new Function("self", codigo)(sw);
}

/** Dispara un evento y espera lo que el manejador haya pasado a `waitUntil`. */
async function disparar(tipo, evento) {
  let promesa = Promise.resolve();
  manejadores[tipo]({ ...evento, waitUntil: (p) => (promesa = p) });
  await promesa;
}

function datosPush(valor) {
  return {
    json: () => (typeof valor === "string" ? JSON.parse(valor) : valor),
  };
}

function pestana(url) {
  return { url, focus: vi.fn(async () => {}), postMessage: vi.fn() };
}

beforeEach(() => {
  cargarServiceWorker();
});

describe("push", () => {
  test("muestra el aviso con el producto, su stock y un tag por producto", async () => {
    await disparar("push", { data: datosPush(AVISO) });

    expect(sw.registration.showNotification).toHaveBeenCalledWith(
      "Reponer: Yerba 1 kg",
      expect.objectContaining({
        body: "Stock actual: 3 (mínimo 10)",
        icon: "/iconos/app-192.png",
        badge: "/iconos/insignia-96.png",
        tag: `reposicion-${PRODUCTO}`,
        renotify: true,
        data: { productoId: PRODUCTO },
      }),
    );
  });

  test("un aviso de otro tipo muestra uno genérico", async () => {
    await disparar("push", { data: datosPush({ tipo: "otra-cosa" }) });

    const [titulo, opciones] = sw.registration.showNotification.mock.calls[0];
    expect(titulo).toBe("Gestión Comercial PyME");
    expect(opciones.tag).toBeUndefined();
    expect(opciones.data).toEqual({});
  });

  test("un aviso que no es JSON no rompe: muestra uno genérico", async () => {
    await disparar("push", { data: datosPush("esto no es json") });

    expect(sw.registration.showNotification).toHaveBeenCalledWith(
      "Gestión Comercial PyME",
      expect.any(Object),
    );
  });

  test("un push sin datos muestra uno genérico", async () => {
    await disparar("push", { data: null });

    expect(sw.registration.showNotification).toHaveBeenCalledTimes(1);
  });
});

describe("notificationclick", () => {
  function notificacion(data) {
    return { close: vi.fn(), data };
  }

  test("sin la app abierta, abre una pestaña en el producto", async () => {
    const aviso = notificacion({ productoId: PRODUCTO });

    await disparar("notificationclick", { notification: aviso });

    expect(aviso.close).toHaveBeenCalled();
    expect(sw.clients.openWindow).toHaveBeenCalledWith(`/productos/${PRODUCTO}`);
  });

  test("con la app abierta, la enfoca y le pide ir al producto", async () => {
    const abierta = pestana(`${ORIGEN}/movimientos`);
    cargarServiceWorker({ pestanas: [pestana("https://otro.sitio/"), abierta] });

    await disparar("notificationclick", {
      notification: notificacion({ productoId: PRODUCTO }),
    });

    expect(abierta.focus).toHaveBeenCalled();
    expect(abierta.postMessage).toHaveBeenCalledWith({
      tipo: "abrir-ruta",
      ruta: `/productos/${PRODUCTO}`,
    });
    expect(sw.clients.openWindow).not.toHaveBeenCalled();
  });

  test("si no deja enfocar, igual le pide navegar", async () => {
    const abierta = pestana(`${ORIGEN}/`);
    abierta.focus.mockRejectedValueOnce(new Error("no permitido"));
    cargarServiceWorker({ pestanas: [abierta] });

    await disparar("notificationclick", {
      notification: notificacion({ productoId: PRODUCTO }),
    });

    expect(abierta.postMessage).toHaveBeenCalled();
  });

  test("un aviso genérico abre el inicio", async () => {
    await disparar("notificationclick", { notification: notificacion({}) });

    expect(sw.clients.openWindow).toHaveBeenCalledWith("/");
  });
});

describe("ciclo de vida", () => {
  test("toma el control apenas se instala y activa", async () => {
    manejadores.install({});
    await disparar("activate", {});

    expect(sw.skipWaiting).toHaveBeenCalled();
    expect(sw.clients.claim).toHaveBeenCalled();
  });
});
