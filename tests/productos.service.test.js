import { beforeEach, describe, expect, test, vi } from "vitest";
import { verificarCodigoBarras } from "../src/services/productos";
import { apiFetch } from "../src/services/api";

vi.mock("../src/services/api", () => ({ apiFetch: vi.fn() }));

describe("verificarCodigoBarras", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  test("pide GET /productos/codigo/:codigo y devuelve la respuesta tal cual", async () => {
    const respuesta = {
      existe: true,
      producto: { id: "p1", nombre: "Gaseosa 1.5L" },
    };
    apiFetch.mockResolvedValueOnce(respuesta);

    const resultado = await verificarCodigoBarras("7791234567890");

    expect(resultado).toEqual(respuesta);
    expect(apiFetch).toHaveBeenCalledWith("/productos/codigo/7791234567890");
  });

  test("devuelve existe:false con la sugerencia cuando el codigo es nuevo", async () => {
    const respuesta = {
      existe: false,
      sugerencia: { nombre: "Coca-Cola 1.5L", categoria: "Bebidas" },
    };
    apiFetch.mockResolvedValueOnce(respuesta);

    const resultado = await verificarCodigoBarras("0000000000000");

    expect(resultado).toEqual(respuesta);
  });

  test("relanza el error si la request falla (ej. 400 o backend caido)", async () => {
    const error = new Error("Error en la petición: 400");
    error.status = 400;
    apiFetch.mockRejectedValueOnce(error);

    await expect(verificarCodigoBarras("abc")).rejects.toThrow();
  });
});
