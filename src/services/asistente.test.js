import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Service del Asistente Inteligente: recomendaciones proactivas (HU-27).
 *
 * `apiFetch` está mockeado: acá se prueba qué URL se arma y cómo se interpreta
 * `modo`, no que el backend conteste. Ningún test de este repo llama al modelo
 * de lenguaje, que se paga con un crédito compartido por el equipo.
 */

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import("./api");
const {
  MODO_DE_RESUMEN,
  hayResumenDegradado,
  obtenerRecomendaciones,
} = await import("./asistente");

beforeEach(() => {
  vi.clearAllMocks();
  apiFetch.mockResolvedValue({});
});

describe("obtenerRecomendaciones", () => {
  test("sin argumentos pega al endpoint sin query", async () => {
    await obtenerRecomendaciones();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/asistente/recomendaciones");
  });

  test("con `dias` lo manda como query", async () => {
    await obtenerRecomendaciones({ dias: 7 });

    expect(apiFetch).toHaveBeenCalledWith("/asistente/recomendaciones?dias=7");
  });

  test("un `dias` basura viaja igual: no se valida de este lado", async () => {
    // El backend lo acota en silencio (1–90) en vez de dar 400, porque es un
    // parámetro de afinado de la pantalla. Validarlo acá duplicaría un límite
    // que ya vive allá, y las dos copias se desincronizan.
    await obtenerRecomendaciones({ dias: "cualquiera" });

    expect(apiFetch).toHaveBeenCalledWith(
      "/asistente/recomendaciones?dias=cualquiera",
    );
  });

  test("un `dias` vacío o nulo no agrega query", async () => {
    await obtenerRecomendaciones({ dias: undefined });
    await obtenerRecomendaciones({ dias: null });
    await obtenerRecomendaciones({ dias: "" });

    for (const llamada of apiFetch.mock.calls) {
      expect(llamada[0]).toBe("/asistente/recomendaciones");
    }
  });

  test("devuelve la respuesta del backend tal cual", async () => {
    const respuesta = {
      generadoEn: "2026-10-07T19:51:02.100Z",
      ventana: { dias: 30, desde: "2026-09-07T19:51:02.100Z" },
      modo: "ia",
      resumen: "Un resumen.",
      recomendaciones: [],
    };
    apiFetch.mockResolvedValue(respuesta);

    await expect(obtenerRecomendaciones()).resolves.toEqual(respuesta);
  });
});

describe("hayResumenDegradado", () => {
  test("`limitado` sí: el proveedor de IA no estuvo", () => {
    expect(hayResumenDegradado({ modo: MODO_DE_RESUMEN.LIMITADO })).toBe(true);
  });

  test("`ia` no", () => {
    expect(hayResumenDegradado({ modo: MODO_DE_RESUMEN.IA })).toBe(false);
  });

  test("`sin_novedades` no: es un comercio ordenado, no una degradación", () => {
    // Es el valor que el backend separó de `limitado` justamente para que la
    // pantalla no muestre una alarma donde no hay ninguna.
    expect(hayResumenDegradado({ modo: MODO_DE_RESUMEN.SIN_NOVEDADES })).toBe(
      false,
    );
  });

  test("un modo que todavía no existe no dispara la alarma", () => {
    // Igualdad estricta y no una lista de "modos malos": inventar una alarma
    // por un valor que no se entiende es peor que no decir nada.
    expect(hayResumenDegradado({ modo: "algo_nuevo" })).toBe(false);
  });

  test("sin `modo`, o sin argumentos, no revienta ni avisa", () => {
    expect(hayResumenDegradado({})).toBe(false);
    expect(hayResumenDegradado()).toBe(false);
  });

  test("NO mira la lista: la regla es sobre el resumen", () => {
    // Que la sección esté vacía o no lo decide `recomendaciones.length` en el
    // componente. Las dos preguntas se responden por separado para que ninguna
    // dependa de que la otra siga valiendo: si mañana el backend mandara
    // `limitado` con lista vacía, el estado vacío seguiría saliendo igual
    // porque no se decide desde acá.
    expect(
      hayResumenDegradado({ modo: MODO_DE_RESUMEN.LIMITADO, recomendaciones: [] }),
    ).toBe(true);
    expect(
      hayResumenDegradado({
        modo: MODO_DE_RESUMEN.SIN_NOVEDADES,
        recomendaciones: [{ tipo: "reponer" }],
      }),
    ).toBe(false);
  });
});
