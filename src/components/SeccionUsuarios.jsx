import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROLES,
  cambiarRol,
  cancelarInvitacion,
  etiquetaDeRol,
  invitar,
  linkDeInvitacion,
  obtenerEquipo,
  quitarMiembro,
} from "../services/miembros";

/**
 * Equipo del comercio y sus roles (HU-4).
 *
 * Solo el propietario puede modificar; el gerente ve la lista en modo lectura
 * y el empleado ni siquiera llega acá, porque el backend le responde 403 al
 * pedir los datos.
 */

const CLASES_INPUT =
  "w-full rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) " +
  "px-4 py-3 text-base text-(--color-texto) outline-none transition " +
  "focus:border-(--color-primario)";

const CLASES_BOTON_SUAVE =
  "rounded-(--radius) px-3 py-2 text-sm font-bold transition " +
  "focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave) " +
  "disabled:opacity-60";

/** Copia al portapapeles y avisa, con respaldo si el navegador no deja. */
function BotonCopiar({ texto }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles (pasa en HTTP sin localhost). El link está
      // igual a la vista para copiarlo a mano, así que no es un error que
      // valga la pena mostrar.
      setCopiado(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className={`${CLASES_BOTON_SUAVE} shrink-0 bg-(--color-primario) text-(--color-primario-texto)`}
    >
      {copiado ? "¡Copiado!" : "Copiar"}
    </button>
  );
}

/** Una fila del equipo. */
function FilaMiembro({ miembro, puedeEditar, esUnoMismo, ocupado, alCambiarRol, alQuitar }) {
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <li className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3">
        <p className="text-sm font-bold text-(--color-peligro)">
          ¿Sacar a {miembro.nombre} del comercio?
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => alQuitar(miembro.id)}
            className={`${CLASES_BOTON_SUAVE} bg-(--color-peligro) text-(--color-peligro-texto)`}
          >
            Sí, sacarlo
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className={`${CLASES_BOTON_SUAVE} bg-(--color-tarjeta) text-(--color-texto)`}
          >
            Cancelar
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 rounded-(--radius) border-2 border-(--color-borde) px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-bold text-(--color-texto)">
          {miembro.nombre}
          {esUnoMismo && (
            <span className="ml-2 text-sm font-normal text-(--color-texto-apagado)">
              (vos)
            </span>
          )}
        </p>
        <p className="truncate text-sm text-(--color-texto-apagado)">
          {miembro.correo}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/*
          Nadie puede cambiarse el rol a sí mismo: un propietario que se baja
          por error se deja afuera de la administración sin vuelta atrás. El
          backend lo rechaza igual; acá se evita ofrecerlo.
        */}
        {puedeEditar && !esUnoMismo ? (
          <>
            <label htmlFor={`rol-${miembro.id}`} className="sr-only">
              Rol de {miembro.nombre}
            </label>
            <select
              id={`rol-${miembro.id}`}
              value={miembro.rol}
              disabled={ocupado}
              onChange={(evento) => alCambiarRol(miembro.id, evento.target.value)}
              className={`${CLASES_INPUT} py-2 text-sm sm:w-auto`}
            >
              {ROLES.map((rol) => (
                <option key={rol.id} value={rol.id}>
                  {rol.etiqueta}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setConfirmando(true)}
              aria-label={`Sacar a ${miembro.nombre}`}
              className={`${CLASES_BOTON_SUAVE} text-(--color-peligro)`}
            >
              Sacar
            </button>
          </>
        ) : (
          <span className="rounded-(--radius) bg-(--color-apagado) px-3 py-1.5 text-sm font-bold text-(--color-texto-apagado)">
            {etiquetaDeRol(miembro.rol)}
          </span>
        )}
      </div>
    </li>
  );
}

export default function SeccionUsuarios({ rol, usuarioId }) {
  const puedeEditar = rol === "propietario";

  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const [correo, setCorreo] = useState("");
  const [rolNuevo, setRolNuevo] = useState("empleado");
  const [reciente, setReciente] = useState(null);

  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const cargar = useCallback(
    () =>
      obtenerEquipo()
        .then((equipo) => {
          if (!montado.current) return;
          setDatos(equipo);
          setError("");
        })
        .catch((fallo) => {
          if (montado.current) setError(fallo.message);
        })
        .finally(() => {
          if (montado.current) setCargando(false);
        }),
    [],
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Corre una operación y recarga, mostrando el mensaje del backend si falla. */
  async function ejecutar(operacion) {
    setError("");
    setOcupado(true);

    try {
      const resultado = await operacion();
      await cargar();
      return resultado;
    } catch (fallo) {
      setError(fallo.message);
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function alInvitar(evento) {
    evento.preventDefault();

    if (!correo.trim()) {
      setError("Ingresá el correo de la persona que querés invitar.");
      return;
    }

    const creada = await ejecutar(() =>
      invitar({ correo: correo.trim(), rol: rolNuevo }),
    );

    if (creada) {
      setCorreo("");
      setReciente(creada);
    }
  }

  if (cargando) {
    return <p className="text-(--color-texto-apagado)">Cargando equipo…</p>;
  }

  if (error && !datos) {
    return (
      <p
        role="alert"
        className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                   text-sm font-semibold text-(--color-peligro)"
      >
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-xl font-extrabold text-(--color-texto)">Equipo</h2>
        <p className="mt-1 text-sm text-(--color-texto-apagado)">
          Quiénes trabajan en el comercio y qué puede hacer cada uno.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                       text-sm font-semibold text-(--color-peligro)"
          >
            {error}
          </p>
        )}

        <ul className="mt-4 flex flex-col gap-2">
          {datos.miembros.map((miembro) => (
            <FilaMiembro
              key={miembro.id}
              miembro={miembro}
              puedeEditar={puedeEditar}
              esUnoMismo={miembro.userId === usuarioId}
              ocupado={ocupado}
              alCambiarRol={(id, nuevo) => ejecutar(() => cambiarRol(id, nuevo))}
              alQuitar={(id) => ejecutar(() => quitarMiembro(id))}
            />
          ))}
        </ul>

        {!puedeEditar && (
          <p className="mt-4 text-sm text-(--color-texto-apagado)">
            Solo el propietario puede cambiar roles o invitar gente.
          </p>
        )}
      </section>

      {puedeEditar && (
        <section>
          <h2 className="text-xl font-extrabold text-(--color-texto)">
            Invitar a alguien
          </h2>
          <p className="mt-1 text-sm text-(--color-texto-apagado)">
            Se genera un link que le pasás como quieras. Vence a las 48 horas.
          </p>

          <form onSubmit={alInvitar} noValidate className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <label htmlFor="correo-invitado" className="sr-only">
                  Correo de la persona
                </label>
                <input
                  id="correo-invitado"
                  type="email"
                  inputMode="email"
                  value={correo}
                  onChange={(evento) => setCorreo(evento.target.value)}
                  placeholder="empleado@correo.com"
                  className={CLASES_INPUT}
                />
              </div>

              <label htmlFor="rol-invitado" className="sr-only">
                Rol que va a tener
              </label>
              <select
                id="rol-invitado"
                value={rolNuevo}
                onChange={(evento) => setRolNuevo(evento.target.value)}
                className={`${CLASES_INPUT} sm:w-auto`}
              >
                {ROLES.map((rol) => (
                  <option key={rol.id} value={rol.id}>
                    {rol.etiqueta}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={ocupado}
                className="shrink-0 rounded-(--radius) bg-(--color-primario) px-5 py-3
                           font-bold text-(--color-primario-texto) transition
                           hover:opacity-90 focus:outline-none focus:ring-4
                           focus:ring-(--color-primario-suave) disabled:opacity-60"
              >
                Invitar
              </button>
            </div>

            <p className="text-sm text-(--color-texto-apagado)">
              {ROLES.find((r) => r.id === rolNuevo)?.descripcion}
            </p>
          </form>

          {reciente && (
            <div
              role="status"
              className="mt-4 rounded-(--radius) bg-(--color-exito-suave) px-4 py-3"
            >
              <p className="text-sm font-bold text-(--color-exito)">
                Listo. Pasale este link a {reciente.correo}:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-(--radius) bg-(--color-tarjeta) px-3 py-2 text-sm text-(--color-texto)">
                  {linkDeInvitacion(reciente.id)}
                </code>
                <BotonCopiar texto={linkDeInvitacion(reciente.id)} />
              </div>
            </div>
          )}
        </section>
      )}

      {puedeEditar && datos.invitaciones.length > 0 && (
        <section>
          <h2 className="text-xl font-extrabold text-(--color-texto)">
            Invitaciones sin usar
          </h2>

          <ul className="mt-4 flex flex-col gap-2">
            {datos.invitaciones.map((invitacion) => (
              <li
                key={invitacion.id}
                className="flex flex-col gap-3 rounded-(--radius) border-2 border-(--color-borde) px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-(--color-texto)">
                    {invitacion.correo}
                  </p>
                  <p className="text-sm text-(--color-texto-apagado)">
                    {etiquetaDeRol(invitacion.rol)} · vence el{" "}
                    {new Date(invitacion.venceEl).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <BotonCopiar texto={linkDeInvitacion(invitacion.id)} />
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() =>
                      ejecutar(() => cancelarInvitacion(invitacion.id))
                    }
                    aria-label={`Cancelar la invitación a ${invitacion.correo}`}
                    className={`${CLASES_BOTON_SUAVE} text-(--color-peligro)`}
                  >
                    Cancelar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
