import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { apiFetch } from "./api";

/**
 * Acá sí se mockea `fetch` y no un service: `api.js` es el que llama a `fetch`,
 * así que es el único lugar del repo donde mockearlo prueba algo.
 *
 * Lo que se cuida es el header: el soporte de `FormData` que agregó HU-7 toca
 * infra que usan todas las historias, y si alguien "simplifica" ese condicional
 * se rompen dos cosas distintas —el upload, o todos los POST de JSON— sin que
 * nada más lo avise.
 */

function respuesta(datos, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: () => Promise.resolve(datos),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Los headers con los que se llamó a `fetch` en la última invocación. */
function headersUsados() {
  return fetch.mock.calls[0][1].headers;
}

describe("Content-Type", () => {
  test("un body JSON sigue viajando como application/json", async () => {
    fetch.mockResolvedValue(respuesta({ id: "p1" }));

    await apiFetch("/productos", {
      method: "POST",
      body: JSON.stringify({ nombre: "Yerba" }),
    });

    expect(headersUsados()).toHaveProperty(
      "Content-Type",
      "application/json",
    );
  });

  test("una request sin body también manda el JSON por defecto", async () => {
    fetch.mockResolvedValue(respuesta([]));

    await apiFetch("/productos");

    expect(headersUsados()).toHaveProperty(
      "Content-Type",
      "application/json",
    );
  });

  test("con FormData no se manda Content-Type", async () => {
    // El boundary de `multipart/form-data` solo lo puede calcular el navegador.
    // Si mandáramos el header nosotros saldría sin boundary, el servidor no
    // encontraría el archivo y la importación llegaría vacía.
    fetch.mockResolvedValue(respuesta({ importados: 0 }));

    const cuerpo = new FormData();
    cuerpo.append("archivo", new File(["a,b"], "catalogo.csv"));

    await apiFetch("/productos/importar", { method: "POST", body: cuerpo });

    expect(headersUsados()).not.toHaveProperty("Content-Type");
  });
});

describe("errores", () => {
  test("desempaqueta el { error } del backend y conserva el status", async () => {
    fetch.mockResolvedValue(
      respuesta(
        { error: "Al archivo le faltan columnas obligatorias: categoria" },
        { ok: false, status: 400 },
      ),
    );

    await expect(apiFetch("/productos/importar")).rejects.toMatchObject({
      message: "Al archivo le faltan columnas obligatorias: categoria",
      status: 400,
    });
  });
});
