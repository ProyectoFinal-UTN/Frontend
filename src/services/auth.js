import { createAuthClient } from "better-auth/react";

/**
 * Autenticación: única puerta entre las páginas y Better Auth.
 *
 * Better Auth trae su propio cliente con su propio fetch, así que no pasa por
 * `api.js` como el resto de los services. Se lo envuelve acá para que la regla
 * que sí importa se mantenga: ninguna página habla con la API directamente,
 * todas pasan por un service. El cliente no se exporta.
 *
 * A cambio de la excepción nos llevamos la sesión reactiva de Better Auth, que
 * es lo que `useAuth` necesita para saber si hay usuario sin escribirlo a mano.
 */
const cliente = createAuthClient({
  // Ruta relativa a propósito: en desarrollo el proxy de Vite la manda a
  // localhost:4000, y en producción apunta al backend de Render. Nunca
  // hardcodear la URL del backend.
  basePath: "/api/auth",
});

/** Hook de sesión de Better Auth, para que `useAuth` no importe el cliente. */
export const useSesion = cliente.useSession;

/**
 * Espera a que el store de sesión refleje el cambio antes de devolver.
 *
 * Hace falta por cómo Better Auth propaga la sesión: cuando el login responde,
 * la actualización del store se dispara con un `setTimeout(..., 10)` interno
 * (lo hace para evitar carreras propias). En ese hueco de 10 ms el store sigue
 * diciendo que no hay sesión.
 *
 * Sin esta espera, la pantalla navegaba apenas respondía el login, y
 * `RutaProtegida` leía el store viejo y rebotaba de vuelta al formulario: había
 * que apretar "Entrar" dos veces para pasar. Lo mismo pasaba tras registrarse.
 *
 * `refetch` viene en el valor del propio atom y actualiza el store al resolver,
 * así que esperarlo garantiza que quien navegue después vea la sesión real.
 */
async function esperarSesionActualizada() {
  try {
    await cliente.$store.atoms.session.get().refetch();
  } catch {
    // Si el refresco falla, la sesión ya quedó creada igual: no tiene sentido
    // hacer fallar el login por esto. La pantalla siguiente la resolverá.
  }
}

/**
 * Traduce los errores del backend a algo que se le pueda mostrar a un
 * comerciante. Sin esto la pantalla mostraría "User already exists. Use
 * another email." en inglés y con jerga.
 */
function traducirError(error) {
  if (!error) {
    return "No se pudo completar la operación. Probá de nuevo.";
  }

  if (error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
    return "Ese correo ya está registrado. Probá iniciar sesión.";
  }

  if (error.code === "INVALID_EMAIL_OR_PASSWORD") {
    return "El correo o la contraseña no son correctos.";
  }

  if (error.code === "PASSWORD_TOO_SHORT") {
    return "La contraseña debe tener al menos 8 caracteres.";
  }

  if (error.code === "PASSWORD_TOO_LONG") {
    return "La contraseña es demasiado larga. El máximo son 72 caracteres.";
  }

  if (error.status === 0 || error.status === undefined) {
    return "No pudimos conectarnos con el servidor. Revisá tu conexión.";
  }

  return error.message || "No se pudo completar la operación. Probá de nuevo.";
}

/**
 * Registra un comerciante y lo deja con la sesión iniciada (HU-1).
 *
 * El backend, además de la cuenta, le crea el comercio y le asigna el rol
 * `propietario`. El nombre sale de la parte local del correo porque el
 * formulario solo pide correo y contraseña; el perfil real del negocio se
 * carga en HU-6.
 *
 * @returns {Promise<{ok: true, usuario: object} | {ok: false, error: string}>}
 */
export async function registrar({ correo, password, invitacionId }) {
  const { data, error } = await cliente.signUp.email({
    email: correo,
    password,
    name: correo.split("@")[0],
    // Cuando el alta viene de un link de invitación (HU-4), el backend suma a
    // la persona al comercio que la invitó en vez de crearle uno propio.
    ...(invitacionId ? { invitacionId } : {}),
  });

  if (error) {
    return { ok: false, error: traducirError(error) };
  }

  await esperarSesionActualizada();

  return { ok: true, usuario: data.user };
}

/** Inicia sesión con correo y contraseña (HU-2). */
export async function iniciarSesion({ correo, password }) {
  const { data, error } = await cliente.signIn.email({
    email: correo,
    password,
  });

  if (error) {
    return { ok: false, error: traducirError(error) };
  }

  await esperarSesionActualizada();

  return { ok: true, usuario: data.user };
}

/** Cierra la sesión activa. */
export async function cerrarSesion() {
  const { error } = await cliente.signOut();

  if (error) {
    return { ok: false, error: traducirError(error) };
  }

  await esperarSesionActualizada();

  return { ok: true };
}
