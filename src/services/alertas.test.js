import { beforeEach, describe, expect, test, vi } from "vitest";
import { LIMITE_DEL_PANEL, obtenerAlertas } from "./alertas";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import("./api");

beforeEach(() => {
  apiFetch.mockReset();
});

/** La ruta y los parámetros de la última llamada, ya separados. */
function ultimaLlamada() {
  const [url] = apiFetch.mock.calls.at(-1);
  const [ruta, consulta = ""] = url.split("?");
  return { ruta, parametros: new URLSearchParams(consulta) };
}

describe("obtenerAlertas (HU-17)", () => {
  test("pide la ruta de alertas con el límite del panel", async () => {
    apiFetch.mockResolvedValueOnce({ alertas: [], paginacion: {} });

    await obtenerAlertas();

    const { ruta, parametros } = ultimaLlamada();
    expect(ruta).toBe("/alertas");
    expect(parametros.get("limite")).toBe(String(LIMITE_DEL_PANEL));
  });

  test("la página 1 no viaja y la 2 sí", async () => {
    apiFetch.mockResolvedValueOnce({});
    await obtenerAlertas({ pagina: 1 });
    expect(ultimaLlamada().parametros.has("pagina")).toBe(false);

    apiFetch.mockResolvedValueOnce({});
    await obtenerAlertas({ pagina: 2 });
    expect(ultimaLlamada().parametros.get("pagina")).toBe("2");
  });

  test("el límite viaja siempre, incluso en la página 1", async () => {
    // El default del backend son 50. Si el límite no viajara, el panel del
    // dashboard recibiría 50 filas y la paginación no tendría sentido.
    apiFetch.mockResolvedValueOnce({});

    await obtenerAlertas({ pagina: 1 });

    expect(ultimaLlamada().parametros.get("limite")).toBe("6");
  });

  test("un límite pedido a mano reemplaza al del panel", async () => {
    apiFetch.mockResolvedValueOnce({});

    await obtenerAlertas({ limite: 200 });

    expect(ultimaLlamada().parametros.get("limite")).toBe("200");
  });

  test("un límite que no es un entero positivo no viaja en vez de dar un 400", async () => {
    apiFetch.mockResolvedValueOnce({});

    await obtenerAlertas({ limite: 0 });

    const { ruta, parametros } = ultimaLlamada();
    expect(parametros.has("limite")).toBe(false);
    // Sin parámetros no queda un "?" pelado colgando de la ruta.
    expect(ruta).toBe("/alertas");
    expect(apiFetch).toHaveBeenCalledWith("/alertas");
  });

  test("no manda los parámetros que el endpoint no acepta", async () => {
    // Aserción completa sobre el set de claves, no un match parcial: lo que se
    // está verificando es justamente que no se cuele nada de más. El endpoint
    // no tiene filtro por estado —devuelve solo las activas— así que un
    // `estado` que alguien pase tiene que morir acá y no llegar como un
    // parámetro que el backend ignora en silencio.
    apiFetch.mockResolvedValueOnce({});

    await obtenerAlertas({
      pagina: 3,
      limite: 6,
      estado: "resuelta",
      productoId: "p1",
      comercioId: "otro",
    });

    expect([...ultimaLlamada().parametros.keys()].sort()).toEqual([
      "limite",
      "pagina",
    ]);
  });

  test("devuelve la respuesta del backend tal cual", async () => {
    const respuesta = {
      alertas: [
        {
          id: "a1",
          generadaEn: "2026-10-29T13:05:00.000Z",
          producto: {
            id: "p1",
            nombre: "Yerba 1 kg",
            codigoBarras: "7790000000000",
            categoria: "Almacén",
            unidadMedida: "unidad",
          },
          stockActual: 3,
          umbralMinimo: 10,
          faltanteHastaElUmbral: 7,
          stockAlGenerar: 3,
          umbralAlGenerar: 10,
          ubicaciones: [{ id: "u1", nombre: "Depósito", cantidad: 3 }],
          proveedorSugerido: {
            id: "v1",
            nombre: "Distribuidora Sur",
            telefono: "11 5555-0000",
            correo: "ventas@distrisur.com",
          },
          proveedores: [
            {
              id: "v1",
              nombre: "Distribuidora Sur",
              telefono: "11 5555-0000",
              correo: "ventas@distrisur.com",
            },
          ],
        },
      ],
      paginacion: { pagina: 1, limite: 6, total: 1, totalPaginas: 1 },
    };
    apiFetch.mockResolvedValueOnce(respuesta);

    expect(await obtenerAlertas()).toEqual(respuesta);
  });

  test("propaga el 400 de paginación con su status y su mensaje", async () => {
    const fallo = Object.assign(
      new Error('El parámetro "pagina" debe ser un número entero mayor a 0'),
      { status: 400 },
    );
    apiFetch.mockRejectedValueOnce(fallo);

    // Identidad y no forma: el service no envuelve ni rearma el error, así que
    // el `status` y el `tipo` que puso `api.js` llegan intactos a la pantalla.
    await expect(obtenerAlertas({ pagina: 2 })).rejects.toBe(fallo);
  });

  test("propaga el 403 del rol sin alerta.read", async () => {
    const fallo = Object.assign(
      new Error("El rol no tiene permiso para esta accion"),
      { status: 403 },
    );
    apiFetch.mockRejectedValueOnce(fallo);

    await expect(obtenerAlertas()).rejects.toBe(fallo);
  });
});
