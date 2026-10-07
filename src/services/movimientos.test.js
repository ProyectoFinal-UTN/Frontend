import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  SENTIDOS,
  TIPOS_MOVIMIENTO,
  TIPO_CON_SENTIDO,
  TIPOS_HISTORIAL,
  etiquetaDeTipo,
  finDelDia,
  inicioDelDia,
  obtenerHistorial,
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

describe("límites del día (HU-14)", () => {
  test("el inicio es la medianoche local del día, en ISO UTC", () => {
    expect(inicioDelDia("2026-09-18")).toBe(
      new Date(2026, 8, 18, 0, 0, 0, 0).toISOString(),
    );
  });

  test("el fin es el último milisegundo local del día", () => {
    expect(finDelDia("2026-09-18")).toBe(
      new Date(2026, 8, 18, 23, 59, 59, 999).toISOString(),
    );
  });

  test("siempre viajan con la Z que exige el backend", () => {
    expect(inicioDelDia("2026-01-01")).toMatch(/Z$/);
    expect(finDelDia("2026-01-01")).toMatch(/Z$/);
  });

  test("un día vacío o mal formado no genera límite", () => {
    expect(inicioDelDia("")).toBeUndefined();
    expect(finDelDia(undefined)).toBeUndefined();
    expect(inicioDelDia("18/09/2026")).toBeUndefined();
  });
});

describe("obtenerHistorial", () => {
  test("sin filtros pide /movimientos sin query string", async () => {
    apiFetch.mockResolvedValueOnce({});

    await obtenerHistorial();

    expect(apiFetch).toHaveBeenCalledWith("/movimientos");
  });

  test("manda los filtros puestos y omite los vacíos", async () => {
    apiFetch.mockResolvedValueOnce({});

    await obtenerHistorial({
      productoId: "p1",
      tipo: "venta",
      ubicacionId: "",
      proveedorId: undefined,
    });

    const url = new URL(apiFetch.mock.calls[0][0], "http://x");
    expect(url.pathname).toBe("/movimientos");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      productoId: "p1",
      tipo: "venta",
    });
  });

  test("convierte los días a instantes: desde al inicio, hasta al fin", async () => {
    apiFetch.mockResolvedValueOnce({});

    await obtenerHistorial({ desde: "2026-09-01", hasta: "2026-09-18" });

    const url = new URL(apiFetch.mock.calls[0][0], "http://x");
    expect(url.searchParams.get("desde")).toBe(inicioDelDia("2026-09-01"));
    expect(url.searchParams.get("hasta")).toBe(finDelDia("2026-09-18"));
  });

  test("la página 1 no se manda; las siguientes sí", async () => {
    apiFetch.mockResolvedValue({});

    await obtenerHistorial({ pagina: 1 });
    expect(apiFetch).toHaveBeenLastCalledWith("/movimientos");

    await obtenerHistorial({ pagina: 3 });
    expect(apiFetch).toHaveBeenLastCalledWith("/movimientos?pagina=3");
  });
});

describe("tipos del historial", () => {
  test("incluyen transferencia, que no se registra a mano pero se consulta", () => {
    expect(TIPOS_HISTORIAL.map(({ valor }) => valor)).toEqual([
      "compra",
      "venta",
      "ajuste",
      "merma",
      "transferencia",
    ]);
  });

  test("un tipo desconocido se muestra tal cual en vez de desaparecer", () => {
    expect(etiquetaDeTipo("merma")).toBe("Merma");
    expect(etiquetaDeTipo("otro")).toBe("otro");
  });
});
