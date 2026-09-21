import { beforeEach, describe, expect, test, vi } from "vitest";
import { transferirStock } from "./transferencias";
import { apiFetch } from "./api";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

/** Una transferencia válida, con la cantidad ya convertida a número. */
const TRANSFERENCIA = {
  productoId: "11111111-1111-4111-8111-111111111111",
  ubicacionOrigenId: "22222222-2222-4222-8222-222222222222",
  ubicacionDestinoId: "33333333-3333-4333-8333-333333333333",
  cantidad: 10,
  motivo: "Reposición de góndola",
};

beforeEach(() => {
  apiFetch.mockReset();
});

describe("transferirStock", () => {
  test("postea la transferencia a /transferencias con el cuerpo tal cual", async () => {
    apiFetch.mockResolvedValueOnce({});

    await transferirStock(TRANSFERENCIA);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/transferencias", {
      method: "POST",
      body: JSON.stringify(TRANSFERENCIA),
    });
  });

  test("manda la cantidad como número, no como texto", async () => {
    apiFetch.mockResolvedValueOnce({});

    await transferirStock(TRANSFERENCIA);

    // Con "10" el backend responde 400: chequea `typeof cantidad === "number"`.
    const enviado = JSON.parse(apiFetch.mock.calls[0][1].body);
    expect(enviado.cantidad).toBe(10);
  });

  test("devuelve la respuesta del backend sin transformarla", async () => {
    const respuesta = {
      transferencia: { id: "t1" },
      movimientos: [{ cantidad: -10 }, { cantidad: 10 }],
      stock: {
        origen: { id: "s1", ubicacionId: TRANSFERENCIA.ubicacionOrigenId, cantidad: 2 },
        destino: { id: "s2", ubicacionId: TRANSFERENCIA.ubicacionDestinoId, cantidad: 15 },
      },
    };
    apiFetch.mockResolvedValueOnce(respuesta);

    await expect(transferirStock(TRANSFERENCIA)).resolves.toEqual(respuesta);
  });

  test("propaga el error del backend con su status", async () => {
    const error = Object.assign(new Error("Stock insuficiente: hay 2 unidades disponibles y se intentan descontar 10"), { status: 409 });
    apiFetch.mockRejectedValueOnce(error);

    await expect(transferirStock(TRANSFERENCIA)).rejects.toBe(error);
  });
});
