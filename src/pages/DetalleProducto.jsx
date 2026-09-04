import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Campo from "../components/Campo";
import CampoSelect from "../components/CampoSelect";
import { obtenerProducto } from "../services/productos";
import {
  SENTIDOS,
  TIPO_CON_SENTIDO,
  registrarMovimiento,
} from "../services/movimientos";

/**
 * Stock de un producto, discriminado por ubicación (HU-11).
 *
 * `GET /api/productos/:id` ya trae el producto y su stock en una sola
 * respuesta, así que no hace falta ni un segundo pedido ni pasar el producto
 * por `state` de navegación.
 *
 * El ajuste por fila usa el mismo `services/movimientos.js` que
 * `RegistrarMovimiento` (HU-13): esta pantalla no reimplementa ese flujo,
 * solo lo ofrece con el producto y la ubicación ya elegidos por contexto —
 * `RegistrarMovimiento` sigue siendo el camino para compra/venta/merma o para
 * un ajuste sin partir de la ficha de un producto puntual.
 */

const MAXIMO_ENTERO = 2147483647;

/** Mismo criterio que `validarCantidad` en `RegistrarMovimiento.validacion.js`. */
function validarCantidad(valor) {
  const texto = String(valor ?? "").trim();

  if (!texto) return "Ingresá cuántas unidades.";
  if (!/^\d+$/.test(texto)) {
    return "Tiene que ser un número entero, sin decimales ni signos.";
  }
  if (Number(texto) === 0) return "Tiene que ser al menos 1.";
  if (Number(texto) > MAXIMO_ENTERO) return `No puede superar ${MAXIMO_ENTERO}.`;

  return null;
}

/**
 * Una fila de ubicación, con su propio ajuste inline.
 *
 * El estado del formulario vive acá adentro y no en la página: cada fila
 * ajusta su propia ubicación de forma independiente de las demás.
 */
function FilaStock({ fila, productoId, alAjustar }) {
  const [cantidad, setCantidad] = useState("");
  const [sentido, setSentido] = useState("");
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);

  async function ajustar(evento) {
    evento.preventDefault();

    const errorCantidad = validarCantidad(cantidad);
    const nuevosErrores = {};
    if (errorCantidad) nuevosErrores.cantidad = errorCantidad;
    if (!SENTIDOS.some(({ valor }) => valor === sentido)) {
      nuevosErrores.sentido = "Indicá si el ajuste suma o resta stock.";
    }

    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }

    setErrores({});
    setGuardando(true);

    try {
      await registrarMovimiento({
        productoId,
        tipo: TIPO_CON_SENTIDO,
        cantidad: Number(cantidad),
        sentido,
        ubicacionId: fila.ubicacionId,
      });
      setCantidad("");
      setSentido("");
      alAjustar();
    } catch (fallo) {
      setErrores({ general: fallo.message });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li className="rounded-(--radius) border-2 border-(--color-borde) px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="font-bold text-(--color-texto)">
          {fila.ubicacionNombre}
        </span>
        <span className="text-(--color-texto)">{fila.cantidad}</span>
      </div>

      <form onSubmit={ajustar} className="mt-2 flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <Campo
            id={`cantidad-${fila.ubicacionId}`}
            etiqueta="Cantidad"
            type="number"
            min="1"
            inputMode="numeric"
            value={cantidad}
            onChange={(evento) => setCantidad(evento.target.value)}
            error={errores.cantidad}
          />
        </div>
        <div className="flex-1">
          <CampoSelect
            id={`sentido-${fila.ubicacionId}`}
            etiqueta="Sentido"
            value={sentido}
            onChange={(evento) => setSentido(evento.target.value)}
            error={errores.sentido}
          >
            <option value="" disabled>
              Elegí una opción
            </option>
            {SENTIDOS.map(({ valor, etiqueta }) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </CampoSelect>
        </div>
        <button
          type="submit"
          disabled={guardando}
          className="h-fit self-end rounded-(--radius) bg-(--color-primario) px-3 py-3
                     text-sm font-bold text-(--color-primario-texto) transition
                     focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave)
                     disabled:opacity-60"
        >
          Ajustar
        </button>
      </form>

      {errores.general && (
        <p className="mt-1 text-sm text-(--color-peligro)">{errores.general}</p>
      )}
    </li>
  );
}

export default function DetalleProducto() {
  const { id } = useParams();
  const [producto, setProducto] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  // Mismo patrón que Configuracion.jsx/Productos.jsx: la recarga que dispara
  // un ajuste puede volver después de que la pantalla se desmontó, y la carga
  // inicial comparte esa misma protección.
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Devuelve la promesa en vez de usar async/await para que ningún `setState`
  // ocurra de forma síncrona dentro del efecto que la dispara.
  const cargar = useCallback(
    () =>
      obtenerProducto(id)
        .then((datos) => {
          if (!montado.current) return;
          setProducto(datos);
          setError("");
        })
        .catch((fallo) => {
          if (montado.current) setError(fallo.message);
        })
        .finally(() => {
          if (montado.current) setCargando(false);
        }),
    [id],
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10">
      <header className="mb-6">
        <Link
          to="/productos"
          className="text-sm font-bold text-(--color-primario) underline"
        >
          ← Volver a productos
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold text-(--color-texto)">
          {producto?.nombre ?? "Producto"}
        </h1>
        {producto && (
          <p className="mt-2 text-(--color-texto-apagado)">
            {producto.codigoBarras}
            {producto.categoria ? ` · ${producto.categoria}` : ""}
          </p>
        )}
      </header>

      {cargando && (
        <p className="text-(--color-texto-apagado)">Cargando datos…</p>
      )}

      {!cargando && error && (
        <p
          role="alert"
          className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          {error}
        </p>
      )}

      {!cargando && !error && producto && (
        <>
          {producto.stock.porUbicacion.length === 0 ? (
            <div className="rounded-(--radius) bg-(--color-apagado) px-4 py-8 text-center">
              <p className="font-bold text-(--color-texto)">
                Todavía no hay ubicaciones de stock configuradas para tu
                comercio.
              </p>
              <Link
                to="/configuracion?seccion=ubicaciones"
                className="mt-3 inline-block text-sm font-bold text-(--color-primario) underline"
              >
                Ir a Configuración
              </Link>
            </div>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {producto.stock.porUbicacion.map((fila) => (
                  <FilaStock
                    key={fila.ubicacionId}
                    fila={fila}
                    productoId={id}
                    alAjustar={cargar}
                  />
                ))}
              </ul>

              <div
                className="mt-4 flex items-center justify-between rounded-(--radius)
                           border-2 border-(--color-borde) px-4 py-3 font-bold text-(--color-texto)"
              >
                <span>Total</span>
                <span>{producto.stock.total}</span>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
