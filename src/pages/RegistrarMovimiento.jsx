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

/**
 * Nombre de un producto o de una ubicación por id.
 *
 * Devuelve `null` —y no `""`— cuando no lo encuentra, para que quien arma el
 * texto pueda distinguir "no sé el nombre" de "el nombre es vacío" y omitir la
 * frase entera en vez de dejar el hueco.
 */
function nombreDe(lista, id) {
  return lista.find((item) => item.id === id)?.nombre ?? null;
}

/** El id si sigue existiendo en la lista, o "" si desapareció del catálogo. */
function idVigente(lista, id) {
  return lista.some((item) => item.id === id) ? id : "";
}

/**
 * El texto de la confirmación, armado con lo que se sepa.
 *
 * La gracia de confirmar es mostrar el stock que quedó, así que cuando falta
 * una pieza se omite la frase que la usaba en vez de concatenarla igual: sin
 * esto, una ubicación que no está en la lista cargada dejaba un
 * «…quedó con 17 unidades en .» que perdía justo el dato que venía a probar.
 *
 * El caso sin cantidad existe porque un 2xx con cuerpo ilegible sigue siendo un
 * movimiento registrado: se confirma igual, sin el número.
 */
function mensajeConfirmacion({ producto, ubicacion, cantidad }) {
  if (cantidad === null) {
    return producto
      ? `Listo. Registramos el movimiento de ${producto}.`
      : "Listo. Registramos el movimiento.";
  }

  const sujeto = producto ?? "El movimiento";
  const unidades = `${cantidad} ${cantidad === 1 ? "unidad" : "unidades"}`;

  return ubicacion
    ? `Listo. ${sujeto} quedó con ${unidades} en ${ubicacion}.`
    : `Listo. ${sujeto} quedó con ${unidades}.`;
}

/**
 * Lo que falta configurar antes de poder mover stock, con el link para ir a
 * hacerlo.
 *
 * Sin productos o sin ubicaciones el formulario no puede funcionar, y el
 * backend respondería un 400 recién al confirmar. Más vale decirlo antes y
 * ofrecer la salida que dejar completar algo que se va a rechazar.
 *
 * El link lleva a la pantalla, sin prometer que ahí se pueda crear: un
 * `empleado` solo tiene lectura sobre productos y ubicaciones, así que un
 * «Cargar el primero» lo mandaba a comerse un 403. Mostrarle directamente a
 * quién pedírselo requiere conocer el rol en el front, y eso llega con HU-4.
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

function FormularioMovimiento({ productos, ubicaciones, alRecargar }) {
  const [campos, setCampos] = useState(CAMPOS_VACIOS);
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [avisoStock, setAvisoStock] = useState("");
  const [confirmacion, setConfirmacion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  // React 19 pasa `ref` como una prop más, así que `Campo` la reenvía al
  // `<input>` con el mismo spread que el resto. Se usa para devolver el foco a
  // la cantidad cuando el backend rechaza por stock.
  const cantidadRef = useRef(null);

  // Con una sola ubicación no se pregunta: el backend la resuelve solo. Con
  // varias es obligatoria, y elegir una por el usuario sería adivinar de qué
  // estante sale la mercadería.
  const pideUbicacion = ubicaciones.length > 1;

  // Un refresco puede traer listas donde ya no está lo que se había elegido —un
  // producto dado de baja desde otra pantalla, una ubicación borrada—. El
  // `<select>` se dibuja vacío porque ninguna `<option>` coincide, pero el id
  // viejo seguiría en `campos`: pasaría la validación y viajaría en el POST.
  //
  // Se descarta acá, derivando en el render, en vez de sincronizar `campos` con
  // un efecto: así el campo que se ve vacío está vacío para todos los efectos.
  // De acá en adelante se usa `seleccion`; `campos` solo lo escribe `alEscribir`.
  const seleccion = {
    ...campos,
    productoId: idVigente(productos, campos.productoId),
    ubicacionId: idVigente(ubicaciones, campos.ubicacionId),
  };

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

    const encontrados = validarMovimiento(seleccion, { pideUbicacion });
    setErrores(encontrados);

    if (Object.keys(encontrados).length > 0) {
      return;
    }

    setErrorGeneral("");
    setAvisoStock("");
    setConfirmacion(null);
    setGuardando(true);

    const datos = {
      productoId: seleccion.productoId,
      tipo: seleccion.tipo,
      // El backend exige un número de verdad: chequea `typeof cantidad ===
      // "number"` y un `<input type="number">` entrega string. Siempre en
      // positivo; el signo lo pone el tipo del lado del servidor.
      cantidad: Number(seleccion.cantidad),
    };

    if (seleccion.tipo === TIPO_CON_SENTIDO) {
      datos.sentido = seleccion.sentido;
    }

    if (pideUbicacion) {
      datos.ubicacionId = seleccion.ubicacionId;
    }

    // El `try` envuelve solo el pedido. Todo lo que sigue corre con el
    // movimiento ya registrado, y un error ahí no puede mostrarse como si el
    // registro hubiera fallado: quien lo lea vuelve a enviar y el stock se
    // descuenta dos veces, sobre un libro que no admite borrar la fila de más.
    let respuesta;

    try {
      respuesta = await registrarMovimiento(datos);
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
      return;
    } finally {
      setGuardando(false);
    }

    // A partir de acá el movimiento está registrado. La respuesta puede venir
    // incompleta —`apiFetch` devuelve `null` ante un 2xx con cuerpo vacío o no
    // parseable— y aun así se confirma: `mensajeConfirmacion` omite lo que no
    // pueda decir en vez de fallar.
    const stock = respuesta?.stock;

    setConfirmacion({
      producto: nombreDe(productos, seleccion.productoId),
      // De acá sale el nombre de la ubicación aunque no la hayamos mandado:
      // con una sola, la respuesta es el único lugar que dice cuál usó.
      ubicacion: nombreDe(ubicaciones, stock?.ubicacionId),
      cantidad: typeof stock?.cantidad === "number" ? stock.cantidad : null,
    });

    // Se limpian solo la cantidad y el sentido. Dejar puestos el producto, el
    // tipo y la ubicación hace que el segundo movimiento seguido cueste un
    // paso en vez de tres, que es de lo que se trata el RNF1.
    setCampos((previos) => ({ ...previos, cantidad: "", sentido: "" }));
  }

  /**
   * Vuelve a pedir productos y ubicaciones sin desmontar el formulario.
   *
   * Es la salida cuando la lista quedó vieja: si alguien crea una segunda
   * ubicación después de que esta pantalla cargó, el selector no existe y todos
   * los envíos vuelven con el 400 «Se requiere indicar la ubicación», sin más
   * remedio que recargar el navegador.
   */
  async function refrescar() {
    setRefrescando(true);

    const { ok, error } = await alRecargar({ conservarFormulario: true });

    setRefrescando(false);

    // El mensaje del backend explica el fallo real —una sesión vencida no se
    // arregla revisando la conexión—; el texto propio queda solo de respaldo
    // para cuando no vino ninguno.
    setErrorGeneral(
      ok ? "" : error || "No pudimos actualizar los datos. Probá de nuevo.",
    );
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
          {mensajeConfirmacion(confirmacion)}
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
        <div
          role="alert"
          className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          <p>{errorGeneral}</p>
          {/*
            Varios de estos errores salen de que la pantalla quedó con datos
            viejos —el caso claro es el 400 por ubicación faltante cuando
            apareció una segunda después de cargar—. Sin este botón la única
            salida es recargar el navegador y perder lo cargado.

            Deshabilitado mientras hay un envío en curso, y el envío
            deshabilitado mientras se refresca: las dos operaciones escriben
            `errorGeneral`, así que solapadas el refresco borraba el error del
            envío y un movimiento no registrado quedaba sin rastro en pantalla.
            Se cierra la ventana en vez de intentar reconciliarlas.
          */}
          <button
            type="button"
            disabled={refrescando || guardando}
            onClick={refrescar}
            className="mt-2 rounded-(--radius) bg-(--color-peligro)
                       px-3 py-2 text-sm font-bold text-(--color-peligro-texto)
                       transition focus:outline-none focus:ring-4
                       focus:ring-(--color-primario-suave) disabled:opacity-60"
          >
            {refrescando ? "Actualizando…" : "Actualizar datos"}
          </button>
        </div>
      )}

      <CampoSelect
        id="productoId"
        etiqueta="Producto"
        value={seleccion.productoId}
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
        value={seleccion.tipo}
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

      {seleccion.tipo === TIPO_CON_SENTIDO && (
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
                {/*
                  El aria va en cada radio y no en el `<fieldset>`: sobre un
                  fieldset, `aria-invalid` no tiene soporte real y el error
                  quedaría anunciado en ninguna parte.
                */}
                <input
                  type="radio"
                  name="sentido"
                  value={valor}
                  checked={seleccion.sentido === valor}
                  onChange={alEscribir}
                  aria-invalid={Boolean(errores.sentido)}
                  aria-describedby={
                    errores.sentido ? "error-sentido" : undefined
                  }
                  className="h-4 w-4 accent-(--color-primario)"
                />
                {etiqueta}
              </label>
            ))}
          </div>
          {errores.sentido && (
            <p id="error-sentido" className="text-sm text-(--color-peligro)">
              {errores.sentido}
            </p>
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
        value={seleccion.cantidad}
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
          value={seleccion.ubicacionId}
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

      <button
        type="submit"
        disabled={guardando || refrescando}
        className={CLASES_BOTON_PRIMARIO}
      >
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
  //
  // `conservarFormulario` lo usa el refresco que se pide desde el formulario ya
  // abierto: si ahí falla, no se escribe `error` de la página, porque eso
  // reemplazaría el formulario por el banner y tiraría todo lo cargado. En ese
  // modo el fallo se informa en el valor de retorno y lo muestra quien llamó.
  //
  // Se devuelve `{ ok, error }` y no un booleano para no perder el mensaje del
  // backend: un 401 por sesión vencida y un 500 necesitan decir cosas
  // distintas, y `apiFetch` ya los trae redactados para un comerciante.
  const cargar = useCallback(
    ({ conservarFormulario = false } = {}) =>
      Promise.all([obtenerProductos(), obtenerUbicaciones()])
        .then(([productos, ubicaciones]) => {
          if (!montado.current) return { ok: false, error: "" };
          setDatos({ productos, ubicaciones });
          setError("");
          return { ok: true, error: "" };
        })
        .catch((fallo) => {
          if (montado.current && !conservarFormulario) setError(fallo.message);
          return { ok: false, error: fallo.message };
        })
        .finally(() => {
          if (montado.current && !conservarFormulario) setCargando(false);
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
              mensaje="Todavía no hay productos cargados."
              a="/productos"
              accion="Ir a Productos →"
            />
          )}

          {datos.productos.length > 0 && datos.ubicaciones.length === 0 && (
            <Bloqueado
              mensaje="Todavía no hay ninguna ubicación configurada."
              a="/configuracion?seccion=ubicaciones"
              accion="Ir a Configuración →"
            />
          )}

          {datos.productos.length > 0 && datos.ubicaciones.length > 0 && (
            <FormularioMovimiento
              productos={datos.productos}
              ubicaciones={datos.ubicaciones}
              alRecargar={cargar}
            />
          )}
        </>
      )}
    </main>
  );
}
