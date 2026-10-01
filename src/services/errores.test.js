import { describe, expect, test } from "vitest";
import { TIPO, clasificar, mensajeDe, pideRevisarPermisos } from "./errores";

/** Un error como el que arma `apiFetch` a partir de la respuesta del backend. */
function fallo(status, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

describe("clasificar", () => {
  test("el 401 de sesión manda al login", () => {
    expect(clasificar(fallo(401, "No hay sesion activa"))).toBe(TIPO.SESION);
  });

  test("el 403 de permisos es el único de rol", () => {
    expect(
      clasificar(fallo(403, "El rol no tiene permiso para esta accion")),
    ).toBe(TIPO.PERMISO);
  });

  test("los dos 403 de cuenta se distinguen del de permisos", () => {
    expect(
      clasificar(fallo(403, "El usuario no tiene un comercio asociado")),
    ).toBe(TIPO.SIN_COMERCIO);
    expect(clasificar(fallo(403, "El rol del usuario no es valido"))).toBe(
      TIPO.ROL_INVALIDO,
    );
  });

  // El bug que este mapeo existe para evitar: si un 403 se lee como sesión
  // vencida, la UI desloguea, el login funciona, la acción vuelve a fallar con
  // 403 y la persona queda dando vueltas sin poder salir.
  test("un 403 con un mensaje desconocido NUNCA es sesión vencida", () => {
    const tipo = clasificar(fallo(403, "Algo que el backend todavía no decía"));

    expect(tipo).toBe(TIPO.PERMISO);
    expect(tipo).not.toBe(TIPO.SESION);
  });

  test("un 403 sin mensaje tampoco es sesión vencida", () => {
    expect(clasificar(fallo(403, ""))).toBe(TIPO.PERMISO);
  });

  test("un 401 con un mensaje desconocido sí es sesión vencida", () => {
    expect(clasificar(fallo(401, "Token vencido"))).toBe(TIPO.SESION);
  });

  // Defensa contra un backend que cambie un status sin avisar: el número es la
  // señal confiable, el texto es solo una pista.
  test("manda el status, no el texto, cuando no coinciden", () => {
    expect(
      clasificar(fallo(403, "No hay sesion activa")),
    ).toBe(TIPO.PERMISO);
    expect(
      clasificar(fallo(401, "El rol no tiene permiso para esta accion")),
    ).toBe(TIPO.SESION);
  });

  test("lo que no es 401 ni 403 es un fallo general", () => {
    expect(clasificar(fallo(404, "El producto no existe"))).toBe(TIPO.GENERAL);
    expect(clasificar(fallo(409, "No hay stock suficiente"))).toBe(
      TIPO.GENERAL,
    );
    expect(clasificar(fallo(500, "Error interno"))).toBe(TIPO.GENERAL);
    // Un fallo de red no llega a tener status.
    expect(clasificar(new Error("Failed to fetch"))).toBe(TIPO.GENERAL);
    expect(clasificar(undefined)).toBe(TIPO.GENERAL);
  });
});

describe("pideRevisarPermisos", () => {
  test("solo el 403 de rol pide releer los permisos", () => {
    expect(pideRevisarPermisos(TIPO.PERMISO)).toBe(true);

    // Los de cuenta no se arreglan releyendo permisos, y el de sesión tampoco.
    expect(pideRevisarPermisos(TIPO.SESION)).toBe(false);
    expect(pideRevisarPermisos(TIPO.SIN_COMERCIO)).toBe(false);
    expect(pideRevisarPermisos(TIPO.ROL_INVALIDO)).toBe(false);
    expect(pideRevisarPermisos(TIPO.GENERAL)).toBe(false);
  });
});

describe("mensajeDe", () => {
  test("los problemas de cuenta dicen qué hacer, no solo qué pasó", () => {
    expect(
      mensajeDe(TIPO.SIN_COMERCIO, "El usuario no tiene un comercio asociado"),
    ).toMatch(/pedile al propietario que te vuelva a invitar/i);
    expect(
      mensajeDe(TIPO.ROL_INVALIDO, "El rol del usuario no es valido"),
    ).toMatch(/avisale al propietario/i);
  });

  test("para el resto se muestra el mensaje del backend tal cual", () => {
    expect(
      mensajeDe(TIPO.PERMISO, "El rol no tiene permiso para esta accion"),
    ).toBe("El rol no tiene permiso para esta accion");
    expect(mensajeDe(TIPO.GENERAL, "El producto no existe")).toBe(
      "El producto no existe",
    );
  });
});
