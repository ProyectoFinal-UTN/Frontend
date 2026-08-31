const BASE_URL = "/api";

/**
 * Única función que habla con el backend.
 *
 * Todo service pasa por acá y ninguna página llama a `fetch` directo. Así, si
 * cambia la forma de llegar al backend, se toca un solo lugar.
 *
 * La URL es siempre relativa: en desarrollo el proxy de Vite manda `/api/...`
 * a localhost:4000, y en producción apunta al backend en Render. Nunca
 * hardcodear el host.
 */
export async function apiFetch(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    // Sin esto la cookie de sesión no viaja cuando el front y el back están en
    // dominios distintos, que es exactamente lo que pasa en producción
    // (Vercel + Render). En desarrollo el proxy de Vite lo disimula.
    credentials: "include",
    // Va después del spread a propósito: si fuera antes, un `options.headers`
    // reemplazaría el objeto entero y se perdería el Content-Type.
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  // 204 y 205 no traen cuerpo; intentar parsearlos tira SyntaxError.
  const sinCuerpo = response.status === 204 || response.status === 205;
  const datos = sinCuerpo ? null : await response.json().catch(() => null);

  if (!response.ok) {
    // El backend responde `{ error: "..." }` con un mensaje pensado para
    // mostrarle a un comerciante. Se propaga ese, no un código pelado.
    const error = new Error(
      datos?.error || `No se pudo completar la operación (${response.status})`,
    );
    error.status = response.status;
    throw error;
  }

  return datos;
}
