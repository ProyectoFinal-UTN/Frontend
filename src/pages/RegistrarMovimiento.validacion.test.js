import { describe, expect, test } from "vitest";
import {
  MAXIMO_ENTERO,
  validarMovimiento,
} from "./RegistrarMovimiento.validacion";

/** Un formulario completo y válido, tal como sale de los inputs: todo string. */
const VALIDO = {
  productoId: "11111111-1111-4111-8111-111111111111",
  tipo: "venta",
  sentido: "",
  cantidad: "3",
  ubicacionId: "",
};

describe("Campos obligatorios", () => {
  test("no encuentra problemas en un formulario completo", () => {
    expect(validarMovimiento(VALIDO)).toEqual({});
  });

  test("pide elegir el producto", () => {
    const errores = validarMovimiento({ ...VALIDO, productoId: "" });

    expect(errores.productoId).toMatch(/elegí el producto/i);
  });

  test("pide elegir el tipo", () => {
    const errores = validarMovimiento({ ...VALIDO, tipo: "" });

    expect(errores.tipo).toMatch(/tipo de movimiento/i);
  });

  test("rechaza un tipo que el backend no acepta", () => {
    // `transferencia` existe en la tabla pero este endpoint lo rechaza: esos
    // movimientos los crea el flujo de HU-12, en pares ligados.
    const errores = validarMovimiento({ ...VALIDO, tipo: "transferencia" });

    expect(errores.tipo).toBeDefined();
  });
});

describe("Sentido del ajuste", () => {
  test("lo exige cuando el tipo es ajuste", () => {
    const errores = validarMovimiento({ ...VALIDO, tipo: "ajuste" });

    expect(errores.sentido).toMatch(/suma o resta/i);
  });

  test("lo acepta cuando viene", () => {
    const errores = validarMovimiento({
      ...VALIDO,
      tipo: "ajuste",
      sentido: "salida",
    });

    expect(errores).toEqual({});
  });

  test("no lo pide en los otros tipos, que ya tienen el signo decidido", () => {
    for (const tipo of ["compra", "venta", "merma"]) {
      expect(validarMovimiento({ ...VALIDO, tipo }).sentido).toBeUndefined();
    }
  });
});

describe("Cantidad", () => {
  test("la pide", () => {
    expect(validarMovimiento({ ...VALIDO, cantidad: "" }).cantidad).toMatch(
      /cuántas unidades/i,
    );
  });

  test("rechaza el cero: un movimiento de 0 no mueve nada", () => {
    expect(validarMovimiento({ ...VALIDO, cantidad: "0" }).cantidad).toMatch(
      /al menos 1/i,
    );
  });

  test("rechaza decimales, signos y notacion cientifica", () => {
    // `Number` aceptaría "1e3", " 5 " y "-2"; el backend no, así que tampoco acá.
    for (const valor of ["1.5", "-2", "1e3", "0x10", "tres", " "]) {
      expect(validarMovimiento({ ...VALIDO, cantidad: valor }).cantidad)
        .toBeDefined();
    }
  });

  test("rechaza pasarse del maximo que soporta la columna", () => {
    const errores = validarMovimiento({
      ...VALIDO,
      cantidad: String(MAXIMO_ENTERO + 1),
    });

    expect(errores.cantidad).toMatch(/no puede superar/i);
  });

  test("acepta el maximo exacto", () => {
    const errores = validarMovimiento({
      ...VALIDO,
      cantidad: String(MAXIMO_ENTERO),
    });

    expect(errores.cantidad).toBeUndefined();
  });
});

describe("Ubicacion", () => {
  test("no la pide cuando el comercio tiene una sola", () => {
    // Con una sola ubicación el campo ni se muestra: la resuelve el backend.
    const errores = validarMovimiento(VALIDO, { pideUbicacion: false });

    expect(errores.ubicacionId).toBeUndefined();
  });

  test("la exige cuando hay mas de una", () => {
    const errores = validarMovimiento(VALIDO, { pideUbicacion: true });

    expect(errores.ubicacionId).toMatch(/elegí/i);
  });

  test("la da por buena cuando viene elegida", () => {
    const errores = validarMovimiento(
      { ...VALIDO, ubicacionId: "22222222-2222-4222-8222-222222222222" },
      { pideUbicacion: true },
    );

    expect(errores).toEqual({});
  });
});
