import { describe, expect, test } from "vitest";
import {
  validarPasswordNueva,
  validarPedidoDeRecuperacion,
} from "./Recuperar.validacion";

describe("validarPedidoDeRecuperacion", () => {
  test("acepta un correo válido", () => {
    expect(validarPedidoDeRecuperacion({ correo: "ana@kiosco.com" })).toEqual({});
  });

  test("rechaza el vacío y el que son solo espacios", () => {
    expect(validarPedidoDeRecuperacion({ correo: "" }).correo).toMatch(
      /ingresá tu correo/i,
    );
    expect(validarPedidoDeRecuperacion({ correo: "   " }).correo).toMatch(
      /ingresá tu correo/i,
    );
  });

  test("rechaza los que no parecen correos", () => {
    for (const correo of ["ana", "ana@", "ana@sinpunto", "@kiosco.com"]) {
      expect(validarPedidoDeRecuperacion({ correo }).correo).toMatch(
        /no parece válido/i,
      );
    }
  });
});

describe("validarPasswordNueva", () => {
  const valida = { password: "unaClaveSegura123", confirmacion: "unaClaveSegura123" };

  test("acepta una contraseña que cumple", () => {
    expect(validarPasswordNueva(valida)).toEqual({});
  });

  test("exige el mínimo de 8", () => {
    expect(
      validarPasswordNueva({ password: "corta", confirmacion: "corta" }).password,
    ).toMatch(/al menos 8/i);
  });

  test("corta en 72, que es donde bcrypt deja de mirar", () => {
    const larga = "a".repeat(73);

    expect(
      validarPasswordNueva({ password: larga, confirmacion: larga }).password,
    ).toMatch(/72/);
  });

  test("exige que coincidan", () => {
    expect(
      validarPasswordNueva({ ...valida, confirmacion: "otraCosa123" })
        .confirmacion,
    ).toMatch(/no coinciden/i);
  });

  test("pide repetirla si falta", () => {
    expect(
      validarPasswordNueva({ ...valida, confirmacion: "" }).confirmacion,
    ).toMatch(/repetí/i);
  });
});
