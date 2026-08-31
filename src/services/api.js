const BASE_URL = "/api";

export async function apiFetch(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    // Necesario para que la cookie de sesion de Better Auth viaje: en dev y
    // en Docker (todo detras de Nginx/el proxy de Vite) es same-origin y
    // funcionaria igual sin esto, pero en produccion real (Frontend en
    // Vercel, Backend en Render, dominios distintos) el navegador no manda
    // la cookie cross-origin sin `credentials: "include"`.
    credentials: "include",
    ...options,
  });

  if (!response.ok) {
    const error = new Error(`Error en la petición: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}