const BASE_URL = "/api";

export async function apiFetch(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Error en la petición: ${response.status}`);
  }

  return response.json();
}