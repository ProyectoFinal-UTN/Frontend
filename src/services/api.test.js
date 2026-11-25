import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { apiDescargar, apiFetch, nombreDeContentDisposition } from "./api";

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

/* ---------------------------------------------------------------------------
 * apiDescargar (HU-25): respuestas que son un archivo y no JSON
 * ------------------------------------------------------------------------- */

/** Una respuesta con archivo, como la del PDF de reportes. */
function respuestaArchivo(contenido, encabezados = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(encabezados),
    blob: () => Promise.resolve(new Blob([contenido], { type: "application/pdf" })),
    json: () => Promise.reject(new SyntaxError("no es JSON")),
  };
}

describe("apiDescargar", () => {
  test("devuelve el archivo y el nombre que propone el backend", async () => {
    fetch.mockResolvedValue(
      respuestaArchivo("%PDF-1.4", {
        "Content-Disposition":
          'attachment; filename="reporte-movimientos-periodo-2026-09-01_2026-09-30.pdf"',
      }),
    );

    const { blob, nombreArchivo } = await apiDescargar("/reportes/movimientos?tipo=periodo");

    expect(await blob.text()).toBe("%PDF-1.4");
    expect(nombreArchivo).toBe(
      "reporte-movimientos-periodo-2026-09-01_2026-09-30.pdf",
    );
  });

  test("manda la cookie de sesión, igual que apiFetch", async () => {
    fetch.mockResolvedValue(respuestaArchivo("%PDF"));

    await apiDescargar("/reportes/movimientos");

    expect(fetch).toHaveBeenCalledWith(
      "/api/reportes/movimientos",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  test("sin Content-Disposition el nombre viene en null", async () => {
    fetch.mockResolvedValue(respuestaArchivo("%PDF"));

    const { nombreArchivo } = await apiDescargar("/reportes/movimientos");

    expect(nombreArchivo).toBeNull();
  });

  test("si falla, lee el { error } JSON y lanza lo mismo que apiFetch", async () => {
    fetch.mockResolvedValue(
      respuesta(
        { error: "El reporte supera los 5000 movimientos. Acotá el rango de fechas para generarlo" },
        { ok: false, status: 400 },
      ),
    );

    await expect(apiDescargar("/reportes/movimientos")).rejects.toMatchObject({
      message:
        "El reporte supera los 5000 movimientos. Acotá el rango de fechas para generarlo",
      status: 400,
      tipo: "general",
    });
  });

  test("un 403 se clasifica como permiso, no como sesión", async () => {
    fetch.mockResolvedValue(
      respuesta(
        { error: "El rol no tiene permiso para esta accion" },
        { ok: false, status: 403 },
      ),
    );

    await expect(apiDescargar("/reportes/movimientos")).rejects.toMatchObject({
      status: 403,
      tipo: "permiso",
    });
  });

  test("un error sin cuerpo JSON igual tiene un mensaje", async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError("vacío")),
    });

    await expect(apiDescargar("/reportes/movimientos")).rejects.toMatchObject({
      message: "No se pudo completar la operación (500)",
      status: 500,
    });
  });
});

describe("nombreDeContentDisposition", () => {
  test.each([
    ['attachment; filename="reporte.pdf"', "reporte.pdf"],
    ["attachment; filename=reporte.pdf", "reporte.pdf"],
    ["attachment; filename*=UTF-8''reporte-%C3%B1and%C3%BA.pdf", "reporte-ñandú.pdf"],
    [
      `attachment; filename="reporte.pdf"; filename*=UTF-8''reporte-a%C3%B1o.pdf`,
      "reporte-año.pdf",
    ],
    ["attachment", null],
    [null, null],
  ])("%s → %s", (encabezado, esperado) => {
    expect(nombreDeContentDisposition(encabezado)).toBe(esperado);
  });
});
