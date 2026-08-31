import { apiFetch } from "./api";

/**
 * Busca un producto por código de barras en el comercio del usuario logueado.
 *
 * Un 404 del backend significa "código nuevo, no es un error" — se traduce
 * en `null` para que la página lo use como señal de "ofrecer alta", no como
 * excepción a mostrar.
 */
export async function buscarProductoPorCodigoBarras(codigo) {
  try {
    const { producto } = await apiFetch(`/productos/codigo-barras/${codigo}`);
    return producto;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}
