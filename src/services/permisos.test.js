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

// Los cuatro casos de carrera que el contador de generación viene a cerrar.
// Ninguno lo veía la suite antes: todos necesitan dos respuestas en vuelo a la
// vez, y con un solo mock que resuelve al toque eso nunca pasa.
describe("Respuestas que llegan tarde", () => {
  /** Una promesa que se resuelve cuando uno quiere. */
  function diferida() {
    let resolver;
    let rechazar;
    const promesa = new Promise((cumplir, fallar) => {
      resolver = cumplir;
      rechazar = fallar;
    });
    return { promesa, resolver, rechazar };
  }

  // El bug del logout: la respuesta del rol que se fue aterrizaba después de
  // `olvidarPermisos()` y volvía a dejar sus permisos puestos.
  test("una carga en vuelo al cerrar sesión no publica nada", async () => {
    const primera = diferida();
    obtenerConfiguracion.mockReturnValue(primera.promesa);

    cargarConfiguracion();
    olvidarPermisos();

    primera.resolver(configuracionDe("propietario"));
    await primera.promesa;

    expect(leer().configuracion).toBeNull();
  });

  test("y la siguiente sesión arranca de cero, sin heredar nada", async () => {
    const primera = diferida();
    obtenerConfiguracion.mockReturnValue(primera.promesa);

    cargarConfiguracion();
    olvidarPermisos();
    primera.resolver(configuracionDe("propietario"));
    await primera.promesa;

    obtenerConfiguracion.mockResolvedValue(configuracionDe("empleado"));
    await cargarConfiguracion();

    expect(leer().configuracion.rol).toBe("empleado");
  });

  // Dos refrescos seguidos: si se aplicaran en orden de llegada, la pantalla
  // podría quedar mostrando una respuesta más vieja que la última —por ejemplo
  // sin la ubicación que se acaba de crear—.
  test("una respuesta vieja no pisa a una más nueva", async () => {
    const vieja = diferida();
    const nueva = diferida();
    obtenerConfiguracion
      .mockReturnValueOnce(vieja.promesa)
      .mockReturnValueOnce(nueva.promesa);

    cargarConfiguracion();
    refrescarPermisos();

    // La nueva contesta primero y la vieja llega después.
    nueva.resolver(configuracionDe("empleado"));
    await nueva.promesa;
    vieja.resolver(configuracionDe("propietario"));
    await vieja.promesa;

    expect(leer().configuracion.rol).toBe("empleado");
  });

  // El `catch` anulaba `promesa` sin mirar de quién era: el fallo de una carga
  // vieja se llevaba puesta la promesa de la nueva, que quedaba en vuelo sin
  // que nadie la esperara, y el siguiente pedido disparaba una tercera request.
  test("el fallo de una carga vieja no rompe la que está en vuelo", async () => {
    const vieja = diferida();
    const nueva = diferida();
    obtenerConfiguracion
      .mockReturnValueOnce(vieja.promesa)
      .mockReturnValueOnce(nueva.promesa);

    cargarConfiguracion();
    const enVuelo = refrescarPermisos();

    vieja.rechazar(new Error("se cayó la vieja"));
    await new Promise((listo) => setTimeout(listo, 0));

    // El fallo viejo no se publica…
    expect(leer().error).toBeNull();

    nueva.resolver(configuracionDe("gerente"));
    await enVuelo;

    // …y la nueva llega bien, sin una tercera request de por medio.
    expect(leer().configuracion.rol).toBe("gerente");
    expect(obtenerConfiguracion).toHaveBeenCalledTimes(2);
  });
});
