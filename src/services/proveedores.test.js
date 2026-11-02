import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  asociarProveedor,
  crearProveedor,
  desasociarProveedor,
  editarProveedor,
  eliminarProveedor,
  obtenerHistorialDeCompras,
  obtenerProductosDeProveedor,
  obtenerProveedores,
  obtenerProveedoresDeProducto,
} from "./proveedores";
import { apiFetch } from "./api";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

beforeEach(() => {
  apiFetch.mockReset();
});

describe("proveedores", () => {
  test("obtenerProveedores pide GET /proveedores sin mandar el comercio", async () => {
    const lista = [{ id: "v1", nombre: "Distribuidora Sur" }];
    apiFetch.mockResolvedValueOnce(lista);

    expect(await obtenerProveedores()).toEqual(lista);
    expect(apiFetch).toHaveBeenCalledWith("/proveedores");
  });

  test("crearProveedor hace POST con los datos en JSON", async () => {
    apiFetch.mockResolvedValueOnce({ id: "v1" });

    await crearProveedor({ nombre: "Distribuidora Sur" });

    expect(apiFetch).toHaveBeenCalledWith("/proveedores", {
      method: "POST",
      body: JSON.stringify({ nombre: "Distribuidora Sur" }),
    });
  });

  test("editarProveedor hace PUT sobre el id", async () => {
    apiFetch.mockResolvedValueOnce({ id: "v1" });

    await editarProveedor("v1", { rubro: "Bebidas" });

    expect(apiFetch).toHaveBeenCalledWith("/proveedores/v1", {
      method: "PUT",
      body: JSON.stringify({ rubro: "Bebidas" }),
    });
  });

  test("eliminarProveedor hace DELETE sobre el id", async () => {
    apiFetch.mockResolvedValueOnce(null);

    await eliminarProveedor("v1");

    expect(apiFetch).toHaveBeenCalledWith("/proveedores/v1", { method: "DELETE" });
  });

  test("obtenerProveedoresDeProducto pide GET /productos/:id/proveedores", async () => {
    apiFetch.mockResolvedValueOnce([]);

    await obtenerProveedoresDeProducto("p1");

    expect(apiFetch).toHaveBeenCalledWith("/productos/p1/proveedores");
  });

  test("obtenerProductosDeProveedor pide GET /proveedores/:id/productos", async () => {
    apiFetch.mockResolvedValueOnce([]);

    await obtenerProductosDeProveedor("v1");

    expect(apiFetch).toHaveBeenCalledWith("/proveedores/v1/productos");
  });

  test("asociarProveedor hace POST sobre el producto con el proveedor en el cuerpo", async () => {
    apiFetch.mockResolvedValueOnce({});

    await asociarProveedor("p1", "v1");

    expect(apiFetch).toHaveBeenCalledWith("/productos/p1/proveedores", {
      method: "POST",
      body: JSON.stringify({ proveedorId: "v1" }),
    });
  });

  test("desasociarProveedor hace DELETE sobre el vínculo", async () => {
    apiFetch.mockResolvedValueOnce(null);

    await desasociarProveedor("p1", "v1");

    expect(apiFetch).toHaveBeenCalledWith("/productos/p1/proveedores/v1", {
      method: "DELETE",
    });
  });

  test("los errores del backend llegan a quien llama, con su status", async () => {
    const fallo = Object.assign(new Error("Ya existe"), { status: 409 });
    apiFetch.mockRejectedValueOnce(fallo);

    await expect(crearProveedor({ nombre: "X" })).rejects.toBe(fallo);
  });
});

describe("obtenerHistorialDeCompras (HU-21)", () => {
  /** La ruta y los parámetros de la última llamada, ya separados. */
  function ultimaLlamada() {
    const [url] = apiFetch.mock.calls.at(-1);
    const [ruta, consulta = ""] = url.split("?");
    return { ruta, parametros: new URLSearchParams(consulta) };
  }

  test("sin período ni página pide la ruta pelada, sin query string", async () => {
    apiFetch.mockResolvedValueOnce({});

    await obtenerHistorialDeCompras("v1");

    expect(apiFetch).toHaveBeenCalledWith("/proveedores/v1/historial-compras");
  });

  test("el día viaja como instante con zona, nunca como YYYY-MM-DD", async () => {
    apiFetch.mockResolvedValueOnce({});

    await obtenerHistorialDeCompras("v1", { desde: "2026-01-01" });

    const { ruta, parametros } = ultimaLlamada();
    const desde = parametros.get("desde");

    expect(ruta).toBe("/proveedores/v1/historial-compras");
    // La trampa del contrato: `?desde=2026-01-01` el backend lo rechaza con 400.
    expect(desde).not.toBe("2026-01-01");
    expect(desde).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(desde).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).toISOString());
  });

  test("«hasta» es el último instante del día y no el primero", async () => {
    apiFetch.mockResolvedValueOnce({});

    await obtenerHistorialDeCompras("v1", {
      desde: "2026-03-02",
      hasta: "2026-03-02",
    });

    const { parametros } = ultimaLlamada();
    const desde = Date.parse(parametros.get("desde"));
    const hasta = Date.parse(parametros.get("hasta"));

    // Un día entero menos un milisegundo: si `hasta` fuera el inicio del día,
    // el rango de un solo día no devolvería nada.
    expect(hasta - desde).toBe(86_399_999);
  });

  test("la página 1 no viaja y la 2 sí", async () => {
    apiFetch.mockResolvedValueOnce({});
    await obtenerHistorialDeCompras("v1", { pagina: 1 });
    expect(ultimaLlamada().parametros.has("pagina")).toBe(false);

    apiFetch.mockResolvedValueOnce({});
    await obtenerHistorialDeCompras("v1", { pagina: 2 });
    expect(ultimaLlamada().parametros.get("pagina")).toBe("2");
  });

  test("no manda los parámetros que el endpoint no acepta", async () => {
    apiFetch.mockResolvedValueOnce({});

    await obtenerHistorialDeCompras("v1", {
      desde: "2026-01-01",
      hasta: "2026-12-31",
      pagina: 3,
      // Los acepta el historial de HU-14, no este endpoint.
      tipo: "compra",
      productoId: "p1",
      ubicacionId: "u1",
      limite: 500,
    });

    // Aserción completa sobre el set de claves, no un match parcial: lo que se
    // está verificando es justamente que no se cuele nada de más.
    expect([...ultimaLlamada().parametros.keys()].sort()).toEqual([
      "desde",
      "hasta",
      "pagina",
    ]);
  });

  test("devuelve la respuesta del backend tal cual", async () => {
    const respuesta = {
      proveedor: { id: "v1", nombre: "Distribuidora Sur", activo: true },
      compras: [
        {
          id: "c1",
          fecha: "2026-10-12T14:03:00.000Z",
          cantidad: 24,
          motivo: null,
          producto: {
            id: "p1",
            nombre: "Yerba 1kg",
            codigoBarras: "7790001112223",
            unidadMedida: "unidad",
            activo: true,
          },
          ubicacion: { id: "u1", nombre: "Depósito" },
        },
      ],
      resumen: {
        compras: 37,
        unidades: 912,
        primeraCompra: "2026-03-02T12:00:00.000Z",
        ultimaCompra: "2026-10-12T14:03:00.000Z",
        montos: null,
      },
      paginacion: { pagina: 1, limite: 50, total: 37, totalPaginas: 1 },
    };
    apiFetch.mockResolvedValueOnce(respuesta);

    expect(await obtenerHistorialDeCompras("v1")).toEqual(respuesta);
  });

  test("propaga el 400 de filtro con su status y su mensaje", async () => {
    const fallo = Object.assign(new Error("La fecha «desde» necesita zona"), {
      status: 400,
    });
    apiFetch.mockRejectedValueOnce(fallo);

    await expect(obtenerHistorialDeCompras("v1")).rejects.toBe(fallo);
  });

  test("propaga el 404 del proveedor", async () => {
    const fallo = Object.assign(new Error("El proveedor no existe"), {
      status: 404,
    });
    apiFetch.mockRejectedValueOnce(fallo);

    await expect(obtenerHistorialDeCompras("fantasma")).rejects.toBe(fallo);
  });
});
