const OFF_URL = "https://world.openfoodfacts.org/api/v2/product";
const TIMEOUT_MS = 4000;

/**
 * Sugerencia opcional para precargar el alta de un producto que no existe en
 * el comercio: le pregunta a Open Food Facts (base pública, sin API key) si
 * conoce ese código de barras.
 *
 * A propósito no pasa por `api.js` (eso es solo para nuestro backend) y a
 * propósito nunca lanza: es best-effort. Un timeout, un error de red, un 5xx
 * de Open Food Facts o que el código tampoco exista ahí resuelven todos en
 * `null` — el flujo de "código nuevo -> ofrecer alta" del comercio no puede
 * depender de que un servicio externo esté arriba.
 */
export async function buscarSugerenciaExterna(codigo) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const params = "fields=product_name,brands,categories,image_front_url";
    const response = await fetch(`${OFF_URL}/${codigo}.json?${params}`, {
      signal: controller.signal,
    });
    const data = await response.json();

    if (data.status !== 1) return null;

    return {
      nombre: data.product.product_name || null,
      marca: data.product.brands || null,
      categoria: data.product.categories || null,
      imagenUrl: data.product.image_front_url || null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
