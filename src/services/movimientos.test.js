import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  SENTIDOS,
  TIPOS_MOVIMIENTO,
  TIPO_CON_SENTIDO,
  registrarMovimiento,
} from "./movimientos";
import { apiFetch } from "./api";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

/** Una venta válida, con la cantidad ya convertida como la espera el backend. */
const VENTA = {
  productoId: "11111111-1111-4111-8111-111111111111",
  tipo: "venta",
  cantidad: 3,
};

beforeEach(() => {
  apiFetch.mockReset();
});

describe("registrarMovimiento", () => {
  test("postea el movimiento a /movimientos", async () => {
    apiFetch.mockResolvedValueOnce({ movimiento: {}, stock: { cantidad: 7 } });

    await registrarMovimiento(VENTA);

    expect(apiFetch).toHaveBeenCalledWith("/movimientos", {
      method: "POST",
      body: JSON.stringify(VENTA),
    });
  });

  test("manda la cantidad como numero, no como texto", async () => {
    apiFetch.mockResolvedValueOnce({});

    await registrarMovimiento(VENTA);

    // El backend chequea `typeof cantidad === "number"`: si llegara el string
    // del <input type="number">, la request vuelve con un 400.
    const enviado = JSON.parse(apiFetch.mock.calls[0][1].body);
    expect(enviado.cantidad).toBe(3);
  });

  test("devuelve el stock resultante para poder confirmarlo en pantalla", async () => {
    apiFetch.mockResolvedValueOnce({
      movimiento: { id: "m1", cantidad: -3 },
      stock: { id: "s1", ubicacionId: "u1", cantidad: 7 },
    });

    const { stock } = await registrarMovimiento(VENTA);

    expect(stock.cantidad).toBe(7);
    expect(stock.ubicacionId).toBe("u1");
  });

  test("no inventa ubicacionId cuando quien llama no lo manda", async () => {
    apiFetch.mockResolvedValueOnce({});

    await registrarMovimiento(VENTA);

    // Con una sola ubicación el body sale sin el campo y la resuelve el
    // backend; agregarlo acá con un valor por defecto sería adivinar.
    const enviado = JSON.parse(apiFetch.mock.calls[0][1].body);
    expect(enviado).not.toHaveProperty("ubicacionId");
  });

  test("relanza el 409 con su status para que la pantalla lo distinga", async () => {
    const error = new Error(
      "Stock insuficiente: hay 4 unidades disponibles y se intentan descontar 10",
    );
    error.status = 409;
    apiFetch.mockRejectedValueOnce(error);

    await expect(registrarMovimiento(VENTA)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("Catalogo de tipos", () => {
  test("expone los cuatro tipos que acepta el backend", () => {
    expect(TIPOS_MOVIMIENTO.map(({ valor }) => valor)).toEqual([
      "compra",
      "venta",
      "merma",
      "ajuste",
    ]);
  });

  test("no ofrece transferencia, que es de HU-12 y este endpoint rechaza", () => {
    expect(TIPOS_MOVIMIENTO.map(({ valor }) => valor)).not.toContain(
      "transferencia",
    );
  });

  test("el ajuste es el tipo que necesita sentido", () => {
    expect(TIPO_CON_SENTIDO).toBe("ajuste");
    expect(SENTIDOS.map(({ valor }) => valor)).toEqual(["entrada", "salida"]);
  });
});
