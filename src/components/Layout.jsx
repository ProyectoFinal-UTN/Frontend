import { Outlet } from "react-router-dom";
import Navegacion from "./Navegacion";
import { useAuth } from "../hooks/useAuth";

/**
 * Estructura común de las pantallas con sesión: navegación + contenido.
 *
 * Se usa como ruta de layout en `App` (sin path), envolviendo a las rutas
 * protegidas, y cada pantalla se dibuja en el `<Outlet />`.
 *
 * NO pone un `<main>`: cada pantalla ya tiene el suyo, y dos anidados romperían
 * la regla de un solo `main` por página —la que usan los lectores de pantalla
 * para saltar al contenido, y los E2E para acotar sus búsquedas—.
 *
 * Sin sesión dibuja solo el contenido: quien decide qué hacer en ese caso (ir
 * al login, esperar) es `RutaProtegida`, que vive adentro de cada ruta. Además
 * así la navegación no pregunta permisos sin sesión, que dejaría un 401
 * guardado en el store compartido de HU-32 (el mismo motivo por el que
 * `Asistente` está partido en dos).
 */
export default function Layout() {
  const { autenticado } = useAuth();

  if (!autenticado) {
    return <Outlet />;
  }

  return (
    <div className="lg:flex lg:items-start">
      <Navegacion />
      {/*
        Espacio para lo que flota encima del contenido, para que nunca tape un
        botón de la pantalla:
        - En celular, `pb-40`: la barra de navegación fija abajo y, arriba de
          ella, el botón del asistente. Así el final de cada pantalla se puede
          scrollear por encima de los dos.
        - En escritorio, `pr-24`: una franja a la derecha del ancho del botón
          del asistente (56 px más su margen). Sin ella, en una pantalla de
          1280 px el botón caía arriba del «Siguiente →» del historial.
        `min-w-0` para que una tabla ancha no empuje la sidebar afuera.
      */}
      <div className="min-w-0 flex-1 pb-40 lg:pr-24 lg:pb-0">
        <Outlet />
      </div>
    </div>
  );
}
