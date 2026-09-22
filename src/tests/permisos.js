/**
 * Los permisos efectivos de cada rol, SOLO PARA TESTS.
 *
 * Es una copia congelada de lo que devuelve `permisosDe()` en
 * `Backend/src/lib/permissions.js`, capturada ejecutándola contra la branch de
 * HU-32. Existe para poder renderizar una pantalla como empleado sin levantar
 * el backend.
 *
 * **No es la matriz del Frontend y no se usa fuera de los tests.** En
 * producción los permisos salen siempre de `GET /api/configuracion`: este repo
 * no mantiene ninguna copia de qué puede cada rol. Si el backend cambia la
 * matriz, lo que se rompe es un test —que es justamente el aviso de que hay que
 * volver a mirar la UI— y no el comportamiento de la app.
 */

export const PERMISOS = Object.freeze({
  propietario: {
    member: ["create", "read", "update", "delete"],
    invitation: ["create", "cancel"],
    comercio: ["read", "update"],
    producto: ["create", "read", "update", "delete"],
    ubicacion: ["create", "read", "update", "delete"],
    proveedor: ["create", "read", "update", "delete"],
    movimiento: ["create", "read"],
    transferencia: ["create"],
    alerta: ["read", "update"],
    auditoria: ["read"],
    cuenta: ["read", "delete"],
  },

  // Opera el negocio completo pero no lo administra: ve el equipo en lectura,
  // no invita a nadie y no entra a la auditoría. `member: ["read"]` es la razón
  // por la que sí ve la pestaña Usuarios y sí recibe los correos del historial.
  gerente: {
    member: ["read"],
    comercio: ["read"],
    producto: ["create", "read", "update", "delete"],
    ubicacion: ["create", "read", "update", "delete"],
    proveedor: ["create", "read", "update", "delete"],
    movimiento: ["create", "read"],
    transferencia: ["create"],
    alerta: ["read", "update"],
    cuenta: ["read", "delete"],
  },

  // Registra movimientos y consulta. Ni `member`, ni `invitation`, ni
  // `auditoria`: los recursos sin ninguna acción no vienen en la respuesta, así
  // que el empleado ni se entera de que existen.
  empleado: {
    comercio: ["read"],
    producto: ["read"],
    ubicacion: ["read"],
    proveedor: ["read"],
    movimiento: ["create", "read"],
    transferencia: ["create"],
    alerta: ["read"],
    cuenta: ["read", "delete"],
  },
});

/** La respuesta de `GET /api/configuracion` para un rol, como la arma el backend. */
export function configuracionDe(rol, extra = {}) {
  return {
    nombre: "Almacén de prueba",
    moneda: "ARS",
    rol,
    permisos: PERMISOS[rol],
    ubicaciones: [],
    ...extra,
  };
}
