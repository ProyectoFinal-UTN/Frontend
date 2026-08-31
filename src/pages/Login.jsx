import { Link } from "react-router-dom";

/**
 * Inicio de sesión — pantalla de HU-2.
 *
 * El backend ya resuelve el login (`iniciarSesion` en services/auth.js está
 * listo); falta el formulario. Hasta entonces la ruta existe para no dejar
 * roto el link desde el registro.
 */
export default function Login() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-sm px-4 py-10">
      <h1 className="text-3xl font-extrabold text-(--color-texto)">
        Iniciar sesión
      </h1>
      <p className="mt-2 text-(--color-texto-apagado)">
        Esta pantalla se construye en HU-2.
      </p>
      <Link
        to="/registro"
        className="mt-6 inline-block font-bold text-(--color-primario) underline"
      >
        Crear una cuenta
      </Link>
    </main>
  );
}
