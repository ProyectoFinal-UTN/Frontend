import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Cada test arranca con el DOM limpio, sin restos del anterior.
afterEach(async () => {
  cleanup();

  // Y sin los permisos del anterior: el store de HU-32 es de módulo, así que
  // sobrevive al desmontaje. Sin esto, un test que renderiza como empleado
  // dejaría esos permisos puestos para el que sigue.
  //
  // El import va acá adentro y no arriba a propósito. Un import estático en el
  // setup materializa `services/permisos` —y con él `services/configuracion`,
  // que es su dependencia— ANTES de que corra el `vi.mock` del archivo de test.
  // Vitest le arma entonces al test su propia copia del store con la versión
  // mockeada, y el setup se queda limpiando la otra: el componente terminaba
  // pegándole de verdad a `/api/configuracion`. Importándolo acá se resuelve
  // contra el mismo registro que ya vio el mock.
  const { olvidarPermisos } = await import("../services/permisos");
  olvidarPermisos();
});
