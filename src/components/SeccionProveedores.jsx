import { useState } from "react";
import { Link } from "react-router-dom";
import AvisoDeError from "./AvisoDeError";
import Campo from "./Campo";
import ProductosDelProveedor from "./ProductosDelProveedor";
import {
  crearProveedor,
  editarProveedor,
  eliminarProveedor,
} from "../services/proveedores";
import { validarProveedor } from "../pages/Proveedores.validacion";

/**
 * Directorio de proveedores: alta, edición y baja (HU-19).
 *
 * Mismo esquema que `SeccionProductos`: cada operación recarga la lista desde
 * el servidor en vez de adivinar el estado nuevo, así lo que se ve es lo que
 * hay.
 */

const CLASES_BOTON_SUAVE =
  "rounded-(--radius) px-3 py-2 text-sm font-bold transition " +
  "focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave)";

const CLASES_BOTON_PRIMARIO =
  "rounded-(--radius) bg-(--color-primario) px-5 py-3 font-bold " +
  "text-(--color-primario-texto) transition hover:opacity-90 " +
  "focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave) " +
  "disabled:opacity-60";

const CAMPOS = [
  "nombre",
  "contacto",
  "telefono",
  "correo",
  "rubro",
  "condicionesPago",
];

const CAMPOS_VACIOS = Object.fromEntries(CAMPOS.map((campo) => [campo, ""]));

/**
 * Formulario de alta y de edición. Son el mismo: a diferencia de productos,
 * acá no hay ningún dato que exista solo en el alta.
 *
 * `alGuardar` devuelve el error del backend (o `null`) para poder anclar el
 * 409 de nombre repetido al campo del nombre.
 */
function FormularioProveedor({ modo, inicial, alGuardar, alCancelar, guardando }) {
  const esEdicion = modo === "edicion";

  const [campos, setCampos] = useState({ ...CAMPOS_VACIOS, ...inicial });
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState("");

  function alEscribir(evento) {
    const { name, value } = evento.target;
    setCampos((previos) => ({ ...previos, [name]: value }));
    setErrores((previos) => ({ ...previos, [name]: undefined }));
    setErrorGeneral("");
  }

  async function alEnviar(evento) {
    evento.preventDefault();

    const encontrados = validarProveedor(campos);
    setErrores(encontrados);

    if (Object.keys(encontrados).length > 0) {
      return;
    }

    setErrorGeneral("");

    // Se mandan los seis campos siempre, también vacíos: en la edición, vaciar
    // un campo es la forma de borrar ese dato, y el backend guarda "" como
    // null.
    const datos = Object.fromEntries(
      CAMPOS.map((campo) => [campo, campos[campo].trim()]),
    );

    const fallo = await alGuardar(datos);

    if (!fallo) {
      return;
    }

    if (fallo.status === 409) {
      setErrores({ nombre: fallo.message });
      return;
    }

    setErrorGeneral(fallo.message);
  }

  return (
    <form
      onSubmit={alEnviar}
      noValidate
      aria-label={esEdicion ? "Editar proveedor" : "Nuevo proveedor"}
      className="mt-4 flex flex-col gap-4 rounded-(--radius) border-2
                 border-(--color-borde) bg-(--color-tarjeta) p-4"
    >
      <h3 className="text-lg font-extrabold text-(--color-texto)">
        {esEdicion ? "Editar proveedor" : "Nuevo proveedor"}
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
        id="nombre"
        etiqueta="Nombre"
        autoComplete="off"
        placeholder="Distribuidora Sur"
        value={campos.nombre}
        onChange={alEscribir}
        error={errores.nombre}
      />

      {/* En dos columnas desde tablet: son datos cortos y van de a pares. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id="contacto"
          etiqueta="Persona de contacto (opcional)"
          autoComplete="off"
          placeholder="Laura Gómez"
          value={campos.contacto}
          onChange={alEscribir}
          error={errores.contacto}
        />

        <Campo
          id="telefono"
          etiqueta="Teléfono (opcional)"
          type="tel"
          autoComplete="off"
          placeholder="11 5555-0000"
          value={campos.telefono}
          onChange={alEscribir}
          error={errores.telefono}
        />

        <Campo
          id="correo"
          etiqueta="Correo (opcional)"
          type="email"
          autoComplete="off"
          placeholder="ventas@distrisur.com"
          value={campos.correo}
          onChange={alEscribir}
          error={errores.correo}
        />

        <Campo
          id="rubro"
          etiqueta="Rubro (opcional)"
          autoComplete="off"
          placeholder="Bebidas"
          value={campos.rubro}
          onChange={alEscribir}
          error={errores.rubro}
        />
      </div>

      <Campo
        id="condicionesPago"
        etiqueta="Condiciones de pago (opcional)"
        autoComplete="off"
        placeholder="30 días, contado, 50% al pedir…"
        value={campos.condicionesPago}
        onChange={alEscribir}
        error={errores.condicionesPago}
      />

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
 * Una fila del directorio, que alterna entre verse y pedir confirmación de
 * borrado. `guardando` deshabilita los botones mientras hay una operación en
 * curso, para que un doble clic no mande dos DELETE.
 */
function FilaProveedor({ proveedor, alEditar, alEliminar, guardando, puedeEditar }) {
  const [confirmando, setConfirmando] = useState(false);
  // Los productos se piden recién al abrir el panel: con veinte proveedores en
  // la lista serían veinte requests para mostrar algo que nadie pidió ver.
  const [viendoProductos, setViendoProductos] = useState(false);

  if (confirmando) {
    return (
      <li className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3">
        <p className="text-sm font-bold text-(--color-peligro)">
          ¿Eliminar «{proveedor.nombre}»?
        </p>
        <p className="mt-1 text-sm text-(--color-peligro)">
          Deja de aparecer en la lista, pero las compras que ya le registraste
          siguen en el historial.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={guardando}
            onClick={() => alEliminar(proveedor.id)}
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

  // Cada línea aparece solo si tiene algo: un proveedor cargado con el nombre
  // y nada más no muestra renglones de guiones.
  const comercial = [proveedor.rubro, proveedor.condicionesPago]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="rounded-(--radius) border-2 border-(--color-borde) px-4 py-3">
      <div
        className="flex flex-col gap-3 sm:flex-row sm:items-center
                   sm:justify-between"
      >
        <div className="min-w-0">
          <p className="font-bold text-(--color-texto)">{proveedor.nombre}</p>
          {comercial && (
            <p className="text-sm text-(--color-texto-apagado)">{comercial}</p>
          )}
          {(proveedor.contacto || proveedor.telefono || proveedor.correo) && (
            <p className="flex flex-wrap gap-x-3 text-sm text-(--color-texto-apagado)">
              {proveedor.contacto && <span>{proveedor.contacto}</span>}
              {/*
                Links y no texto: desde el celular, tocar el teléfono llama y
                tocar el correo abre el mail. Es para lo que se carga el dato.
              */}
              {proveedor.telefono && (
                <a
                  href={`tel:${proveedor.telefono.replace(/[^\d+]/g, "")}`}
                  className="text-(--color-primario) underline"
                >
                  {proveedor.telefono}
                </a>
              )}
              {proveedor.correo && (
                <a
                  href={`mailto:${proveedor.correo}`}
                  className="break-all text-(--color-primario) underline"
                >
                  {proveedor.correo}
                </a>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          {/* Qué se le compra (HU-20). */}
          <button
            type="button"
            onClick={() => setViendoProductos((abierto) => !abierto)}
            aria-expanded={viendoProductos}
            aria-label={`Productos de ${proveedor.nombre}`}
            className={`${CLASES_BOTON_SUAVE} text-(--color-primario)`}
          >
            Productos
          </button>
          {/* El historial ya filtra por proveedor desde HU-14. */}
          <Link
            to={`/movimientos?proveedorId=${proveedor.id}`}
            aria-label={`Ver compras a ${proveedor.nombre}`}
            className={`${CLASES_BOTON_SUAVE} text-(--color-primario)`}
          >
            Ver compras
          </Link>
          {puedeEditar && (
            <>
              <button
                type="button"
                disabled={guardando}
                onClick={() => alEditar(proveedor)}
                aria-label={`Editar ${proveedor.nombre}`}
                data-testid={`proveedor-editar-${proveedor.id}`}
                className={`${CLASES_BOTON_SUAVE} text-(--color-primario) disabled:opacity-60`}
              >
                Editar
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={() => setConfirmando(true)}
                aria-label={`Eliminar ${proveedor.nombre}`}
                data-testid={`proveedor-eliminar-${proveedor.id}`}
                className={`${CLASES_BOTON_SUAVE} text-(--color-peligro) disabled:opacity-60`}
              >
                Eliminar
              </button>
            </>
          )}
        </div>
      </div>

      {viendoProductos && (
        <div className="mt-3 border-t-2 border-(--color-borde) pt-3">
          <ProductosDelProveedor
            proveedorId={proveedor.id}
            puedeEditar={puedeEditar}
          />
        </div>
      )}
    </li>
  );
}

export default function SeccionProveedores({
  proveedores,
  alRecargar,
  // Como prop y no del hook, igual que en `SeccionProductos`: así se prueba
  // sin montar el store de permisos.
  puedeEditar = true,
}) {
  // `null` = ningún formulario abierto; `{ modo, inicial }` = el que se ve.
  const [formulario, setFormulario] = useState(null);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  function abrirAlta() {
    setMensaje("");
    setFormulario({ modo: "alta", inicial: {} });
  }

  function abrirEdicion(proveedor) {
    setMensaje("");
    setFormulario({
      modo: "edicion",
      inicial: {
        id: proveedor.id,
        // El backend devuelve null en los opcionales vacíos, y un input
        // controlado necesita string.
        ...Object.fromEntries(CAMPOS.map((campo) => [campo, proveedor[campo] ?? ""])),
      },
    });
  }

  /**
   * Corre una operación contra el backend y recarga la lista. Devuelve el
   * error en vez de tragárselo, para que quien llama decida dónde mostrarlo.
   */
  async function ejecutar(operacion) {
    setError(null);
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
        ? editarProveedor(formulario.inicial.id, datos)
        : crearProveedor(datos),
    );

    if (!fallo) {
      setFormulario(null);
      setMensaje(
        esEdicion
          ? `Se guardaron los cambios de «${datos.nombre}».`
          : `«${datos.nombre}» se agregó a tus proveedores.`,
      );
      return null;
    }

    // Lo dieron de baja mientras lo editaban (otra pestaña u otro usuario).
    if (fallo.status === 404) {
      setFormulario(null);
      setError(new Error("Ese proveedor ya no existe. Actualizamos la lista."));
      await alRecargar();
      return null;
    }

    return fallo;
  }

  async function eliminar(id) {
    const fallo = await ejecutar(() => eliminarProveedor(id));
    if (fallo) {
      setError(fallo);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-(--color-texto)">
            Tus proveedores
          </h2>
          <p className="mt-1 text-sm text-(--color-texto-apagado)">
            A quién le comprás, cómo contactarlo y en qué condiciones.
          </p>
        </div>
        {!formulario && puedeEditar && (
          <button
            type="button"
            disabled={guardando}
            onClick={abrirAlta}
            data-testid="proveedores-nuevo"
            className={CLASES_BOTON_PRIMARIO}
          >
            + Nuevo proveedor
          </button>
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

      {/* `AvisoDeError` sabe mostrar un 403 de rol sin desloguear (HU-32). */}
      {error && (
        <div className="mt-4">
          <AvisoDeError fallo={error} />
        </div>
      )}

      {formulario && (
        <FormularioProveedor
          key={formulario.inicial.id ?? "alta"}
          modo={formulario.modo}
          inicial={formulario.inicial}
          guardando={guardando}
          alGuardar={guardar}
          alCancelar={() => setFormulario(null)}
        />
      )}

      {proveedores.length === 0 ? (
        <p className="mt-4 rounded-(--radius) bg-(--color-apagado) px-4 py-3 text-sm text-(--color-texto-apagado)">
          Todavía no cargaste ningún proveedor.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {proveedores.map((proveedor) => (
            <FilaProveedor
              key={proveedor.id}
              proveedor={proveedor}
              guardando={guardando}
              puedeEditar={puedeEditar}
              alEditar={abrirEdicion}
              alEliminar={eliminar}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
