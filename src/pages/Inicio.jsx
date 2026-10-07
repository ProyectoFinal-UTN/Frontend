import { useEffect, useState } from "react";
import { ArrowLeftRight, ChevronRight, MapPin, Package, Sparkles } from "lucide-react";
import SeccionRecomendaciones from "../components/SeccionRecomendaciones";
import { useAuth } from "../hooks/useAuth";
import { usePermisos } from "../hooks/usePermisos";
import { obtenerHistorial } from "../services/movimientos";
import { obtenerProductos } from "../services/productos";
import { EVENTO_ABRIR_ASISTENTE } from "../services/asistente";

/**
 * Pantalla de inicio: el resumen del negocio.
 *
 * Los accesos a cada pantalla vivían acá y se mudaron a la navegación
 * (`components/Navegacion.jsx`), que está en todas. Lo que queda es un panel
 * con lo que ya se puede saber del negocio: cuántos productos hay, cuánto se
 * movió hoy y en cuántas ubicaciones. El panel completo —ventas en pesos,
 * alertas, rotación— es de la épica E4 (dashboard de KPIs), y no se inventan
 * números que todavía no existen.
 *
 * Las tarjetas del resumen NO son links, a propósito: "Productos en el
 * catálogo" sería un segundo link con "Productos" en el nombre, al lado del de
 * la navegación, y cualquier búsqueda del link "Productos" —la de un test, o la
 * de quien usa lector de pantalla— encontraría dos.
 *
 * La regla es esa —ningún link de Inicio puede chocar POR NOMBRE con uno de la
 * navegación— y no "Inicio no tiene links". Las sugerencias de HU-27 traen
 * links "Ver stock de <producto>", que no colisionan con ninguno: lo que no
 * puede aparecer acá es un "Productos", un "Configuración" o un "Historial de
 * movimientos".
 */

/** "Martes, 6 de octubre", con mayúscula: es el principio de la línea. */
function fechaDeHoy() {
  const texto = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "2026-10-06": el formato que espera el filtro de fechas del historial. */
function hoyComoDia() {
  return new Date().toLocaleDateString("en-CA");
}

export default function Inicio() {
  const { usuario } = useAuth();
  const { puedeSalvoQueFalle: puede, resuelto, configuracion } = usePermisos();

  // `null` mientras carga; `undefined` si falló. Las dos se muestran como "—",
  // pero se distinguen para no confundir "todavía no" con "no se pudo".
  const [productos, setProductos] = useState(null);
  const [movimientosDeHoy, setMovimientosDeHoy] = useState(null);

  useEffect(() => {
    let vigente = true;

    obtenerProductos()
      .then((lista) => vigente && setProductos(lista.length))
      .catch(() => vigente && setProductos(undefined));

    obtenerHistorial({ desde: hoyComoDia(), hasta: hoyComoDia() })
      .then(({ paginacion }) => vigente && setMovimientosDeHoy(paginacion.total))
      .catch(() => vigente && setMovimientosDeHoy(undefined));

    return () => {
      vigente = false;
    };
  }, []);

  const ubicaciones = configuracion?.ubicaciones?.length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <p className="text-sm font-semibold text-(--color-texto-apagado)">
        {fechaDeHoy()}
      </p>
      <h1 className="mt-1 text-3xl font-extrabold text-(--color-texto) sm:text-4xl">
        Hola, {usuario?.name}
      </h1>

      <section aria-label="Resumen del negocio" className="mt-8">
        <h2 className="mb-4 text-xl font-extrabold text-(--color-texto)">
          Tu resumen
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Tarjeta
            icono={Package}
            tono="primario"
            valor={productos}
            titulo="Productos en el catálogo"
            detalle="activos"
          />
          <Tarjeta
            icono={ArrowLeftRight}
            tono="exito"
            valor={movimientosDeHoy}
            titulo="Movimientos de hoy"
            detalle="entradas y salidas"
          />
          <Tarjeta
            icono={MapPin}
            tono="atencion"
            valor={resuelto ? ubicaciones : null}
            titulo="Ubicaciones de stock"
            detalle="donde guardás mercadería"
          />
        </div>
      </section>

      {/*
        Las sugerencias proactivas (HU-27) van ANTES del banner del asistente.
        El banner dice "preguntale qué reponer hoy": arriba de una sección que
        ya lo contesta se leería como un formulario para preguntar algo que está
        respondido más abajo. Debajo funciona como el "¿y algo más?".

        El gate es el de HU-32: se pregunta por ACCIÓN y no por rol, con
        `resuelto &&` para que no aparezca y desaparezca un instante después, y
        con `puedeSalvoQueFalle` (el alias `puede` de arriba) para que una
        consulta de permisos caída no le saque la sección a quien sí puede
        verla. Mientras no esté resuelto no se monta, así que un empleado no
        dispara un 403 en cada carga de Inicio.
      */}
      {resuelto && puede("asistente", "recomendaciones") && (
        <SeccionRecomendaciones />
      )}

      {resuelto && puede("asistente", "consultar") && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_ASISTENTE))}
          className="mt-6 flex w-full items-center gap-4 rounded-[2rem]
                     bg-(--color-primario) px-6 py-5 text-left
                     text-(--color-primario-texto) shadow-sm transition
                     hover:opacity-95 focus:outline-none focus:ring-4
                     focus:ring-(--color-primario-suave)"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/15">
            <Sparkles aria-hidden="true" className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-extrabold">
              Preguntale al asistente qué reponer hoy
            </span>
            <span className="block text-sm opacity-90">
              Te responde con los datos de tu stock y tus movimientos
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="size-6 shrink-0" />
        </button>
      )}
    </main>
  );
}

const TONOS = {
  primario: "bg-(--color-primario-suave) text-(--color-primario)",
  exito: "bg-(--color-exito-suave) text-(--color-exito)",
  atencion: "bg-(--color-atencion-suave) text-(--color-atencion)",
};

function Tarjeta({ icono: Icono, tono, valor, titulo, detalle }) {
  return (
    <div className="rounded-[2rem] border-2 border-(--color-borde) bg-(--color-tarjeta) p-6 shadow-sm">
      <span className={`grid size-12 place-items-center rounded-full ${TONOS[tono]}`}>
        <Icono aria-hidden="true" className="size-6" />
      </span>
      <p className="mt-4 text-3xl font-extrabold tabular-nums text-(--color-texto)">
        {typeof valor === "number" ? valor.toLocaleString("es-AR") : "—"}
      </p>
      <p className="mt-1 font-bold text-(--color-texto)">{titulo}</p>
      <p className="text-sm text-(--color-texto-apagado)">{detalle}</p>
    </div>
  );
}
