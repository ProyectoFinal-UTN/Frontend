import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Campo from "./Campo";
import {
  UNIDADES_MEDIDA,
  crearProducto,
  editarProducto,
  eliminarProducto,
} from "../services/productos";
import { validarProducto } from "../pages/Productos.validacion";

/**
 * Catálogo de productos: alta, edición y baja (HU-9).
 *
 * Cada operación recarga la lista desde el servidor en vez de adivinar el
 * estado nuevo, igual que en `SeccionUbicaciones`: lo que se ve es lo que hay.
 */

const CLASES_INPUT =
  "w-full rounded-(--radius) border-2 bg-(--color-tarjeta) " +
  "px-4 py-3 text-base text-(--color-texto) outline-none transition " +
  "focus:border-(--color-primario)";

const CLASES_BOTON_SUAVE =
  "rounded-(--radius) px-3 py-2 text-sm font-bold transition " +
  "focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave)";

const CLASES_BOTON_PRIMARIO =
  "rounded-(--radius) bg-(--color-primario) px-5 py-3 font-bold " +
  "text-(--color-primario-texto) transition hover:opacity-90 " +
  "focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave) " +
  "disabled:opacity-60";

const CAMPOS_VACIOS = {
  codigoBarras: "",
  nombre: "",
  categoria: "",
  unidadMedida: "unidad",
  umbralMinimo: "0",
  stockActual: "0",
};

/**
 * Un `<select>` con la misma pinta y la misma accesibilidad que `Campo`.
 *
 * `Campo` solo renderiza `<input>`, y extenderlo para aceptar un select
 * obligaría a tocar un componente que ya usan el registro y el login. Sale más
 * barato repetir estas quince líneas acá que arrastrar a esos dos formularios
 * a este PR.
 */
function CampoSelect({ id, etiqueta, error, children, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-(--color-texto)">
        {etiqueta}
      </label>
      <select
        id={id}
        name={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `error-${id}` : undefined}
        className={`${CLASES_INPUT} ${
          error ? "border-(--color-peligro)" : "border-(--color-borde)"
        }`}
        {...props}
      >
        {children}
      </select>
      {error && (
        <p id={`error-${id}`} className="text-sm text-(--color-peligro)">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Formulario de alta y de edición.
 *
 * Es el mismo en los dos modos salvo por el stock inicial, que solo existe en
 * el alta: el PUT del backend no lo acepta porque cambiar cantidades es
 * responsabilidad del registro de movimientos (HU-13).
 *
 * `alGuardar` devuelve el error del backend (o `null` si salió bien) en vez de
 * un booleano, para poder anclar un 409 al campo del código de barras en lugar
 * de mostrarlo como un error general suelto arriba del formulario.
 */
function FormularioProducto({ modo, inicial, alGuardar, alCancelar, guardando }) {
  const esEdicion = modo === "edicion";

  const [campos, setCampos] = useState({ ...CAMPOS_VACIOS, ...inicial });
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState("");

  function alEscribir(evento) {
    const { name, value } = evento.target;
    setCampos((previos) => ({ ...previos, [name]: value }));
    // El error se limpia apenas tocan el campo: dejarlo mientras corrigen
    // es molesto.
    setErrores((previos) => ({ ...previos, [name]: undefined }));
    setErrorGeneral("");
  }

  async function alEnviar(evento) {
    evento.preventDefault();

    const encontrados = validarProducto(campos, { esEdicion });
    setErrores(encontrados);

    if (Object.keys(encontrados).length > 0) {
      return;
    }

    setErrorGeneral("");

    const datos = {
      codigoBarras: campos.codigoBarras.trim(),
      nombre: campos.nombre.trim(),
      categoria: campos.categoria.trim(),
      unidadMedida: campos.unidadMedida,
      // El backend exige números de verdad: chequea `typeof valor === "number"`
      // y un `<input type="number">` entrega string.
      umbralMinimo: Number(campos.umbralMinimo),
    };

    if (!esEdicion) {
      datos.stockActual = Number(campos.stockActual);
    }

    const fallo = await alGuardar(datos);

    if (!fallo) {
      return;
    }

    // El código repetido es el único error que el usuario puede corregir en un
    // campo concreto, así que se muestra ahí y no arriba. El mensaje del
    // backend ya nombra el código: se usa tal cual.
    if (fallo.status === 409) {
      setErrores({ codigoBarras: fallo.message });
      return;
    }

    setErrorGeneral(fallo.message);
  }

  return (
    <form
      onSubmit={alEnviar}
      noValidate
      aria-label={esEdicion ? "Editar producto" : "Nuevo producto"}
      className="mt-4 flex flex-col gap-4 rounded-(--radius) border-2
                 border-(--color-borde) bg-(--color-tarjeta) p-4"
    >
      <h3 className="text-lg font-extrabold text-(--color-texto)">
        {esEdicion ? "Editar producto" : "Nuevo producto"}
      </h3>

      {errorGeneral && (
        <p
          role="alert"
          className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          {errorGeneral}
        </p>
      )}

      <Campo
        id="codigoBarras"
        etiqueta="Código de barras"
        inputMode="numeric"
        autoComplete="off"
        placeholder="7790895000782"
        value={campos.codigoBarras}
        onChange={alEscribir}
        error={errores.codigoBarras}
      />

      <Campo
        id="nombre"
        etiqueta="Nombre"
        autoComplete="off"
        placeholder="Coca-Cola 500ml"
        value={campos.nombre}
        onChange={alEscribir}
        error={errores.nombre}
      />

      <Campo
        id="categoria"
        etiqueta="Categoría"
        autoComplete="off"
        placeholder="Bebidas"
        value={campos.categoria}
        onChange={alEscribir}
        error={errores.categoria}
      />

      <CampoSelect
        id="unidadMedida"
        etiqueta="Unidad de medida"
        value={campos.unidadMedida}
        onChange={alEscribir}
        error={errores.unidadMedida}
      >
        {UNIDADES_MEDIDA.map((unidad) => (
          <option key={unidad} value={unidad}>
            {unidad}
          </option>
        ))}
      </CampoSelect>

      <Campo
        id="umbralMinimo"
        etiqueta="Umbral mínimo"
        type="number"
        min="0"
        inputMode="numeric"
        value={campos.umbralMinimo}
        onChange={alEscribir}
        error={errores.umbralMinimo}
      />

      {!esEdicion && (
        <Campo
          id="stockActual"
          etiqueta="Stock inicial"
          type="number"
          min="0"
          inputMode="numeric"
          value={campos.stockActual}
          onChange={alEscribir}
          error={errores.stockActual}
        />
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={guardando}
          className={CLASES_BOTON_PRIMARIO}
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={alCancelar}
          className={`${CLASES_BOTON_SUAVE} bg-(--color-apagado) text-(--color-texto)`}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * Una fila del catálogo, que alterna entre verse y pedir confirmación de
 * borrado.
 *
 * `guardando` viene de arriba para deshabilitar los botones mientras hay una
 * operación en curso: sin eso, un doble clic en «Sí, eliminar» manda dos
 * DELETE.
 */
function FilaProducto({ producto, alEditar, alEliminar, guardando }) {
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <li className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3">
        <p className="text-sm font-bold text-(--color-peligro)">
          ¿Eliminar «{producto.nombre}»?
        </p>
        <p className="mt-1 text-sm text-(--color-peligro)">
          Deja de aparecer en el catálogo, pero su historial de movimientos se
          conserva.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={guardando}
            onClick={() => alEliminar(producto.id)}
            className={`${CLASES_BOTON_SUAVE} bg-(--color-peligro) text-(--color-peligro-texto) disabled:opacity-60`}
          >
            Sí, eliminar
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
    <li
      className="flex flex-col gap-3 rounded-(--radius) border-2
                 border-(--color-borde) px-4 py-3 sm:flex-row
                 sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="font-bold text-(--color-texto)">{producto.nombre}</p>
        <p className="text-sm text-(--color-texto-apagado)">
          {producto.categoria} · {producto.codigoBarras}
        </p>
        <p className="text-sm text-(--color-texto-apagado)">
          Se mide en {producto.unidadMedida} · avisar bajo{" "}
          {producto.umbralMinimo}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          disabled={guardando}
          onClick={() => alEditar(producto)}
          aria-label={`Editar ${producto.nombre}`}
          className={`${CLASES_BOTON_SUAVE} text-(--color-primario) disabled:opacity-60`}
        >
          Editar
        </button>
        <button
          type="button"
          disabled={guardando}
          onClick={() => setConfirmando(true)}
          aria-label={`Eliminar ${producto.nombre}`}
          className={`${CLASES_BOTON_SUAVE} text-(--color-peligro) disabled:opacity-60`}
        >
          Eliminar
        </button>
      </div>
    </li>
  );
}

export default function SeccionProductos({
  productos,
  alRecargar,
  codigoInicial = "",
  nombreInicial = "",
  categoriaInicial = "",
  alConsumirCodigo,
}) {
  // `null` = ningún formulario abierto; `{ modo, inicial }` = el que se ve.
  // Si se llegó con `?nuevo=<codigo>` (desde el escáner de HU-10), el alta
  // arranca abierta con el código ya puesto — y, si el escáner encontró una
  // sugerencia en Open Food Facts, con nombre/categoría también precargados,
  // para no hacer retipear lo que ya se le mostró al usuario.
  const [formulario, setFormulario] = useState(
    codigoInicial
      ? {
          modo: "alta",
          inicial: {
            codigoBarras: codigoInicial,
            ...(nombreInicial && { nombre: nombreInicial }),
            ...(categoriaInicial && { categoria: categoriaInicial }),
          },
        }
      : null,
  );
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  // El código del escáner se usa una sola vez. Sin avisar que ya se consumió,
  // un remonte de esta sección —la página la desmonta ante un error de carga,
  // así que el «Reintentar» la vuelve a montar— reabriría el alta con un
  // código que a esa altura quizá ya se dio de alta, y guardar devolvería un
  // 409 que el usuario no pidió.
  useEffect(() => {
    if (codigoInicial) alConsumirCodigo?.();
  }, [codigoInicial, alConsumirCodigo]);

  // El aviso de "se dio de alta" es sobre la operación que se acaba de
  // terminar, no sobre la que arranca ahora: se limpia en los dos lugares
  // donde se abre un formulario nuevo (alta manual, edición), no con un
  // efecto — total, es la misma actualización que ya cambia `formulario`.
  function abrirAltaManual() {
    setMensaje("");
    setFormulario({ modo: "alta", inicial: {} });
  }

  function abrirEdicion(producto) {
    setMensaje("");
    setFormulario({
      modo: "edicion",
      inicial: {
        id: producto.id,
        codigoBarras: producto.codigoBarras,
        nombre: producto.nombre,
        categoria: producto.categoria,
        unidadMedida: producto.unidadMedida,
        umbralMinimo: String(producto.umbralMinimo),
      },
    });
  }

  /**
   * Corre una operación contra el backend y recarga la lista.
   *
   * Devuelve el error en vez de tragárselo para que quien llama decida dónde
   * mostrarlo: el formulario ancla el 409 al campo del código de barras, la
   * lista muestra todo lo demás arriba.
   *
   * Solo reporta lo que falló en la operación, no en la recarga: `alRecargar`
   * nunca rechaza porque la página maneja ese error por su cuenta y reemplaza
   * la lista entera por el aviso con «Reintentar». Si alguna vez la página
   * dejara de hacerlo, acá habría que distinguir los dos fallos, porque una
   * recarga que falla en silencio deja el catálogo desactualizado.
   *
   * @returns `null` si salió bien, o el error con su `status` y su `message`.
   */
  async function ejecutar(operacion) {
    setError("");
    setMensaje("");
    setGuardando(true);

    try {
      await operacion();
      await alRecargar();
      return null;
    } catch (fallo) {
      return fallo;
    } finally {
      setGuardando(false);
    }
  }

  async function guardar(datos) {
    const esEdicion = formulario.modo === "edicion";

    const fallo = await ejecutar(() =>
      esEdicion
        ? editarProducto(formulario.inicial.id, datos)
        : crearProducto(datos),
    );

    if (!fallo) {
      setFormulario(null);
      if (!esEdicion) {
        setMensaje(`«${datos.nombre}» se dio de alta correctamente.`);
      }
      return null;
    }

    // El producto desapareció mientras lo editaban (otra pestaña, u otro
    // usuario del comercio). Insistir sobre una fila fantasma no lleva a
    // ningún lado: se cierra el formulario y se muestra la lista real.
    if (fallo.status === 404) {
      setFormulario(null);
      setError("Ese producto ya no existe. Actualizamos la lista.");
      await alRecargar();
      return null;
    }

    // El formulario se queda abierto con lo tipeado y se encarga del mensaje.
    return fallo;
  }

  async function eliminar(id) {
    // El DELETE del backend es idempotente (responde 204 aunque el producto ya
    // estuviera inactivo), así que acá no hay un 404 que manejar.
    const fallo = await ejecutar(() => eliminarProducto(id));
    if (fallo) {
      setError(fallo.message);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-(--color-texto)">
            Catálogo
          </h2>
          <p className="mt-1 text-sm text-(--color-texto-apagado)">
            Los productos que vendés. Cada uno lleva su código de barras y el
            umbral que dispara el aviso de reposición.
          </p>
        </div>
        {!formulario && (
          <div className="flex gap-2">
            {/*
              Dos formas de arrancar el alta: escanear (manda a HU-10, que
              trae el código y, si lo encuentra en Open Food Facts, nombre y
              categoría también) o cargar todo a mano acá mismo. Van juntas
              porque son la misma acción con dos puntos de partida distintos,
              no dos cosas separadas.
            */}
            <Link to="/productos/escanear" className={CLASES_BOTON_PRIMARIO}>
              Escanear código
            </Link>
            <button
              type="button"
              disabled={guardando}
              onClick={abrirAltaManual}
              className={CLASES_BOTON_PRIMARIO}
            >
              + Cargar a mano
            </button>
          </div>
        )}
      </div>

      {mensaje && (
        <p
          role="status"
          className="mt-4 rounded-(--radius) bg-(--color-exito-suave) px-4 py-3
                     text-sm font-semibold text-(--color-exito)"
        >
          {mensaje}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          {error}
        </p>
      )}

      {formulario && (
        <FormularioProducto
          // Sin `key`, pasar de editar un producto a editar otro reusaría el
          // mismo estado y el formulario mostraría los datos del anterior.
          key={formulario.inicial.id ?? "alta"}
          modo={formulario.modo}
          inicial={formulario.inicial}
          guardando={guardando}
          alGuardar={guardar}
          alCancelar={() => setFormulario(null)}
        />
      )}

      {productos.length === 0 ? (
        <p className="mt-4 rounded-(--radius) bg-(--color-apagado) px-4 py-3 text-sm text-(--color-texto-apagado)">
          Todavía no cargaste ningún producto.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {productos.map((producto) => (
            <FilaProducto
              key={producto.id}
              producto={producto}
              guardando={guardando}
              alEditar={abrirEdicion}
              alEliminar={eliminar}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
