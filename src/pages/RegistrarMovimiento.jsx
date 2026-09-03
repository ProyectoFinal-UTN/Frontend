import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Campo from "../components/Campo";
import CampoSelect from "../components/CampoSelect";
import { obtenerUbicaciones } from "../services/configuracion";
import {
  SENTIDOS,
  TIPOS_MOVIMIENTO,
  TIPO_CON_SENTIDO,
  registrarMovimiento,
} from "../services/movimientos";
import { obtenerProductos } from "../services/productos";
import { validarMovimiento } from "./RegistrarMovimiento.validacion";

/**
 * Registro de un movimiento de entrada o salida de stock (HU-13).
 *
 * Es el flujo más usado del sistema, así que RNF1 pide llegar en ~3 pasos desde
 * el inicio: un clic en «Registrar movimiento», completar el formulario y
 * confirmar. Por eso todo entra en una sola pantalla, sin pasos intermedios, y
 * ningún campo se pide cuando no tiene alternativa —la ubicación no aparece si
 * el comercio tiene una sola, y el sentido solo aparece en un ajuste—.
 *
 * La confirmación se muestra acá mismo, con el stock que quedó: es la forma de
 * que el criterio de aceptación «el stock se actualiza» se vea, en vez de
 * quedar supuesto.
 */

const CLASES_BOTON_PRIMARIO =
  "rounded-(--radius) bg-(--color-primario) px-5 py-3 font-bold " +
  "text-(--color-primario-texto) transition hover:opacity-90 " +
  "focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave) " +
  "disabled:opacity-60";

const CAMPOS_VACIOS = {
  productoId: "",
  tipo: "",
  sentido: "",
  cantidad: "",
  ubicacionId: "",
};

/** Nombre de un producto o de una ubicación por id, para armar la confirmación. */
function nombreDe(lista, id) {
  return lista.find((item) => item.id === id)?.nombre ?? "";
}

/**
 * Lo que falta configurar antes de poder mover stock, con el link para ir a
 * hacerlo.
 *
 * Sin productos o sin ubicaciones el formulario no puede funcionar, y el
 * backend respondería un 400 recién al confirmar. Más vale decirlo antes y
 * ofrecer la salida que dejar completar algo que se va a rechazar.
 */
function Bloqueado({ mensaje, a, accion }) {
  return (
    <div className="rounded-(--radius) bg-(--color-apagado) px-4 py-8 text-center">
      <p className="font-bold text-(--color-texto)">{mensaje}</p>
      <Link
        to={a}
        className="mt-3 inline-block text-sm font-bold text-(--color-primario) underline"
      >
        {accion}
      </Link>
    </div>
  );
}

function FormularioMovimiento({ productos, ubicaciones }) {
  const [campos, setCampos] = useState(CAMPOS_VACIOS);
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [avisoStock, setAvisoStock] = useState("");
  const [confirmacion, setConfirmacion] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // React 19 pasa `ref` como una prop más, así que `Campo` la reenvía al
  // `<input>` con el mismo spread que el resto. Se usa para devolver el foco a
  // la cantidad cuando el backend rechaza por stock.
  const cantidadRef = useRef(null);

  // Con una sola ubicación no se pregunta: el backend la resuelve solo. Con
  // varias es obligatoria, y elegir una por el usuario sería adivinar de qué
  // estante sale la mercadería.
  const pideUbicacion = ubicaciones.length > 1;

  function alEscribir(evento) {
    const { name, value } = evento.target;

    setCampos((previos) => ({
      ...previos,
      [name]: value,
      // Cambiar de ajuste a otro tipo deja un sentido colgado que ya no aplica
      // y que se enviaría en el próximo submit.
      ...(name === "tipo" && value !== TIPO_CON_SENTIDO ? { sentido: "" } : {}),
    }));

    // El error se limpia apenas tocan el campo: dejarlo mientras corrigen es
    // molesto.
    setErrores((previos) => ({ ...previos, [name]: undefined }));
    setErrorGeneral("");
    setAvisoStock("");
    // La confirmación se va cuando arranca el movimiento siguiente: si se
    // quedara, seguiría nombrando al producto anterior mientras el formulario
    // ya muestra otro.
    setConfirmacion(null);
  }

  async function alEnviar(evento) {
    evento.preventDefault();

    const encontrados = validarMovimiento(campos, { pideUbicacion });
    setErrores(encontrados);

    if (Object.keys(encontrados).length > 0) {
      return;
    }

    setErrorGeneral("");
    setAvisoStock("");
    setConfirmacion(null);
    setGuardando(true);

    const datos = {
      productoId: campos.productoId,
      tipo: campos.tipo,
      // El backend exige un número de verdad: chequea `typeof cantidad ===
      // "number"` y un `<input type="number">` entrega string. Siempre en
      // positivo; el signo lo pone el tipo del lado del servidor.
      cantidad: Number(campos.cantidad),
    };

    if (campos.tipo === TIPO_CON_SENTIDO) {
      datos.sentido = campos.sentido;
    }

    if (pideUbicacion) {
      datos.ubicacionId = campos.ubicacionId;
    }

    try {
      const { stock } = await registrarMovimiento(datos);

      setConfirmacion({
        producto: nombreDe(productos, campos.productoId),
        // De acá sale el nombre de la ubicación aunque no la hayamos mandado:
        // con una sola, la respuesta es el único lugar que dice cuál usó.
        ubicacion: nombreDe(ubicaciones, stock.ubicacionId),
        cantidad: stock.cantidad,
      });

      // Se limpian solo la cantidad y el sentido. Dejar puestos el producto, el
      // tipo y la ubicación hace que el segundo movimiento seguido cueste un
      // paso en vez de tres, que es de lo que se trata el RNF1.
      setCampos((previos) => ({ ...previos, cantidad: "", sentido: "" }));
    } catch (fallo) {
      // Stock insuficiente (o saldo resultante fuera de rango) no es una falla
      // del sistema sino una respuesta legítima del negocio, así que se muestra
      // como aviso y no como error. El mensaje del backend ya nombra las
      // unidades disponibles y las pedidas: se usa tal cual.
      if (fallo.status === 409) {
        setAvisoStock(fallo.message);
        // Lo único que hay que corregir es la cantidad; el resto del formulario
        // queda como estaba para no rehacerlo entero.
        cantidadRef.current?.focus();
        cantidadRef.current?.select();
        return;
      }

      setErrorGeneral(fallo.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form
      onSubmit={alEnviar}
      noValidate
      aria-label="Registrar movimiento"
      className="flex flex-col gap-4 rounded-(--radius) border-2
                 border-(--color-borde) bg-(--color-tarjeta) p-4"
    >
      {confirmacion && (
        <p
          role="status"
          className="rounded-(--radius) bg-(--color-exito-suave) px-4 py-3
                     text-sm font-semibold text-(--color-exito)"
        >
          Listo. {confirmacion.producto} quedó con {confirmacion.cantidad}{" "}
          {confirmacion.cantidad === 1 ? "unidad" : "unidades"} en{" "}
          {confirmacion.ubicacion}.
        </p>
      )}

      {avisoStock && (
        <div
          role="alert"
          className="rounded-(--radius) bg-(--color-atencion-suave) px-4 py-3
                     text-sm text-(--color-texto)"
        >
          <p className="font-bold">{avisoStock}</p>
          <p className="mt-1">
            Corregí la cantidad
            {pideUbicacion ? " o probá con otra ubicación" : ""}.
          </p>
        </div>
      )}

      {errorGeneral && (
        <p
          role="alert"
          className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          {errorGeneral}
        </p>
      )}

      <CampoSelect
        id="productoId"
        etiqueta="Producto"
        value={campos.productoId}
        onChange={alEscribir}
        error={errores.productoId}
      >
        <option value="">Elegí un producto…</option>
        {productos.map((producto) => (
          <option key={producto.id} value={producto.id}>
            {producto.nombre}
          </option>
        ))}
      </CampoSelect>

      <CampoSelect
        id="tipo"
        etiqueta="Tipo de movimiento"
        value={campos.tipo}
        onChange={alEscribir}
        error={errores.tipo}
      >
        <option value="">Elegí el tipo…</option>
        {TIPOS_MOVIMIENTO.map(({ valor, etiqueta }) => (
          <option key={valor} value={valor}>
            {etiqueta}
          </option>
        ))}
      </CampoSelect>

      {campos.tipo === TIPO_CON_SENTIDO && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-bold text-(--color-texto)">
            ¿El ajuste suma o resta?
          </legend>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:gap-5">
            {SENTIDOS.map(({ valor, etiqueta }) => (
              <label
                key={valor}
                className="flex items-center gap-2 text-(--color-texto)"
              >
                <input
                  type="radio"
                  name="sentido"
                  value={valor}
                  checked={campos.sentido === valor}
                  onChange={alEscribir}
                  className="h-4 w-4 accent-(--color-primario)"
                />
                {etiqueta}
              </label>
            ))}
          </div>
          {errores.sentido && (
            <p className="text-sm text-(--color-peligro)">{errores.sentido}</p>
          )}
        </fieldset>
      )}

      <Campo
        id="cantidad"
        etiqueta="Cantidad"
        type="number"
        min="1"
        step="1"
        inputMode="numeric"
        autoComplete="off"
        placeholder="1"
        value={campos.cantidad}
        onChange={alEscribir}
        error={errores.cantidad}
        ref={cantidadRef}
      />

      {/*
        Con una sola ubicación este campo no existe: no se le pide al usuario un
        dato que no tiene alternativa, y el body sale sin `ubicacionId` para que
        el backend la resuelva.
      */}
      {pideUbicacion && (
        <CampoSelect
          id="ubicacionId"
          etiqueta="Ubicación"
          value={campos.ubicacionId}
          onChange={alEscribir}
          error={errores.ubicacionId}
        >
          <option value="">Elegí una ubicación…</option>
          {ubicaciones.map((ubicacion) => (
            <option key={ubicacion.id} value={ubicacion.id}>
              {ubicacion.nombre}
            </option>
          ))}
        </CampoSelect>
      )}

      <button type="submit" disabled={guardando} className={CLASES_BOTON_PRIMARIO}>
        {guardando ? "Registrando…" : "Registrar movimiento"}
      </button>
    </form>
  );
}

export default function RegistrarMovimiento() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  // La carga puede volver después de que la pantalla se desmontó. El ref lo
  // comparten la carga inicial y el reintento, así los dos caminos se protegen
  // igual.
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Los dos pedidos van en paralelo: el formulario no puede dibujarse sin
  // ambos, así que encadenarlos solo sumaría espera.
  //
  // Devuelve la promesa en vez de usar async/await para que quede explícito que
  // ningún `setState` ocurre de forma síncrona dentro del efecto.
  const cargar = useCallback(
    () =>
      Promise.all([obtenerProductos(), obtenerUbicaciones()])
        .then(([productos, ubicaciones]) => {
          if (!montado.current) return;
          setDatos({ productos, ubicaciones });
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

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10">
      <header className="mb-6">
        <Link
          to="/"
          className="text-sm font-bold text-(--color-primario) underline"
        >
          ← Volver al inicio
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold text-(--color-texto)">
          Registrar movimiento
        </h1>
        <p className="mt-2 text-(--color-texto-apagado)">
          Cargá lo que entró o salió y el stock se actualiza solo.
        </p>
      </header>

      {cargando && <p className="text-(--color-texto-apagado)">Cargando datos…</p>}

      {!cargando && error && (
        <div
          role="alert"
          className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          <p>{error}</p>
          {/*
            Sin este botón, un backend que no responde deja la pantalla muerta:
            el formulario no se dibuja, así que no queda ninguna acción a mano y
            la única salida es recargar el navegador.
          */}
          <button
            type="button"
            onClick={() => {
              setCargando(true);
              cargar();
            }}
            className="mt-2 rounded-(--radius) bg-(--color-peligro)
                       px-3 py-2 text-sm font-bold text-(--color-peligro-texto)
                       transition focus:outline-none focus:ring-4
                       focus:ring-(--color-primario-suave)"
          >
            Reintentar
          </button>
        </div>
      )}

      {!cargando && !error && datos && (
        <>
          {datos.productos.length === 0 && (
            <Bloqueado
              mensaje="Todavía no cargaste ningún producto."
              a="/productos"
              accion="Cargar el primero →"
            />
          )}

          {datos.productos.length > 0 && datos.ubicaciones.length === 0 && (
            <Bloqueado
              mensaje="Todavía no configuraste dónde guardás la mercadería."
              a="/configuracion?seccion=ubicaciones"
              accion="Crear una ubicación →"
            />
          )}

          {datos.productos.length > 0 && datos.ubicaciones.length > 0 && (
            <FormularioMovimiento
              productos={datos.productos}
              ubicaciones={datos.ubicaciones}
            />
          )}
        </>
      )}
    </main>
  );
}
