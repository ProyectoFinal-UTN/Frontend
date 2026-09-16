import { useCallback, useEffect, useRef, useState } from "react";
import {
  describirEvento,
  etiquetaDeAccion,
  etiquetaDeRecurso,
  obtenerAuditoria,
} from "../services/auditoria";

/**
 * Registro de accesos y acciones (HU-5).
 *
 * Solo lo ve el propietario. Si otro rol llega acá, el backend responde 403 y
 * se muestra ese mensaje: no hace falta esconder nada, porque la pestaña ya no
 * tiene sentido para quien no puede leerla.
 */

const CLASES_SELECT =
  "rounded-(--radius) border-2 border-(--color-borde) bg-(--color-tarjeta) " +
  "px-3 py-2 text-sm text-(--color-texto) outline-none transition " +
  "focus:border-(--color-primario)";

/** Fecha y hora en el formato que se lee acá, no el ISO del backend. */
function formatearFecha(iso) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SeccionAuditoria() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ accion: "", recurso: "" });

  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const cargar = useCallback(
    (seleccion) =>
      obtenerAuditoria(seleccion)
        .then((respuesta) => {
          if (!montado.current) return;
          setDatos(respuesta);
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
    cargar(filtros);
  }, [cargar, filtros]);

  if (cargando) {
    return <p className="text-(--color-texto-apagado)">Cargando registro…</p>;
  }

  if (error) {
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

  const { eventos, filtros: opciones } = datos;
  const hayFiltroPuesto = filtros.accion || filtros.recurso;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-extrabold text-(--color-texto)">
          Accesos y acciones
        </h2>
        <p className="mt-1 text-sm text-(--color-texto-apagado)">
          Quién entró y qué se modificó, del más reciente al más antiguo. El
          registro no se puede editar ni borrar.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div>
          <label
            htmlFor="filtro-accion"
            className="mb-1 block text-sm font-bold text-(--color-texto)"
          >
            Acción
          </label>
          <select
            id="filtro-accion"
            value={filtros.accion}
            onChange={(evento) =>
              setFiltros((previos) => ({
                ...previos,
                accion: evento.target.value,
              }))
            }
            className={CLASES_SELECT}
          >
            <option value="">Todas</option>
            {opciones.acciones.map((accion) => (
              <option key={accion} value={accion}>
                {etiquetaDeAccion(accion)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="filtro-recurso"
            className="mb-1 block text-sm font-bold text-(--color-texto)"
          >
            Sobre qué
          </label>
          <select
            id="filtro-recurso"
            value={filtros.recurso}
            onChange={(evento) =>
              setFiltros((previos) => ({
                ...previos,
                recurso: evento.target.value,
              }))
            }
            className={CLASES_SELECT}
          >
            <option value="">Todo</option>
            {opciones.recursos.map((recurso) => (
              <option key={recurso} value={recurso}>
                {etiquetaDeRecurso(recurso)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {eventos.length === 0 ? (
        <p className="rounded-(--radius) bg-(--color-apagado) px-4 py-3 text-sm text-(--color-texto-apagado)">
          {hayFiltroPuesto
            ? "No hay nada que coincida con ese filtro."
            : "Todavía no hay actividad registrada."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {eventos.map((evento) => (
            <li
              key={evento.id}
              className="flex flex-col gap-1 rounded-(--radius) border-2 border-(--color-borde) px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-bold text-(--color-texto)">
                  {describirEvento(evento)}
                </p>
                <p className="truncate text-sm text-(--color-texto-apagado)">
                  {evento.usuarioCorreo ?? "Usuario dado de baja"}
                </p>
              </div>

              <time
                dateTime={evento.fecha}
                className="shrink-0 text-sm tabular-nums text-(--color-texto-apagado)"
              >
                {formatearFecha(evento.fecha)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
