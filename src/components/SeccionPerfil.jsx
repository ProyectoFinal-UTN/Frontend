import { useState } from "react";
import { guardarPerfil } from "../services/comercio";
import { validarPerfil } from "./SeccionPerfil.validacion";

/**
 * Datos del negocio (HU-6).
 *
 * El comercio nace en el registro con el nombre por defecto "Mi comercio";
 * acá el propietario carga los datos reales.
 */

const CLASES_INPUT =
  "w-full rounded-(--radius) border-2 bg-(--color-tarjeta) px-4 py-3 " +
  "text-base text-(--color-texto) outline-none transition " +
  "focus:border-(--color-primario)";

/** Un campo del formulario, con su etiqueta, su ayuda y su error. */
function CampoPerfil({ id, etiqueta, ayuda, error, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-(--color-texto)">
        {etiqueta}
      </label>
      {ayuda && (
        <p className="text-sm text-(--color-texto-apagado)">{ayuda}</p>
      )}
      <input
        id={id}
        name={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `error-${id}` : undefined}
        className={`${CLASES_INPUT} ${
          error ? "border-(--color-peligro)" : "border-(--color-borde)"
        }`}
        {...props}
      />
      {error && (
        <p id={`error-${id}`} className="text-sm text-(--color-peligro)">
          {error}
        </p>
      )}
    </div>
  );
}

/** Los campos vacíos llegan del backend como null; el input necesita "". */
function aFormulario(perfil) {
  return {
    nombre: perfil.nombre ?? "",
    rubro: perfil.rubro ?? "",
    direccion: perfil.direccion ?? "",
    telefono: perfil.telefono ?? "",
    correoContacto: perfil.correoContacto ?? "",
  };
}

export default function SeccionPerfil({ perfil, alGuardar }) {
  const [campos, setCampos] = useState(() => aFormulario(perfil));
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  function alEscribir(evento) {
    const { name, value } = evento.target;
    setCampos((previos) => ({ ...previos, [name]: value }));
    setErrores((previos) => ({ ...previos, [name]: undefined }));
    setErrorGeneral("");
    setGuardado(false);
  }

  async function alEnviar(evento) {
    evento.preventDefault();

    const encontrados = validarPerfil(campos);
    setErrores(encontrados);

    if (Object.keys(encontrados).length > 0) {
      return;
    }

    setGuardando(true);
    setErrorGeneral("");

    try {
      await guardarPerfil({
        nombre: campos.nombre.trim(),
        rubro: campos.rubro.trim(),
        direccion: campos.direccion.trim(),
        telefono: campos.telefono.trim(),
        correoContacto: campos.correoContacto.trim(),
      });

      await alGuardar();
      setGuardado(true);
    } catch (fallo) {
      // El mensaje viene del backend, ya redactado para un comerciante.
      setErrorGeneral(fallo.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-extrabold text-(--color-texto)">
          Datos del negocio
        </h2>
        <p className="mt-1 text-sm text-(--color-texto-apagado)">
          Se usan para identificar tu comercio dentro del sistema.
        </p>
      </div>

      {errorGeneral && (
        <p
          role="alert"
          className="rounded-(--radius) bg-(--color-peligro-suave) px-4 py-3
                     text-sm font-semibold text-(--color-peligro)"
        >
          {errorGeneral}
        </p>
      )}

      {guardado && (
        <p
          role="status"
          className="rounded-(--radius) bg-(--color-exito-suave) px-4 py-3
                     text-sm font-semibold text-(--color-exito)"
        >
          Datos guardados.
        </p>
      )}

      <CampoPerfil
        id="nombre"
        etiqueta="Nombre del negocio"
        value={campos.nombre}
        onChange={alEscribir}
        error={errores.nombre}
        placeholder="Kiosco Don Pepe"
      />

      <CampoPerfil
        id="rubro"
        etiqueta="Rubro"
        ayuda="A qué se dedica: kiosco, almacén, ferretería…"
        value={campos.rubro}
        onChange={alEscribir}
        error={errores.rubro}
        placeholder="Kiosco"
      />

      <CampoPerfil
        id="direccion"
        etiqueta="Dirección (opcional)"
        value={campos.direccion}
        onChange={alEscribir}
        error={errores.direccion}
        placeholder="Av. Siempreviva 742"
      />

      <CampoPerfil
        id="telefono"
        etiqueta="Teléfono (opcional)"
        type="tel"
        inputMode="tel"
        value={campos.telefono}
        onChange={alEscribir}
        error={errores.telefono}
        placeholder="351 123 4567"
      />

      <CampoPerfil
        id="correoContacto"
        etiqueta="Correo de contacto (opcional)"
        ayuda="Puede ser distinto del correo con el que entrás."
        type="email"
        inputMode="email"
        value={campos.correoContacto}
        onChange={alEscribir}
        error={errores.correoContacto}
        placeholder="contacto@mikiosco.com"
      />

      <button
        type="submit"
        disabled={guardando}
        className="w-full rounded-(--radius) bg-(--color-primario) px-4 py-3.5
                   text-base font-bold text-(--color-primario-texto) transition
                   hover:opacity-90 focus:outline-none focus:ring-4
                   focus:ring-(--color-primario-suave) disabled:opacity-60
                   sm:w-auto sm:self-start sm:px-8"
      >
        {guardando ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
