import { useCallback, useEffect, useRef, useState } from "react";
import AvisoDeError from "./AvisoDeError";
import CampoSelect from "./CampoSelect";

/**
 * Lista de vínculos con su alta y su baja (HU-20).
 *
 * Es la misma pieza para los dos lados de la relación producto-proveedor: en
 * el detalle de un producto lista sus proveedores, y en un proveedor lista sus
 * productos. Lo que cambia —qué se carga, cómo se dibuja cada elemento, qué
 * llamada asocia— lo pasa quien la usa; acá vive solo el ciclo de cargar,
 * asociar, quitar y recargar, que es idéntico.
 *
 * Como el resto de las pantallas, después de cada operación recarga desde el
 * servidor en vez de adivinar el estado nuevo.
 *
 * Las opciones del desplegable (todo lo que se podría asociar) se piden solo si
 * `puedeEditar`: quien no puede asociar no las necesita, y es una request menos.
 */
export default function EditorDeVinculos({
  id,
  cargarVinculados,
  cargarOpciones,
  asociar,
  quitar,
  puedeEditar,
  renderElemento,
  nombreDe = (elemento) => elemento.nombre,
  etiquetaSelect,
  textoVacio,
  sinOpciones,
}) {
  const [vinculados, setVinculados] = useState(null);
  const [opciones, setOpciones] = useState([]);
  const [errorCarga, setErrorCarga] = useState(null);
  const [fallo, setFallo] = useState(null);
  const [elegido, setElegido] = useState("");
  const [guardando, setGuardando] = useState(false);

  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Devuelve la promesa en vez de usar async/await para que ningún `setState`
  // ocurra de forma síncrona dentro del efecto, igual que las páginas.
  const cargar = useCallback(
    () =>
      Promise.all([
        cargarVinculados(),
        puedeEditar ? cargarOpciones() : Promise.resolve([]),
      ])
        .then(([lista, todas]) => {
          if (!montado.current) return;
          setVinculados(lista);
          setOpciones(todas);
          setErrorCarga(null);
        })
        .catch((error) => {
          if (montado.current) setErrorCarga(error);
        }),
    [cargarVinculados, cargarOpciones, puedeEditar],
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ejecutar(operacion) {
    setFallo(null);
    setGuardando(true);

    try {
      await operacion();
      return true;
    } catch (error) {
      if (montado.current) setFallo(error);
      return false;
    } finally {
      // Se recarga también si falló: un 409 (ya estaba asociado) o un 404 (lo
      // dieron de baja) quieren decir que la lista en pantalla quedó vieja.
      await cargar();
      if (montado.current) setGuardando(false);
    }
  }

  async function alAsociar(evento) {
    evento.preventDefault();
    if (!elegido) return;

    if (await ejecutar(() => asociar(elegido))) {
      setElegido("");
    }
  }

  if (errorCarga) {
    return (
      <div className="mt-3">
        <AvisoDeError fallo={errorCarga} alReintentar={cargar} />
      </div>
    );
  }

  if (vinculados === null) {
    return <p className="mt-3 text-sm text-(--color-texto-apagado)">Cargando…</p>;
  }

  const idsVinculados = new Set(vinculados.map((elemento) => elemento.id));
  const disponibles = opciones.filter((opcion) => !idsVinculados.has(opcion.id));

  return (
    <div className="mt-3 flex flex-col gap-3">
      {fallo && <AvisoDeError fallo={fallo} />}

      {vinculados.length === 0 ? (
        <p className="rounded-(--radius) bg-(--color-apagado) px-4 py-3 text-sm text-(--color-texto-apagado)">
          {textoVacio}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {vinculados.map((elemento) => (
            <li
              key={elemento.id}
              className="flex flex-wrap items-center justify-between gap-2
                         rounded-(--radius) border-2 border-(--color-borde) px-4 py-2"
            >
              <div className="min-w-0">{renderElemento(elemento)}</div>
              {puedeEditar && (
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => ejecutar(() => quitar(elemento.id))}
                  aria-label={`Quitar ${nombreDe(elemento)}`}
                  className="rounded-(--radius) px-3 py-2 text-sm font-bold
                             text-(--color-peligro) transition focus:outline-none
                             focus:ring-4 focus:ring-(--color-primario-suave)
                             disabled:opacity-60"
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeEditar &&
        (opciones.length === 0 ? (
          sinOpciones
        ) : (
          disponibles.length > 0 && (
            <form
              onSubmit={alAsociar}
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <CampoSelect
                  id={id}
                  etiqueta={etiquetaSelect}
                  value={elegido}
                  onChange={(evento) => setElegido(evento.target.value)}
                >
                  <option value="">Elegí uno…</option>
                  {disponibles.map((opcion) => (
                    <option key={opcion.id} value={opcion.id}>
                      {nombreDe(opcion)}
                    </option>
                  ))}
                </CampoSelect>
              </div>
              <button
                type="submit"
                disabled={guardando || !elegido}
                className="rounded-(--radius) bg-(--color-primario) px-5 py-3 font-bold
                           text-(--color-primario-texto) transition hover:opacity-90
                           focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave)
                           disabled:opacity-60"
              >
                Asociar
              </button>
            </form>
          )
        ))}
    </div>
  );
}
