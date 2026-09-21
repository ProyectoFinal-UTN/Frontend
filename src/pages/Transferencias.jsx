import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Campo from "../components/Campo";
import CampoSelect from "../components/CampoSelect";
import { obtenerUbicaciones } from "../services/configuracion";
import { MOTIVO_MAXIMO } from "../services/movimientos";
import { obtenerProducto, obtenerProductos } from "../services/productos";
import { transferirStock } from "../services/transferencias";
import {
  UNIDADES_CONTINUAS,
  formatearCantidad,
  validarTransferencia,
} from "./Transferencias.validacion";

/**
 * Transferencia de stock entre ubicaciones (HU-12): pasar mercadería del
 * depósito al local o al revés.
 *
 * Mismo armado que `RegistrarMovimiento` (HU-13): una sola pantalla, la
 * confirmación acá mismo con el stock que quedó, y los errores del backend
 * mostrados tal cual porque ya vienen redactados para un comerciante.
 *
 * Lo propio de esta pantalla es que el POST **no es idempotente**: un doble
 * envío son dos transferencias reales. Ver `alEnviar`.
 */

const CLASES_BOTON_PRIMARIO =
  "rounded-(--radius) bg-(--color-primario) px-5 py-3 font-bold " +
  "text-(--color-primario-texto) transition hover:opacity-90 " +
  "focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave) " +
  "disabled:opacity-60";

const CLASES_BOTON_PELIGRO =
  "mt-2 rounded-(--radius) bg-(--color-peligro) px-3 py-2 text-sm font-bold " +
  "text-(--color-peligro-texto) transition focus:outline-none focus:ring-4 " +
  "focus:ring-(--color-primario-suave) disabled:opacity-60";

const CLASES_LINK = "font-bold text-(--color-primario) underline";

/** Lo que muestra un error de red, que no es lo mismo que "no se hizo". */
const MENSAJE_SIN_CONFIRMAR =
  "No pudimos confirmar si la transferencia se hizo. Revisá el stock antes de volver a intentar.";

/** Nombre de un producto o de una ubicación por id, o `null` si no está. */
function nombreDe(lista, id) {
  return lista.find((item) => item.id === id)?.nombre ?? null;
}

/** El id si sigue existiendo en la lista, o "" si desapareció del catálogo. */
function idVigente(lista, id) {
  return lista.some((item) => item.id === id) ? id : "";
}

/**
 * El texto de la confirmación.
 *
 * Los nombres y la cantidad salen de lo que se envió, así que siempre están.
 * Los saldos salen de la respuesta, y un 2xx con cuerpo ilegible sigue siendo
 * una transferencia hecha: en ese caso se confirma sin la segunda frase en vez
 * de mostrar "quedaron null".
 */
function mensajeConfirmacion({
  producto,
  unidad,
  origen,
  destino,
  cantidad,
  saldoOrigen,
  saldoDestino,
}) {
  const hecho =
    `Listo. Transferiste ${formatearCantidad(cantidad, unidad)} de ${producto} ` +
    `de ${origen} a ${destino}.`;

  if (saldoOrigen === null || saldoDestino === null) {
    return hecho;
  }

  return (
    `${hecho} Ahora hay ${formatearCantidad(saldoOrigen, unidad)} en ${origen} ` +
    `y ${formatearCantidad(saldoDestino, unidad)} en ${destino}.`
  );
}

/** Un saldo de la respuesta si es un número, o `null`. */
function saldo(fila) {
  return typeof fila?.cantidad === "number" ? fila.cantidad : null;
}

/**
 * Lo que falta configurar antes de poder transferir, con el link para ir a
 * hacerlo. Copia local del `Bloqueado` de `RegistrarMovimiento`, que no se
 * exporta: exportarlo era tocar el archivo de HU-13.
 *
 * El link lleva a la pantalla sin prometer que ahí se pueda crear: un
 * `empleado` solo tiene lectura sobre productos y ubicaciones.
 */
function Bloqueado({ mensaje, a, accion, testId }) {
  return (
    <div
      data-testid={testId}
      className="rounded-(--radius) bg-(--color-apagado) px-4 py-8 text-center"
    >
      <p className="font-bold text-(--color-texto)">{mensaje}</p>
      <Link to={a} className={`mt-3 inline-block text-sm ${CLASES_LINK}`}>
        {accion}
      </Link>
    </div>
  );
}

function FormularioTransferencia({
  productos,
  ubicaciones,
  productoInicial,
  alRecargar,
}) {
  const [campos, setCampos] = useState({
    productoId: productoInicial,
    ubicacionOrigenId: "",
    ubicacionDestinoId: "",
    cantidad: "",
    motivo: "",
  });
  const [errores, setErrores] = useState({});
  // `{ tipo, mensaje }`: el tipo decide qué salida se ofrece junto al mensaje.
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [avisoStock, setAvisoStock] = useState("");
  const [confirmacion, setConfirmacion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  // El stock del producto elegido, por ubicación. Se guarda con el producto y
  // la versión que lo pidieron, así "¿es el de ahora?" se deriva en el render
  // en vez de mantener un flag de "cargando" a mano.
  const [stockProducto, setStockProducto] = useState(null);
  // Subirla vuelve a pedir el stock del mismo producto: después de un 409, de
  // un error de red o de una confirmación sin saldos.
  const [versionStock, setVersionStock] = useState(0);

  // Candado del envío. Tiene que ser una ref y no el estado `guardando`: el
  // estado recién cambia en el render siguiente, y dos submits en el mismo
  // tick —doble click, Enter + click— lo verían los dos en `false`. La ref se
  // escribe y se lee de forma síncrona, así que el segundo la encuentra
  // cerrada.
  const enVuelo = useRef(false);

  // React 19 pasa `ref` como una prop más y `Campo` la reenvía al `<input>`.
  const cantidadRef = useRef(null);
  // Pedido de foco para después del render: cuando vuelve el 409 la cantidad
  // todavía está deshabilitada por el envío, y un `focus()` ahí no hace nada.
  const enfocarCantidad = useRef(false);

  // Un refresco puede traer listas donde ya no está lo elegido. Se descarta
  // derivando en el render, como en HU-13, así el campo que se ve vacío está
  // vacío para todos los efectos. De acá en adelante se usa `seleccion`.
  const origen = idVigente(ubicaciones, campos.ubicacionOrigenId);
  const destinoVigente = idVigente(ubicaciones, campos.ubicacionDestinoId);
  const seleccion = {
    ...campos,
    productoId: idVigente(productos, campos.productoId),
    ubicacionOrigenId: origen,
    // Si cambian el origen al que era el destino, el destino se cae: nunca
    // viaja un par con los dos iguales.
    ubicacionDestinoId: destinoVigente === origen ? "" : destinoVigente,
  };

  const productoId = seleccion.productoId;
  const producto = productos.find((item) => item.id === productoId) ?? null;
  const unidad = producto?.unidadMedida ?? "unidad";
  const nombreOrigen = nombreDe(ubicaciones, origen);

  useEffect(() => {
    if (!productoId) return undefined;

    // Si cambian de producto antes de que vuelva la respuesta, la vieja se
    // descarta: si no, el disponible de un producto quedaría mostrado junto
    // al nombre del otro.
    let vigente = true;

    obtenerProducto(productoId)
      .then((datos) => {
        if (!vigente) return;
        setStockProducto({
          productoId,
          version: versionStock,
          porUbicacion: datos?.stock?.porUbicacion ?? [],
          error: "",
        });
      })
      .catch((fallo) => {
        if (!vigente) return;
        setStockProducto({
          productoId,
          version: versionStock,
          porUbicacion: null,
          error: fallo.message,
          // Un 401 no se arregla consultando de nuevo: pide volver a entrar.
          sesionVencida: fallo.status === 401,
        });
      });

    return () => {
      vigente = false;
    };
  }, [productoId, versionStock]);

  useEffect(() => {
    if (enfocarCantidad.current && !guardando) {
      enfocarCantidad.current = false;
      cantidadRef.current?.focus();
      cantidadRef.current?.select();
    }
  });

  const consultando =
    Boolean(productoId) &&
    (stockProducto?.productoId !== productoId ||
      stockProducto?.version !== versionStock);
  const stockVigente = productoId && !consultando ? stockProducto : null;
  const porUbicacion = stockVigente?.porUbicacion ?? null;
  const errorStock = stockVigente?.error ?? "";

  const saldoEn = (ubicacionId) =>
    porUbicacion?.find((fila) => fila.ubicacionId === ubicacionId)?.cantidad ??
    null;

  const disponible = origen ? saldoEn(origen) : null;
  const sinStock = disponible === 0;
  // Con producto y origen elegidos pero sin saldo conocido —consultando,
  // consulta fallida, u origen que no vino en la respuesta— no se deja enviar:
  // sería renunciar al bloqueo por stock que pide la historia.
  const stockDesconocido = Boolean(productoId && origen) && disponible === null;

  /** "Depósito (12 kg)" cuando se conoce el saldo; si no, solo el nombre. */
  function opcionUbicacion(ubicacion) {
    const cantidad = saldoEn(ubicacion.id);
    return cantidad === null
      ? ubicacion.nombre
      : `${ubicacion.nombre} (${formatearCantidad(cantidad, unidad)})`;
  }

  function alEscribir(evento) {
    const { name, value } = evento.target;

    setCampos((previos) => ({
      ...previos,
      [name]: value,
      // Si el origen nuevo es el destino elegido, el destino se borra acá, en
      // el estado. Esconderlo solo en el render (`seleccion`) no alcanza: al
      // volver al origen anterior reaparecería elegido sin que nadie lo elija.
      ...(name === "ubicacionOrigenId" && value === previos.ubicacionDestinoId
        ? { ubicacionDestinoId: "" }
        : {}),
    }));

    // El error se limpia apenas tocan el campo, y la confirmación se va cuando
    // arranca la transferencia siguiente: si quedara, nombraría al producto
    // anterior mientras el formulario ya muestra otro.
    setErrores((previos) => ({
      ...previos,
      [name]: undefined,
      // Estos dos errores dependen de más de un campo: el tope por stock sale
      // del producto y del origen, y "distinto del origen" del origen. Si solo
      // se limpiara el campo tocado, al cambiar de origen quedaría un «Hay 3
      // en Depósito» debajo de un panel que ya dice 50 en Local.
      ...(name === "productoId" || name === "ubicacionOrigenId"
        ? { cantidad: undefined, ubicacionDestinoId: undefined }
        : {}),
    }));
    setErrorGeneral(null);
    setAvisoStock("");
    setConfirmacion(null);
  }

  function reconsultarStock() {
    setVersionStock((version) => version + 1);
  }

  /**
   * La salida del panel cuando no se sabe cuánto hay en el origen.
   *
   * Recarga también el catálogo y las ubicaciones, no solo el stock: si el
   * producto se dio de baja desde otra pantalla, volver a pedir su stock
   * fallaría igual en cada click. Con las listas nuevas, lo que ya no existe
   * se cae del formulario (`idVigente`) y el callejón se abre solo.
   *
   * No toca `errorGeneral`, a diferencia de `refrescar`: si hay un «no
   * pudimos confirmar» en pantalla, tiene que seguir ahí.
   */
  async function consultarDeNuevo() {
    setRefrescando(true);
    await alRecargar({ conservarFormulario: true });
    setRefrescando(false);
    reconsultarStock();
  }

  /**
   * Qué mostrar según cómo falló el POST.
   *
   * El 409 va aparte, como aviso y no como error: es una respuesta del negocio
   * (alguien vendió entre que se cargó la pantalla y el envío), no una falla.
   * Por eso además de mostrarlo se vuelve a pedir el stock: el disponible que
   * se ve dejó de ser cierto.
   *
   * Un fallo sin `status` es de red, y un 5xx puede ser el proxy de Render
   * cortando por tiempo (502/503/504) con la transacción ya confirmada del
   * otro lado. En los dos casos la request pudo haberse aplicado: decir "no se
   * hizo" invita a reintentar y, con un endpoint que no es idempotente, a
   * transferir dos veces. Un 500 del backend casi siempre es un rollback,
   * pero desde acá no se distingue: se lo trata igual.
   */
  function mostrarFallo(fallo) {
    if (fallo.status === 409) {
      setAvisoStock(fallo.message);
      reconsultarStock();
      enfocarCantidad.current = true;
      return;
    }

    if (!fallo.status || fallo.status >= 500) {
      setErrorGeneral({ tipo: "red", mensaje: MENSAJE_SIN_CONFIRMAR });
      reconsultarStock();
      return;
    }

    if (fallo.status === 401) {
      setErrorGeneral({ tipo: "sesion", mensaje: fallo.message });
      return;
    }

    if (fallo.status === 403) {
      setErrorGeneral({ tipo: "permiso", mensaje: fallo.message });
      return;
    }

    setErrorGeneral({ tipo: "general", mensaje: fallo.message });
  }

  async function alEnviar(evento) {
    evento.preventDefault();

    // Primera línea a propósito, antes de validar: ver `enVuelo`. El botón
    // es el único `type="submit"` del form y no tiene `onClick` propio, así
    // que el click y el Enter en cualquier campo entran los dos por acá.
    if (enVuelo.current) return;

    const encontrados = validarTransferencia(seleccion, {
      disponible,
      unidad,
      nombreOrigen,
    });
    setErrores(encontrados);

    if (Object.keys(encontrados).length > 0) {
      return;
    }

    enVuelo.current = true;
    setGuardando(true);
    setErrorGeneral(null);
    setAvisoStock("");
    setConfirmacion(null);

    const datos = {
      productoId,
      ubicacionOrigenId: origen,
      ubicacionDestinoId: seleccion.ubicacionDestinoId,
      // Número y no el string del input: el backend chequea el tipo.
      cantidad: Number(seleccion.cantidad),
    };

    // Opcional: solo viaja si hay algo escrito, y recortado, que es lo que el
    // backend guarda.
    const motivo = seleccion.motivo.trim();
    if (motivo) {
      datos.motivo = motivo;
    }

    // El `try` envuelve solo el pedido. Lo que sigue corre con la
    // transferencia ya hecha, y un error ahí no puede mostrarse como si no se
    // hubiera hecho: quien lo lea vuelve a enviar y la mercadería se mueve dos
    // veces.
    let respuesta;

    try {
      respuesta = await transferirStock(datos);
    } catch (fallo) {
      mostrarFallo(fallo);
      return;
    } finally {
      enVuelo.current = false;
      setGuardando(false);
    }

    const saldoOrigen = saldo(respuesta?.stock?.origen);
    const saldoDestino = saldo(respuesta?.stock?.destino);

    setConfirmacion({
      producto: producto.nombre,
      unidad,
      origen: nombreOrigen,
      destino: nombreDe(ubicaciones, datos.ubicacionDestinoId),
      cantidad: datos.cantidad,
      saldoOrigen,
      saldoDestino,
    });

    if (saldoOrigen !== null && saldoDestino !== null) {
      // Los saldos nuevos vienen en la respuesta: se aplican acá y el
      // disponible queda al día sin otro pedido.
      setStockProducto((previo) =>
        previo?.productoId === datos.productoId && previo.porUbicacion
          ? {
              ...previo,
              porUbicacion: previo.porUbicacion.map((fila) => {
                if (fila.ubicacionId === datos.ubicacionOrigenId) {
                  return { ...fila, cantidad: saldoOrigen };
                }
                if (fila.ubicacionId === datos.ubicacionDestinoId) {
                  return { ...fila, cantidad: saldoDestino };
                }
                return fila;
              }),
            }
          : previo,
      );
    } else {
      // Sin saldos en la respuesta no hay otra forma de saber cuánto quedó.
      reconsultarStock();
    }

    // Producto, origen y destino quedan: la segunda transferencia seguida
    // cuesta un campo. El motivo se limpia con la cantidad porque dos
    // transferencias seguidas rara vez son por lo mismo.
    setCampos((previos) => ({ ...previos, cantidad: "", motivo: "" }));
  }

  /**
   * Vuelve a pedir productos, ubicaciones y el stock sin desmontar el
   * formulario. Es la salida para un 400/404 que salió de datos viejos: una
   * ubicación borrada o un producto dado de baja desde otra pantalla.
   */
  async function refrescar() {
    setRefrescando(true);

    const { ok, error } = await alRecargar({ conservarFormulario: true });

    setRefrescando(false);
    reconsultarStock();

    setErrorGeneral(
      ok
        ? null
        : {
            tipo: "general",
            mensaje: error || "No pudimos actualizar los datos. Probá de nuevo.",
          },
    );
  }

  return (
    <form
      onSubmit={alEnviar}
      noValidate
      aria-label="Transferir stock"
      aria-busy={guardando}
      className="flex flex-col gap-4 rounded-(--radius) border-2
                 border-(--color-borde) bg-(--color-tarjeta) p-4"
    >
      {confirmacion && (
        <p
          role="status"
          data-testid="transferencia-confirmacion"
          className="rounded-(--radius) bg-(--color-exito-suave) px-4 py-3
                     text-sm font-semibold text-(--color-exito)"
        >
          {mensajeConfirmacion(confirmacion)}
        </p>
      )}

      {avisoStock && (
        <div
          role="alert"
          data-testid="transferencia-aviso-stock"
          className="rounded-(--radius) bg-(--color-atencion-suave) px-4 py-3
                     text-sm text-(--color-texto)"
        >
          <p className="font-bold">{avisoStock}</p>
          {/*
            Neutro a propósito: hay dos 409 posibles y uno es el tope del
            destino, así que "elegí otro origen" no siempre sería cierto.
          */}
          <p className="mt-1">Revisá la cantidad.</p>
        </div>
      )}

      {errorGeneral && (
        <div
          role="alert"
          data-testid="transferencia-error"
          className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          <p>{errorGeneral.mensaje}</p>

          {errorGeneral.tipo === "red" && (
            <Link
              to={`/movimientos?tipo=transferencia&productoId=${productoId}`}
              className={`mt-2 inline-block ${CLASES_LINK}`}
            >
              Ver transferencias de este producto →
            </Link>
          )}

          {errorGeneral.tipo === "sesion" && (
            <Link to="/login" className={`mt-2 inline-block ${CLASES_LINK}`}>
              Volver a iniciar sesión
            </Link>
          )}

          {/*
            Fuera del fieldset a propósito: si quedara adentro, se
            deshabilitaría junto con el resto mientras hay un envío en curso.
            Y deshabilitado mientras se envía por lo mismo que en HU-13: las
            dos operaciones escriben `errorGeneral`.
          */}
          {errorGeneral.tipo === "general" && (
            <button
              type="button"
              disabled={refrescando || guardando}
              onClick={refrescar}
              className={CLASES_BOTON_PELIGRO}
            >
              {refrescando ? "Actualizando…" : "Actualizar datos"}
            </button>
          )}
        </div>
      )}

      {/*
        Todo lo editable queda deshabilitado mientras la transferencia está en
        vuelo, así los datos no cambian entre el envío y la confirmación. No es
        esto lo que evita el doble envío —eso es `enVuelo`—, pero con el botón
        por defecto deshabilitado el navegador tampoco hace el submit implícito
        del Enter.
      */}
      <fieldset
        disabled={guardando}
        className="flex min-w-0 flex-col gap-4 border-0 p-0"
      >
        <CampoSelect
          id="productoId"
          etiqueta="Producto"
          value={seleccion.productoId}
          onChange={alEscribir}
          error={errores.productoId}
        >
          <option value="">Elegí un producto…</option>
          {productos.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nombre}
            </option>
          ))}
        </CampoSelect>

        <CampoSelect
          id="ubicacionOrigenId"
          etiqueta="Origen"
          value={seleccion.ubicacionOrigenId}
          onChange={alEscribir}
          error={errores.ubicacionOrigenId}
        >
          <option value="">¿De dónde sale?</option>
          {ubicaciones.map((ubicacion) => (
            <option key={ubicacion.id} value={ubicacion.id}>
              {opcionUbicacion(ubicacion)}
            </option>
          ))}
        </CampoSelect>

        {productoId && origen && (
          <div
            data-testid="transferencia-disponible"
            aria-live="polite"
            className="rounded-(--radius) bg-(--color-apagado) px-4 py-3 text-sm
                       text-(--color-texto)"
          >
            {consultando && <p>Consultando stock…</p>}

            {/*
              Dos formas de no saber cuánto hay: la consulta falló, o volvió
              sin esta ubicación (se creó después de consultar). En las dos el
              envío queda bloqueado, así que el cartel tiene que traer la
              salida: nada se vuelve a consultar solo.
            */}
            {stockDesconocido && !consultando && (
              <>
                <p className={errorStock ? "text-(--color-peligro)" : undefined}>
                  {errorStock || `No sabemos cuánto hay en ${nombreOrigen}.`}
                </p>
                {stockVigente?.sesionVencida ? (
                  <Link to="/login" className={`mt-2 inline-block ${CLASES_LINK}`}>
                    Volver a iniciar sesión
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={refrescando}
                    onClick={consultarDeNuevo}
                    className={CLASES_BOTON_PELIGRO}
                  >
                    {refrescando ? "Consultando…" : "Consultar de nuevo"}
                  </button>
                )}
              </>
            )}

            {!consultando && !errorStock && sinStock && (
              <p className="font-bold">
                No hay stock de {producto.nombre} en {nombreOrigen}. Elegí otro
                origen.
              </p>
            )}

            {!consultando && !errorStock && disponible > 0 && (
              <p>
                Disponible en {nombreOrigen}:{" "}
                <strong>{formatearCantidad(disponible, unidad)}</strong>
              </p>
            )}
          </div>
        )}

        {/* El origen no está entre las opciones: el backend lo rechaza igual. */}
        <CampoSelect
          id="ubicacionDestinoId"
          etiqueta="Destino"
          value={seleccion.ubicacionDestinoId}
          onChange={alEscribir}
          error={errores.ubicacionDestinoId}
        >
          <option value="">¿A dónde va?</option>
          {ubicaciones
            .filter((ubicacion) => ubicacion.id !== origen)
            .map((ubicacion) => (
              <option key={ubicacion.id} value={ubicacion.id}>
                {opcionUbicacion(ubicacion)}
              </option>
            ))}
        </CampoSelect>

        <div className="flex flex-col gap-1.5">
          <Campo
            id="cantidad"
            etiqueta="Cantidad"
            type="number"
            min="1"
            step="1"
            max={disponible > 0 ? disponible : undefined}
            inputMode="numeric"
            autoComplete="off"
            placeholder="1"
            value={seleccion.cantidad}
            onChange={alEscribir}
            error={errores.cantidad}
            disabled={sinStock}
            ref={cantidadRef}
          />
          {/*
            `movimiento.cantidad` es un integer en la base (HU-13), así que un
            producto en kg o l también se transfiere en enteros. Sin este
            aviso, que el campo rechace 1,5 kg parecería un bug.
          */}
          {UNIDADES_CONTINUAS.includes(unidad) && (
            <p className="text-sm text-(--color-texto-apagado)">
              Las transferencias se cargan en números enteros (por ejemplo 3{" "}
              {unidad}). Todavía no se admiten fracciones.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Campo
            id="motivo"
            etiqueta="Motivo (opcional)"
            type="text"
            autoComplete="off"
            maxLength={MOTIVO_MAXIMO}
            placeholder="Reposición de góndola…"
            value={seleccion.motivo}
            onChange={alEscribir}
            error={errores.motivo}
          />
          {/*
            HU-15 no usa `maxLength` porque recorta en silencio lo que se pega
            de más. Acá se pidió el tope, y el contador es lo que hace visible
            ese recorte.
          */}
          <p className="self-end text-xs text-(--color-texto-apagado)">
            {seleccion.motivo.length}/{MOTIVO_MAXIMO}
          </p>
        </div>

        <button
          type="submit"
          disabled={guardando || refrescando || stockDesconocido || sinStock}
          className={CLASES_BOTON_PRIMARIO}
        >
          {guardando ? "Transfiriendo…" : "Transferir"}
        </button>
      </fieldset>
    </form>
  );
}

export default function Transferencias() {
  const [parametros] = useSearchParams();
  // Se lee una sola vez, como valor inicial. No se sincroniza con la URL:
  // si después eligen otro producto, el de la URL no tiene que volver.
  const [productoInicial] = useState(() => parametros.get("productoId") ?? "");

  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  // La carga inicial y el reintento pueden volver con la pantalla desmontada.
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Mismo contrato que en `RegistrarMovimiento`: con `conservarFormulario` el
  // fallo no reemplaza el formulario por el banner, se devuelve a quien llamó.
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
        <Link to="/" className={`text-sm ${CLASES_LINK}`}>
          ← Volver al inicio
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold text-(--color-texto)">
          Transferir stock
        </h1>
        <p className="mt-2 text-(--color-texto-apagado)">
          Pasá mercadería de una ubicación a otra: se descuenta del origen y se
          suma al destino en una sola operación.
        </p>
      </header>

      {cargando && (
        <p className="text-(--color-texto-apagado)">Cargando datos…</p>
      )}

      {!cargando && error && (
        <div
          role="alert"
          className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setCargando(true);
              cargar();
            }}
            className={CLASES_BOTON_PELIGRO}
          >
            Reintentar
          </button>
        </div>
      )}

      {!cargando && !error && datos && (
        <>
          {/*
            Con menos de dos ubicaciones no hay a dónde transferir: un
            formulario ahí solo serviría para llegar a un 400.
          */}
          {datos.ubicaciones.length < 2 && (
            <Bloqueado
              testId="transferencia-sin-ubicaciones"
              mensaje="Para transferir necesitás al menos dos ubicaciones (por ejemplo Depósito y Local)."
              a="/configuracion?seccion=ubicaciones"
              accion="Ir a Configuración →"
            />
          )}

          {datos.ubicaciones.length >= 2 && datos.productos.length === 0 && (
            <Bloqueado
              mensaje="Todavía no hay productos cargados."
              a="/productos"
              accion="Ir a Productos →"
            />
          )}

          {datos.ubicaciones.length >= 2 && datos.productos.length > 0 && (
            <FormularioTransferencia
              productos={datos.productos}
              ubicaciones={datos.ubicaciones}
              productoInicial={productoInicial}
              alRecargar={cargar}
            />
          )}
        </>
      )}
    </main>
  );
}
