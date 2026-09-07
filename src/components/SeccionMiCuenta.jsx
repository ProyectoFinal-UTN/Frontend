import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  darDeBajaCuenta,
  descargarMisDatos,
  obtenerMisDatos,
} from "../services/datosPersonales";
import { refrescarSesion } from "../services/auth";

/**
 * Datos personales de quien está usando la app (HU-31, Ley 25.326).
 *
 * Es la única sección de esta pantalla que no habla del comercio sino de la
 * persona, así que no depende del rol: un empleado tiene exactamente los mismos
 * derechos sobre sus datos que el propietario.
 *
 * La ley 25.326 reconoce dos derechos y acá está uno al lado del otro:
 * el de acceso (saber y llevarse lo que el sistema guarda) y el de supresión
 * (pedir que se borre).
 */

/** Lo que hay que escribir para confirmar la baja. */
const PALABRA_DE_CONFIRMACION = "BAJA";

const CLASES_BOTON =
  "rounded-(--radius) px-4 py-3 text-base font-bold transition " +
  "focus:outline-none focus:ring-4 disabled:opacity-60";

export default function SeccionMiCuenta() {
  const navegar = useNavigate();

  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState("");

  const [confirmando, setConfirmando] = useState(false);
  const [escrito, setEscrito] = useState("");
  const [dandoDeBaja, setDandoDeBaja] = useState(false);
  const [errorBaja, setErrorBaja] = useState("");

  async function alDescargar() {
    setDescargando(true);
    setErrorDescarga("");

    try {
      descargarMisDatos(await obtenerMisDatos());
    } catch (fallo) {
      setErrorDescarga(fallo.message);
    } finally {
      setDescargando(false);
    }
  }

  async function alDarDeBaja() {
    setDandoDeBaja(true);
    setErrorBaja("");

    try {
      await darDeBajaCuenta();
    } catch (fallo) {
      // El caso esperado es el 409 de "sos el único propietario", que trae un
      // mensaje que ya explica qué hacer antes de volver a intentarlo.
      setErrorBaja(fallo.message);
      setDandoDeBaja(false);
      return;
    }

    // El backend ya borró las sesiones, pero el store de Better Auth todavía
    // cree que hay usuario. Sin este refresco, la pantalla siguiente entraría
    // con una cuenta que ya no existe.
    await refrescarSesion();
    navegar("/login", { replace: true });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-extrabold text-(--color-texto)">
          Mis datos
        </h2>
        <p className="mt-1 text-sm text-(--color-texto-apagado)">
          La Ley 25.326 te da derecho a saber qué guardamos de vos y a pedir que
          lo borremos. Las dos cosas se hacen desde acá.
        </p>
      </div>

      <section className="rounded-(--radius) border-2 border-(--color-borde) px-4 py-4">
        <h3 className="font-extrabold text-(--color-texto)">
          Descargar mis datos
        </h3>
        <p className="mt-1 text-sm text-(--color-texto-apagado)">
          Un archivo con los datos de tu cuenta, en qué comercios participás,
          tus sesiones abiertas y tu actividad registrada. No incluye tu
          contraseña: se guarda cifrada y no se puede recuperar.
        </p>

        {errorDescarga && (
          <p
            role="alert"
            className="mt-3 rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                       text-sm font-semibold text-(--color-peligro)"
          >
            {errorDescarga}
          </p>
        )}

        <button
          type="button"
          onClick={alDescargar}
          disabled={descargando}
          className={`${CLASES_BOTON} mt-4 bg-(--color-primario) text-(--color-primario-texto)
                      ring-(--color-primario-suave) hover:opacity-90`}
        >
          {descargando ? "Preparando el archivo…" : "Descargar mis datos"}
        </button>
      </section>

      <section className="rounded-(--radius) border-2 border-(--color-peligro) px-4 py-4">
        <h3 className="font-extrabold text-(--color-peligro)">
          Dar de baja mi cuenta
        </h3>
        <p className="mt-1 text-sm text-(--color-texto-apagado)">
          Se borran tu contraseña y tus sesiones, y tu nombre y tu correo dejan
          de figurar en el sistema. Los movimientos de stock que hayas
          registrado quedan en el libro del comercio, pero sin tu nombre: son
          del negocio, no tuyos, y sacarlos dejaría el stock sin explicación.
        </p>
        <p className="mt-2 text-sm font-bold text-(--color-texto)">
          No se puede deshacer.
        </p>

        {errorBaja && (
          <p
            role="alert"
            className="mt-3 rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                       text-sm font-semibold text-(--color-peligro)"
          >
            {errorBaja}
          </p>
        )}

        {!confirmando ? (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className={`${CLASES_BOTON} mt-4 bg-(--color-peligro-suave) text-(--color-peligro)
                        ring-(--color-peligro-suave) hover:opacity-90`}
          >
            Quiero darme de baja
          </button>
        ) : (
          // Se pide escribir una palabra en vez de un "¿estás seguro?": es la
          // única acción irreversible de la app, y un botón de más no alcanza
          // para distinguirla de un click al pasar.
          <div className="mt-4">
            <label
              htmlFor="confirmacion-baja"
              className="mb-1 block text-sm font-bold text-(--color-texto)"
            >
              Para confirmar, escribí {PALABRA_DE_CONFIRMACION}
            </label>
            <input
              id="confirmacion-baja"
              value={escrito}
              onChange={(evento) => setEscrito(evento.target.value)}
              autoComplete="off"
              className="w-full rounded-(--radius) border-2 border-(--color-borde)
                         bg-(--color-tarjeta) px-4 py-3 text-base text-(--color-texto)
                         outline-none transition focus:border-(--color-peligro)"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={alDarDeBaja}
                disabled={
                  dandoDeBaja ||
                  escrito.trim().toUpperCase() !== PALABRA_DE_CONFIRMACION
                }
                className={`${CLASES_BOTON} bg-(--color-peligro) text-(--color-peligro-texto)
                            ring-(--color-peligro-suave) hover:opacity-90`}
              >
                {dandoDeBaja ? "Dando de baja…" : "Dar de baja mi cuenta"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setConfirmando(false);
                  setEscrito("");
                  setErrorBaja("");
                }}
                className={`${CLASES_BOTON} bg-(--color-apagado) text-(--color-texto)
                            ring-(--color-primario-suave)`}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
