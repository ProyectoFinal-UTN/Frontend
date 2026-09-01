import { useState } from "react";
import {
  MONEDAS,
  cambiarMoneda,
  crearUbicacion,
  eliminarUbicacion,
  renombrarUbicacion,
} from "../services/configuracion";

/**
 * Ubicaciones de stock y moneda del negocio (HU-8).
 *
 * Cubre los dos criterios de aceptación: definir las ubicaciones donde se
 * guarda el stock, y que el cambio se refleje enseguida en el resto. Por eso
 * cada operación recarga la configuración desde el servidor en vez de
 * adivinar el estado nuevo: lo que se ve es lo que hay.
 */

const CLASES_INPUT =
  "w-full rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) " +
  "px-4 py-3 text-base text-(--color-texto) outline-none transition " +
  "focus:border-(--color-primario)";

const CLASES_BOTON_SUAVE =
  "rounded-(--radius) px-3 py-2 text-sm font-bold transition " +
  "focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave)";

/**
 * Una fila de la lista, que alterna entre ver, renombrar y confirmar borrado.
 *
 * `guardando` viene de arriba para deshabilitar los botones mientras hay una
 * operación en curso. Sin eso, un doble clic en «Sí, eliminar» manda dos DELETE
 * y el segundo vuelve con un 404 confuso sobre una fila que ya no existe.
 */
function FilaUbicacion({ ubicacion, alRenombrar, alEliminar, guardando }) {
  const [modo, setModo] = useState("ver");
  const [nombre, setNombre] = useState(ubicacion.nombre);

  if (modo === "confirmar") {
    return (
      <li className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3">
        <p className="text-sm font-bold text-(--color-peligro)">
          ¿Eliminar «{ubicacion.nombre}»?
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={guardando}
            onClick={() => alEliminar(ubicacion.id)}
            className={`${CLASES_BOTON_SUAVE} bg-(--color-peligro) text-(--color-peligro-texto) disabled:opacity-60`}
          >
            Sí, eliminar
          </button>
          <button
            type="button"
            onClick={() => setModo("ver")}
            className={`${CLASES_BOTON_SUAVE} bg-(--color-tarjeta) text-(--color-texto)`}
          >
            Cancelar
          </button>
        </div>
      </li>
    );
  }

  if (modo === "editar") {
    return (
      <li className="rounded-(--radius) border-2 border-(--color-borde) px-4 py-3">
        <form
          onSubmit={async (evento) => {
            evento.preventDefault();
            // Solo se cierra la edición si el backend aceptó. Si rechaza (por
            // ejemplo, nombre repetido), la fila volvía a "ver" mostrando el
            // nombre viejo y parecía que ni se había intentado.
            if (await alRenombrar(ubicacion.id, nombre)) {
              setModo("ver");
            }
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <label htmlFor={`nombre-${ubicacion.id}`} className="sr-only">
            Nuevo nombre de {ubicacion.nombre}
          </label>
          <input
            id={`nombre-${ubicacion.id}`}
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            className={CLASES_INPUT}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={guardando}
              className={`${CLASES_BOTON_SUAVE} bg-(--color-primario) text-(--color-primario-texto) disabled:opacity-60`}
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setNombre(ubicacion.nombre);
                setModo("ver");
              }}
              className={`${CLASES_BOTON_SUAVE} bg-(--color-apagado) text-(--color-texto)`}
            >
              Cancelar
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li
      className="flex items-center justify-between gap-3 rounded-(--radius)
                 border-2 border-(--color-borde) px-4 py-3"
    >
      <span className="font-bold text-(--color-texto)">{ubicacion.nombre}</span>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          disabled={guardando}
          onClick={() => setModo("editar")}
          aria-label={`Renombrar ${ubicacion.nombre}`}
          className={`${CLASES_BOTON_SUAVE} text-(--color-primario) disabled:opacity-60`}
        >
          Renombrar
        </button>
        <button
          type="button"
          disabled={guardando}
          onClick={() => setModo("confirmar")}
          aria-label={`Eliminar ${ubicacion.nombre}`}
          className={`${CLASES_BOTON_SUAVE} text-(--color-peligro) disabled:opacity-60`}
        >
          Eliminar
        </button>
      </div>
    </li>
  );
}

export default function SeccionUbicaciones({ configuracion, alRecargar }) {
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  /**
   * Corre una operación contra el backend y recarga.
   * Los mensajes de error salen del backend, que ya los redacta pensando en un
   * comerciante ("Ya existe una ubicación llamada..."), así que se muestran
   * tal cual en vez de inventar uno nuevo.
   */
  async function ejecutar(operacion) {
    setError("");
    setGuardando(true);

    try {
      await operacion();
      await alRecargar();
      return true;
    } catch (fallo) {
      setError(fallo.message);
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function agregar(evento) {
    evento.preventDefault();

    const nombre = nuevoNombre.trim();

    if (!nombre) {
      setError("Escribí un nombre para la ubicación.");
      return;
    }

    const ok = await ejecutar(() => crearUbicacion(nombre));
    if (ok) {
      setNuevoNombre("");
    }
  }

  const { ubicaciones, moneda } = configuracion;

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-xl font-extrabold text-(--color-texto)">
          Ubicaciones de stock
        </h2>
        <p className="mt-1 text-sm text-(--color-texto-apagado)">
          Los lugares donde guardás mercadería, por ejemplo el local y el
          depósito. Vas a poder elegir entre estos al registrar un movimiento.
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

        {ubicaciones.length === 0 ? (
          <p className="mt-4 rounded-(--radius) bg-(--color-apagado) px-4 py-3 text-sm text-(--color-texto-apagado)">
            Todavía no cargaste ninguna ubicación.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {ubicaciones.map((ubicacion) => (
              <FilaUbicacion
                key={ubicacion.id}
                ubicacion={ubicacion}
                guardando={guardando}
                alRenombrar={(id, nombre) =>
                  ejecutar(() => renombrarUbicacion(id, nombre.trim()))
                }
                alEliminar={(id) => ejecutar(() => eliminarUbicacion(id))}
              />
            ))}
          </ul>
        )}

        <form onSubmit={agregar} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="nueva-ubicacion" className="sr-only">
            Nombre de la ubicación
          </label>
          <input
            id="nueva-ubicacion"
            value={nuevoNombre}
            onChange={(evento) => setNuevoNombre(evento.target.value)}
            placeholder="Depósito"
            className={CLASES_INPUT}
          />
          <button
            type="submit"
            disabled={guardando}
            className="shrink-0 rounded-(--radius) bg-(--color-primario) px-5 py-3
                       font-bold text-(--color-primario-texto) transition
                       hover:opacity-90 focus:outline-none focus:ring-4
                       focus:ring-(--color-primario-suave) disabled:opacity-60"
          >
            Agregar
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-xl font-extrabold text-(--color-texto)">Moneda</h2>
        <p className="mt-1 text-sm text-(--color-texto-apagado)">
          Con la que se muestran los precios y los totales del negocio.
        </p>

        <label htmlFor="moneda" className="sr-only">
          Moneda del negocio
        </label>
        <select
          id="moneda"
          value={moneda}
          disabled={guardando}
          onChange={(evento) =>
            ejecutar(() => cambiarMoneda(evento.target.value))
          }
          className={`${CLASES_INPUT} mt-4 sm:max-w-xs`}
        >
          {MONEDAS.map(({ codigo, nombre }) => (
            <option key={codigo} value={codigo}>
              {codigo} — {nombre}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}
