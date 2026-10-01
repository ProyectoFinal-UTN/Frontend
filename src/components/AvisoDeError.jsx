import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  TIPO,
  clasificar,
  mensajeDe,
  pideRevisarPermisos,
} from "../services/errores";
import { refrescarPermisos } from "../services/permisos";

/**
 * Lo que se le muestra a alguien cuando la API dice que no (HU-32).
 *
 * Centraliza las dos decisiones que se repetían pantalla por pantalla: qué
 * texto poner y qué salida ofrecer. Ninguna pantalla vuelve a escribir el
 * mensaje de un 403 ni a comparar `fallo.status` para saber si desloguear.
 *
 * La regla que no se negocia: **un 403 nunca cierra la sesión.** El único caso
 * que manda al login es el 401. Ver `services/errores.js`.
 */

const CLASES_LINK = "font-bold underline";

export default function AvisoDeError({ fallo, alReintentar }) {
  // `fallo.tipo` lo pone `apiFetch`. Se reclasifica si no vino, para que el
  // componente sirva también con un error armado a mano en un test.
  const tipo = fallo?.tipo ?? clasificar(fallo);

  // Los permisos se releen al aparecer un 403 de rol: puede que se los hayan
  // cambiado hace un segundo, con la app abierta. Si es así, los botones que ya
  // no corresponden desaparecen solos, sin que la persona recargue nada.
  useEffect(() => {
    if (pideRevisarPermisos(tipo)) {
      refrescarPermisos();
    }
  }, [tipo]);

  if (!fallo) return null;

  if (tipo === TIPO.SESION) {
    return (
      <Recuadro tono="peligro" testId="aviso-sesion">
        <p>{fallo.message}</p>
        <Link to="/login" className={`mt-2 inline-block text-sm ${CLASES_LINK}`}>
          Volver a entrar
        </Link>
      </Recuadro>
    );
  }

  if (tipo === TIPO.SIN_COMERCIO || tipo === TIPO.ROL_INVALIDO) {
    return (
      <Recuadro tono="peligro" testId="aviso-cuenta">
        <p>{mensajeDe(tipo, fallo.message)}</p>
      </Recuadro>
    );
  }

  if (tipo === TIPO.PERMISO) {
    // En gris y no en rojo: que al rol no le toque una acción no es una falla
    // del sistema ni algo que la persona hizo mal. Y sin salida al login, que
    // es justamente el reflejo que hay que evitar.
    return (
      <Recuadro tono="apagado" testId="aviso-permiso">
        <p>{fallo.message}</p>
      </Recuadro>
    );
  }

  return (
    <Recuadro tono="peligro" testId="aviso-general">
      <p>{fallo.message}</p>
      {alReintentar && (
        <button
          type="button"
          onClick={alReintentar}
          className="mt-2 rounded-(--radius) bg-(--color-peligro) px-3 py-2
                     text-sm font-bold text-(--color-peligro-texto) transition
                     focus:outline-none focus:ring-4
                     focus:ring-(--color-primario-suave)"
        >
          Reintentar
        </button>
      )}
    </Recuadro>
  );
}

function Recuadro({ tono, testId, children }) {
  const clases =
    tono === "peligro"
      ? "bg-(--color-peligro-suave) text-(--color-peligro)"
      : "bg-(--color-apagado) text-(--color-texto)";

  return (
    <div
      role="alert"
      data-testid={testId}
      className={`rounded-(--radius) px-4 py-3 text-sm font-semibold ${clases}`}
    >
      {children}
    </div>
  );
}
