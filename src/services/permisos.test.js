import { beforeEach, describe, expect, test, vi } from "vitest";
import { configuracionDe } from "../tests/permisos";

vi.mock("./configuracion", async (original) => ({
  ...(await original()),
  obtenerConfiguracion: vi.fn(),
}));

const { obtenerConfiguracion } = await import("./configuracion");
const {
  cargarConfiguracion,
  leer,
  olvidarPermisos,
  refrescarPermisos,
  suscribir,
} = await import("./permisos");

beforeEach(() => {
  vi.clearAllMocks();
  olvidarPermisos();
  obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));
});

describe("cargarConfiguracion", () => {
  // La razón de ser del store: antes Configuración, Productos e Importar
  // pedían el mismo endpoint por separado.
  test("varios consumidores comparten una sola request", async () => {
    const [a, b, c] = await Promise.all([
      cargarConfiguracion(),
      cargarConfiguracion(),
      cargarConfiguracion(),
    ]);

    expect(obtenerConfiguracion).toHaveBeenCalledTimes(1);
    expect(a).toEqual(configuracionDe("empleado"));
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  test("tampoco vuelve a pedir después de que resolvió", async () => {
    await cargarConfiguracion();
    await cargarConfiguracion();

    expect(obtenerConfiguracion).toHaveBeenCalledTimes(1);
  });

  test("deja la configuración a disposición de quien la lea", async () => {
    await cargarConfiguracion();

    expect(leer().configuracion).toEqual(configuracionDe("empleado"));
    expect(leer().error).toBeNull();
    expect(leer().cargando).toBe(false);
  });
});

describe("cuando falla", () => {
  // Si la promesa fallada quedara cacheada, el error sería permanente para toda
  // la vida de la pestaña: ni el botón «Reintentar» de una pantalla ni el
  // refresco tras un 403 podrían sacarlo.
  test("un fallo no queda cacheado y el siguiente intento vuelve a pedir", async () => {
    obtenerConfiguracion.mockRejectedValueOnce(new Error("sin red"));

    await cargarConfiguracion();
    expect(leer().error).toEqual(new Error("sin red"));
    expect(leer().configuracion).toBeNull();

    await cargarConfiguracion();

    expect(obtenerConfiguracion).toHaveBeenCalledTimes(2);
    expect(leer().configuracion).toEqual(configuracionDe("empleado"));
    expect(leer().error).toBeNull();
  });

  test("no rechaza, para no dejar promesas sin manejar en cada pantalla", async () => {
    obtenerConfiguracion.mockRejectedValueOnce(new Error("sin red"));

    await expect(cargarConfiguracion()).resolves.toBeNull();
  });
});

describe("refrescarPermisos", () => {
  test("vuelve a pedir y avisa a los suscriptores", async () => {
    const oyente = vi.fn();
    await cargarConfiguracion();
    suscribir(oyente);
    oyente.mockClear();

    obtenerConfiguracion.mockResolvedValue(configuracionDe("propietario"));
    await refrescarPermisos();

    expect(obtenerConfiguracion).toHaveBeenCalledTimes(2);
    expect(leer().configuracion.rol).toBe("propietario");
    expect(oyente).toHaveBeenCalled();
  });

  test("desuscribirse deja de recibir avisos", async () => {
    const oyente = vi.fn();
    const desuscribir = suscribir(oyente);

    desuscribir();
    await cargarConfiguracion();

    expect(oyente).not.toHaveBeenCalled();
  });
});

describe("olvidarPermisos", () => {
  // El caso real: cerrar sesión y entrar con otra cuenta en la misma pestaña.
  // Sin esto, al empleado que entra después le quedaría la UI del propietario.
  test("borra lo cargado y obliga a volver a pedir", async () => {
    await cargarConfiguracion();
    expect(leer().configuracion.rol).toBe("empleado");

    olvidarPermisos();

    expect(leer().configuracion).toBeNull();
    expect(leer().error).toBeNull();

    obtenerConfiguracion.mockResolvedValue(configuracionDe("propietario"));
    await cargarConfiguracion();

    expect(obtenerConfiguracion).toHaveBeenCalledTimes(2);
    expect(leer().configuracion.rol).toBe("propietario");
  });

  test("avisa a los suscriptores, para que la UI no quede mostrando lo viejo", async () => {
    const oyente = vi.fn();
    await cargarConfiguracion();
    suscribir(oyente);
    oyente.mockClear();

    olvidarPermisos();

    expect(oyente).toHaveBeenCalled();
  });
});
