import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ESTADO,
  activar,
  claveABytes,
  desactivar,
  desuscribirAlSalir,
  escucharAperturas,
  leerEstado,
  registrarServiceWorker,
  sincronizar,
} from "./pushNavegador";
import {
  eliminarSuscripcion,
  guardarSuscripcion,
  obtenerClavePublica,
} from "./push";

vi.mock("./push", () => ({
  obtenerClavePublica: vi.fn(),
  guardarSuscripcion: vi.fn(),
  eliminarSuscripcion: vi.fn(),
}));

/**
 * jsdom no tiene ninguna de las APIs de push: ni `Notification`, ni
 * `navigator.serviceWorker`, ni `PushManager`. Cada test arma el navegador que
 * necesita con estos ayudantes, y `afterEach` lo desarma.
 */

/** Una clave VAPID pública real (la del ejemplo de web-push), 65 bytes. */
const CLAVE =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function suscripcionFalsa({
  endpoint = "https://fcm.googleapis.com/fcm/send/abc",
  clave,
} = {}) {
  return {
    endpoint,
    options: clave ? { applicationServerKey: clave.buffer } : {},
    toJSON: () => ({
      endpoint,
      expirationTime: null,
      keys: { p256dh: "p256dh", auth: "auth" },
    }),
    unsubscribe: vi.fn(async () => true),
  };
}

/**
 * Un navegador con push. `conPush: false` lo deja sin `PushManager`, como
 * Safari en una pestaña común de iPhone.
 */
function navegador({
  agente = CHROME,
  suscripcion = null,
  conPush = true,
  instalada = false,
} = {}) {
  const pushManager = {
    getSubscription: vi.fn(async () => suscripcion),
    subscribe: vi.fn(async () => {
      suscripcion = suscripcionFalsa({ endpoint: "https://push.nueva/1" });
      return suscripcion;
    }),
  };
  const registro = { pushManager };
  const serviceWorker = {
    register: vi.fn(async () => registro),
    ready: Promise.resolve(registro),
    getRegistration: vi.fn(async () => registro),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  vi.stubGlobal("navigator", {
    userAgent: agente,
    maxTouchPoints: agente === IPHONE ? 5 : 0,
    standalone: instalada,
    serviceWorker,
  });
  if (conPush) vi.stubGlobal("PushManager", function PushManager() {});

  return { pushManager, serviceWorker };
}

function permiso(actual, respuesta = actual) {
  const Notification = {
    permission: actual,
    requestPermission: vi.fn(async () => respuesta),
  };
  vi.stubGlobal("Notification", Notification);
  return Notification;
}

function falloConStatus(status, mensaje = "fallo") {
  return Object.assign(new Error(mensaje), { status });
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerClavePublica.mockResolvedValue({ clavePublica: CLAVE });
  guardarSuscripcion.mockResolvedValue({});
  eliminarSuscripcion.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("claveABytes", () => {
  test("decodifica base64url, con - y _ y sin relleno", () => {
    expect(Array.from(claveABytes("-_8"))).toEqual([251, 255]);
  });

  test("una clave VAPID pública son 65 bytes", () => {
    expect(claveABytes(CLAVE)).toHaveLength(65);
  });
});

describe("leerEstado", () => {
  test("sin las APIs de push, sin soporte", async () => {
    expect(await leerEstado()).toBe(ESTADO.SIN_SOPORTE);
  });

  test("iPhone abriendo la app en Safari: hay que instalarla", async () => {
    navegador({ agente: IPHONE, conPush: false });

    expect(await leerEstado()).toBe(ESTADO.IOS_SIN_INSTALAR);
  });

  test("iPhone con la app instalada pero sin push: iOS viejo, sin soporte", async () => {
    navegador({ agente: IPHONE, conPush: false, instalada: true });

    expect(await leerEstado()).toBe(ESTADO.SIN_SOPORTE);
  });

  test("con el servidor respondiendo 503, push apagado", async () => {
    navegador();
    permiso("granted");
    obtenerClavePublica.mockRejectedValueOnce(falloConStatus(503));

    expect(await leerEstado()).toBe(ESTADO.SERVIDOR_APAGADO);
  });

  test("otro error del servidor no tapa el estado del navegador", async () => {
    navegador({ suscripcion: suscripcionFalsa() });
    permiso("granted");
    obtenerClavePublica.mockRejectedValueOnce(falloConStatus(403));

    expect(await leerEstado()).toBe(ESTADO.ACTIVO);
  });

  test("permiso bloqueado", async () => {
    navegador();
    permiso("denied");

    expect(await leerEstado()).toBe(ESTADO.DENEGADO);
  });

  test("permiso dado y suscripción activa", async () => {
    navegador({ suscripcion: suscripcionFalsa() });
    permiso("granted");

    expect(await leerEstado()).toBe(ESTADO.ACTIVO);
  });

  test("permiso dado pero sin suscripción: inactivo", async () => {
    navegador();
    permiso("granted");

    expect(await leerEstado()).toBe(ESTADO.INACTIVO);
  });

  test("sin preguntar todavía: inactivo, aunque quede una suscripción", async () => {
    navegador({ suscripcion: suscripcionFalsa() });
    permiso("default");

    expect(await leerEstado()).toBe(ESTADO.INACTIVO);
  });
});

describe("activar", () => {
  test("pide el permiso ANTES de llamar al backend (Safari lo exige)", async () => {
    navegador();
    const orden = [];
    const notificacion = permiso("default", "granted");
    notificacion.requestPermission.mockImplementation(async () => {
      orden.push("permiso");
      return "granted";
    });
    obtenerClavePublica.mockImplementation(async () => {
      orden.push("clave");
      return { clavePublica: CLAVE };
    });

    await activar();

    expect(orden).toEqual(["permiso", "clave"]);
  });

  test("con permiso, suscribe con la clave del servidor y la guarda en el backend", async () => {
    const { pushManager } = navegador();
    permiso("default", "granted");

    expect(await activar()).toBe(ESTADO.ACTIVO);

    const opciones = pushManager.subscribe.mock.calls[0][0];
    expect(opciones.userVisibleOnly).toBe(true);
    expect(opciones.applicationServerKey).toEqual(claveABytes(CLAVE));
    expect(guardarSuscripcion).toHaveBeenCalledWith({
      endpoint: "https://push.nueva/1",
      expirationTime: null,
      keys: { p256dh: "p256dh", auth: "auth" },
    });
  });

  test("permiso denegado: no llama al backend ni suscribe", async () => {
    const { pushManager } = navegador();
    permiso("default", "denied");

    expect(await activar()).toBe(ESTADO.DENEGADO);
    expect(obtenerClavePublica).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  test("cartel cerrado sin elegir: sin respuesta", async () => {
    navegador();
    permiso("default", "default");

    expect(await activar()).toBe(ESTADO.SIN_RESPUESTA);
    expect(obtenerClavePublica).not.toHaveBeenCalled();
  });

  test("sin soporte no pide permiso", async () => {
    const notificacion = permiso("default", "granted");

    expect(await activar()).toBe(ESTADO.SIN_SOPORTE);
    expect(notificacion.requestPermission).not.toHaveBeenCalled();
  });

  test("iPhone sin instalar no pide permiso", async () => {
    navegador({ agente: IPHONE, conPush: false });
    const notificacion = permiso("default", "granted");

    expect(await activar()).toBe(ESTADO.IOS_SIN_INSTALAR);
    expect(notificacion.requestPermission).not.toHaveBeenCalled();
  });

  test("503 del servidor: se propaga con su status y no suscribe", async () => {
    const { pushManager } = navegador();
    permiso("default", "granted");
    obtenerClavePublica.mockRejectedValueOnce(falloConStatus(503));

    await expect(activar()).rejects.toMatchObject({ status: 503 });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  test("si el backend no la guarda, suelta la suscripción del navegador", async () => {
    const { pushManager } = navegador();
    permiso("default", "granted");
    guardarSuscripcion.mockRejectedValueOnce(falloConStatus(403));

    await expect(activar()).rejects.toMatchObject({ status: 403 });

    const creada = await pushManager.subscribe.mock.results[0].value;
    expect(creada.unsubscribe).toHaveBeenCalled();
  });

  test("reusa la suscripción existente si es de la misma clave", async () => {
    const existente = suscripcionFalsa({ clave: claveABytes(CLAVE) });
    const { pushManager } = navegador({ suscripcion: existente });
    permiso("granted");

    await activar();

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(existente.unsubscribe).not.toHaveBeenCalled();
    expect(guardarSuscripcion).toHaveBeenCalledWith(existente.toJSON());
  });

  test("si la existente es de otra clave, la suelta y crea una nueva", async () => {
    const vieja = suscripcionFalsa({ clave: new Uint8Array([1, 2, 3]) });
    const { pushManager } = navegador({ suscripcion: vieja });
    permiso("granted");

    await activar();

    expect(vieja.unsubscribe).toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalled();
  });

  test("un error del navegador al suscribir se muestra en castellano", async () => {
    const { pushManager } = navegador();
    permiso("default", "granted");
    pushManager.subscribe.mockRejectedValueOnce(
      new Error("AbortError: Registration failed - push service error"),
    );

    await expect(activar()).rejects.toThrow(
      "Este navegador no pudo activar las notificaciones",
    );
    expect(guardarSuscripcion).not.toHaveBeenCalled();
  });
});

describe("desactivar", () => {
  test("borra en el backend y desuscribe el navegador", async () => {
    const suscripcion = suscripcionFalsa();
    navegador({ suscripcion });
    permiso("granted");

    expect(await desactivar()).toBe(ESTADO.INACTIVO);

    expect(eliminarSuscripcion).toHaveBeenCalledWith(suscripcion.endpoint);
    expect(suscripcion.unsubscribe).toHaveBeenCalled();
  });

  test("si el DELETE falla, desuscribe igual: es lo que corta los avisos", async () => {
    const suscripcion = suscripcionFalsa();
    navegador({ suscripcion });
    permiso("granted");
    eliminarSuscripcion.mockRejectedValueOnce(falloConStatus(500));

    expect(await desactivar()).toBe(ESTADO.INACTIVO);
    expect(suscripcion.unsubscribe).toHaveBeenCalled();
  });

  test("sin suscripción no llama al backend", async () => {
    navegador();
    permiso("granted");

    await desactivar();

    expect(eliminarSuscripcion).not.toHaveBeenCalled();
  });
});

describe("desuscribirAlSalir", () => {
  test("no falla nunca, aunque el navegador no pueda desuscribir", async () => {
    const suscripcion = suscripcionFalsa();
    suscripcion.unsubscribe.mockRejectedValueOnce(new Error("no"));
    navegador({ suscripcion });
    permiso("granted");

    await expect(desuscribirAlSalir()).resolves.toBeUndefined();
    expect(eliminarSuscripcion).toHaveBeenCalled();
  });

  test("sin soporte no hace nada", async () => {
    await expect(desuscribirAlSalir()).resolves.toBeUndefined();
    expect(eliminarSuscripcion).not.toHaveBeenCalled();
  });
});

describe("sincronizar", () => {
  test("con permiso y suscripción, la reenvía al backend", async () => {
    const suscripcion = suscripcionFalsa();
    navegador({ suscripcion });
    permiso("granted");

    expect(await sincronizar()).toBe(true);
    expect(guardarSuscripcion).toHaveBeenCalledWith(suscripcion.toJSON());
  });

  test("sin permiso no manda nada", async () => {
    navegador({ suscripcion: suscripcionFalsa() });
    permiso("default");

    expect(await sincronizar()).toBe(false);
    expect(guardarSuscripcion).not.toHaveBeenCalled();
  });

  test("sin suscripción no manda nada", async () => {
    navegador();
    permiso("granted");

    expect(await sincronizar()).toBe(false);
    expect(guardarSuscripcion).not.toHaveBeenCalled();
  });
});

describe("registrarServiceWorker", () => {
  test("registra /sw.js", async () => {
    const { serviceWorker } = navegador();

    await registrarServiceWorker();

    expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js");
  });

  test("si el registro falla, la app sigue: devuelve null", async () => {
    const { serviceWorker } = navegador();
    serviceWorker.register.mockRejectedValueOnce(new Error("SSL"));

    expect(await registrarServiceWorker()).toBeNull();
  });

  test("sin service workers no hace nada", async () => {
    expect(await registrarServiceWorker()).toBeNull();
  });
});

describe("escucharAperturas", () => {
  function oyenteRegistrado(serviceWorker) {
    return serviceWorker.addEventListener.mock.calls[0][1];
  }

  test("avisa la ruta que pide el service worker", () => {
    const { serviceWorker } = navegador();
    const alAbrir = vi.fn();

    escucharAperturas(alAbrir);
    oyenteRegistrado(serviceWorker)({
      data: { tipo: "abrir-ruta", ruta: "/productos/123e4567" },
    });

    expect(alAbrir).toHaveBeenCalledWith("/productos/123e4567");
  });

  test("ignora mensajes de otro tipo y rutas a otros sitios", () => {
    const { serviceWorker } = navegador();
    const alAbrir = vi.fn();

    escucharAperturas(alAbrir);
    const oyente = oyenteRegistrado(serviceWorker);
    oyente({ data: { tipo: "otro", ruta: "/productos/1" } });
    oyente({ data: { tipo: "abrir-ruta", ruta: "//malo.com" } });
    oyente({ data: { tipo: "abrir-ruta", ruta: "https://malo.com" } });
    oyente({ data: null });

    expect(alAbrir).not.toHaveBeenCalled();
  });

  test("devuelve cómo dejar de escuchar", () => {
    const { serviceWorker } = navegador();

    const dejar = escucharAperturas(vi.fn());
    dejar();

    expect(serviceWorker.removeEventListener).toHaveBeenCalledWith(
      "message",
      oyenteRegistrado(serviceWorker),
    );
  });
});
