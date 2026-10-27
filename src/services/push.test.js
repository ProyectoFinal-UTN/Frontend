import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  eliminarSuscripcion,
  guardarSuscripcion,
  obtenerClavePublica,
} from "./push";
import { apiFetch } from "./api";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

/** Lo que devuelve `PushSubscription.toJSON()` en un navegador real. */
const SUSCRIPCION = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  expirationTime: null,
  keys: { p256dh: "BNcR...", auth: "tBHI..." },
};

beforeEach(() => {
  apiFetch.mockReset();
});

describe("obtenerClavePublica", () => {
  test("pide GET /push/clave-publica", async () => {
    apiFetch.mockResolvedValueOnce({ clavePublica: "BEl62i" });

    expect(await obtenerClavePublica()).toEqual({ clavePublica: "BEl62i" });
    expect(apiFetch).toHaveBeenCalledWith("/push/clave-publica");
  });

  test("propaga el 503 de push apagado con su status", async () => {
    const fallo = Object.assign(new Error("Push desactivado"), { status: 503 });
    apiFetch.mockRejectedValueOnce(fallo);

    await expect(obtenerClavePublica()).rejects.toMatchObject({ status: 503 });
  });
});

describe("guardarSuscripcion", () => {
  test("manda la suscripción tal cual en un POST, sin usuario ni comercio", async () => {
    apiFetch.mockResolvedValueOnce({ endpoint: SUSCRIPCION.endpoint });

    await guardarSuscripcion(SUSCRIPCION);

    expect(apiFetch).toHaveBeenCalledWith("/push/suscripciones", {
      method: "POST",
      body: JSON.stringify(SUSCRIPCION),
    });
  });
});

describe("eliminarSuscripcion", () => {
  test("manda el endpoint en el body de un DELETE", async () => {
    apiFetch.mockResolvedValueOnce(null);

    await eliminarSuscripcion(SUSCRIPCION.endpoint);

    expect(apiFetch).toHaveBeenCalledWith("/push/suscripciones", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: SUSCRIPCION.endpoint }),
    });
  });
});
