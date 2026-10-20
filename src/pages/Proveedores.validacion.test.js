import { describe, expect, test } from "vitest";
import { LARGOS_MAXIMOS, validarProveedor } from "./Proveedores.validacion";

describe("validarProveedor", () => {
  test("con solo el nombre no hay errores", () => {
    expect(validarProveedor({ nombre: "Distribuidora Sur" })).toEqual({});
  });

  test.each(["", "   ", undefined])("pide el nombre si viene %p", (nombre) => {
    expect(validarProveedor({ nombre })).toEqual({
      nombre: "Ingresá el nombre del proveedor.",
    });
  });

  test.each(Object.entries(LARGOS_MAXIMOS))(
    "%s acepta hasta %i caracteres y rechaza uno más",
    (campo, maximo) => {
      const base = { nombre: "X" };
      // El correo además tiene que tener formato de correo, así que se arma
      // uno válido del largo justo.
      const deLargo = (n) =>
        campo === "correo" ? `${"a".repeat(n - 6)}@x.com` : "a".repeat(n);

      expect(validarProveedor({ ...base, [campo]: deLargo(maximo) })[campo]).toBeUndefined();
      expect(validarProveedor({ ...base, [campo]: deLargo(maximo + 1) })[campo]).toMatch(
        String(maximo),
      );
    },
  );

  test("los topes coinciden con las columnas del backend", () => {
    expect(LARGOS_MAXIMOS).toEqual({
      nombre: 150,
      contacto: 150,
      telefono: 40,
      correo: 255,
      rubro: 100,
      condicionesPago: 255,
    });
  });

  test.each(["pedro", "pedro@", "pedro@lacteos", "@lacteos.com", "pedro @x.com"])(
    "rechaza el correo %p",
    (correo) => {
      expect(validarProveedor({ nombre: "X", correo }).correo).toMatch(/correo/i);
    },
  );

  test("acepta un correo válido, con espacios alrededor", () => {
    expect(validarProveedor({ nombre: "X", correo: " pedro@lacteos.com " })).toEqual({});
  });

  test("un correo vacío no es un error: es opcional", () => {
    expect(validarProveedor({ nombre: "X", correo: "" })).toEqual({});
  });
});
