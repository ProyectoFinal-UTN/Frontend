import { useEffect, useState } from "react";
import AvisoDeError from "./AvisoDeError";
import Campo from "./Campo";
import { actualizarUmbral, obtenerUmbral } from "../services/productos";
import { validarEntero } from "../pages/Productos.validacion";

/**
 * Umbral mínimo de reposición de un producto (HU-16).
 *
 * Usa sus propios endpoints (`/productos/:id/umbral`) y no el PUT de la ficha
 * completa: así cambiar el umbral no obliga a reenviar nombre, código y
 * categoría, y el formulario de HU-9 sigue tal cual.
 *
 * `puedeEditar` viene de la página, igual que en `SeccionProductos`, para que
 * el componente se pueda probar sin montar el store de permisos. Quien no lo
 * tiene (el empleado) ve el valor pero no el formulario.
 */

/**
 * El 404 del backend no dice si el producto no existe, se dio de baja o es de
 * otro comercio (a propósito). Para quien está mirando la ficha da igual: el
 * producto ya no está.
 */
function paraMostrar(fallo) {
  if (fallo?.status !== 404) return fallo;

  const noEncontrado = new Error("Ese producto ya no existe.");
  noEncontrado.status = 404;
  return noEncontrado;
}

export default function UmbralReposicion({ productoId, puedeEditar = false }) {
  const [umbral, setUmbral] = useState(null);
  const [valor, setValor] = useState("");
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [errorCampo, setErrorCampo] = useState("");
  const [fallo, setFallo] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    // Si cambian de producto o se va de la pantalla antes de que vuelva la
    // respuesta, esa respuesta ya no le corresponde a nadie.
    let vigente = true;

    obtenerUmbral(productoId)
      .then((datos) => {
        if (!vigente) return;
        setUmbral(datos.umbralMinimo);
        setValor(String(datos.umbralMinimo));
        setErrorCarga(null);
      })
      .catch((error) => {
        if (vigente) setErrorCarga(paraMostrar(error));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [productoId]);

  function alEscribir(evento) {
    setValor(evento.target.value);
    setErrorCampo("");
    setFallo(null);
    setMensaje("");
  }

  async function guardar(evento) {
    evento.preventDefault();

    const error = validarEntero(valor);
    if (error) {
      setErrorCampo(error);
      return;
    }

    setFallo(null);
    setMensaje("");
    setGuardando(true);

    try {
      const datos = await actualizarUmbral(productoId, Number(valor));
      setUmbral(datos.umbralMinimo);
      setValor(String(datos.umbralMinimo));
      setMensaje("Umbral actualizado.");
    } catch (error) {
      // El 400 es sobre lo que se tipeó: va pegado al campo, con el mensaje
      // del backend tal cual (la validación de acá espeja la de allá, pero el
      // que decide es el backend).
      if (error.status === 400) {
        setErrorCampo(error.message);
      } else {
        setFallo(paraMostrar(error));
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section
      aria-labelledby="titulo-umbral"
      className="mb-6 rounded-(--radius) border-2 border-(--color-borde) px-4 py-3"
    >
      <h2
        id="titulo-umbral"
        className="font-extrabold text-(--color-texto)"
      >
        Umbral de reposición
      </h2>

      {cargando && (
        <p className="mt-1 text-sm text-(--color-texto-apagado)">
          Cargando umbral…
        </p>
      )}

      {!cargando && errorCarga && (
        <div className="mt-2">
          <AvisoDeError fallo={errorCarga} />
        </div>
      )}

      {!cargando && !errorCarga && (
        <>
          {/*
            Un 0 en la base es "sin umbral", no "avisar al llegar a 0": así lo
            trata el backend al buscar qué reponer (`umbralMinimo > 0`).
          */}
          <p data-testid="umbral-actual" className="mt-1 text-sm text-(--color-texto)">
            {umbral === 0 ? (
              "Sin umbral configurado."
            ) : (
              <>
                Se considera para reponer cuando el stock total llega a{" "}
                <strong>{umbral}</strong> o menos.
              </>
            )}
          </p>

          {mensaje && (
            <p
              role="status"
              className="mt-3 rounded-(--radius) bg-(--color-exito-suave) px-4 py-3
                         text-sm font-semibold text-(--color-exito)"
            >
              {mensaje}
            </p>
          )}

          {fallo && (
            <div className="mt-3">
              <AvisoDeError fallo={fallo} />
            </div>
          )}

          {puedeEditar && (
            // `noValidate`: con `min="0"` el navegador frenaría solo el "-1" o
            // el "2.5" antes de llegar a `guardar`, y se vería su globito en
            // vez del mensaje de acá. Mismo motivo que en `SeccionProductos`.
            <form
              onSubmit={guardar}
              noValidate
              aria-label="Configurar umbral de reposición"
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start"
            >
              <div className="flex-1">
                <Campo
                  id="umbralMinimo"
                  etiqueta="Umbral mínimo"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={valor}
                  onChange={alEscribir}
                  error={errorCampo}
                />
              </div>
              <button
                type="submit"
                disabled={guardando}
                className="h-fit rounded-(--radius) bg-(--color-primario) px-4 py-3
                           text-sm font-bold text-(--color-primario-texto) transition
                           focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave)
                           disabled:opacity-60 sm:mt-7"
              >
                {guardando ? "Guardando…" : "Guardar umbral"}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
