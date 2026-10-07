import { useEffect, useId, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import AvisoDeError from "./AvisoDeError";
import { useAuth } from "../hooks/useAuth";
import { usePermisos } from "../hooks/usePermisos";
import {
  EVENTO_ABRIR_ASISTENTE,
  MODO,
  PREGUNTA_MAXIMA,
  consultarAsistente,
} from "../services/asistente";

/**
 * Asistente Inteligente: consulta en lenguaje natural (HU-26).
 *
 * Un botón flotante que abre un panel de chat, montado UNA sola vez en `App`
 * y no en cada pantalla. Es lo que hace que esté "accesible desde cualquier
 * pantalla", que pide la HU, sin repetirlo en todas. Y como no se desmonta al
 * navegar, la conversación sobrevive al pasar de Productos a Movimientos: se
 * puede preguntar algo, ir a mirarlo, y volver a seguir preguntando.
 *
 * Está partido en dos a propósito. Este componente de afuera solo mira si hay
 * sesión, y recién el de adentro pregunta los permisos. Si preguntara permisos
 * siempre, en el login dispararía `GET /api/configuracion`, recibiría un 401 y
 * lo dejaría guardado en el store compartido de HU-32, donde lo leen todas las
 * pantallas. Además, al cerrar sesión el de adentro se desmonta y la
 * conversación se va con él: quien entre después en la misma pestaña no ve lo
 * que preguntó el anterior.
 */
export default function Asistente() {
  const { autenticado } = useAuth();

  if (!autenticado) return null;

  return <AsistenteConSesion />;
}

function AsistenteConSesion() {
  // `puedeSalvoQueFalle`, igual que los accesos de Inicio: si no se pudieron
  // averiguar los permisos, se ofrece igual. Esconderlo le sacaría el asistente
  // a quien sí puede usarlo; mostrarlo de más termina en un 403 del backend,
  // que es la autoridad y además lo explica.
  const { puedeSalvoQueFalle, resuelto } = usePermisos();

  // `resuelto` y no `!cargando`: así el botón no aparece y desaparece un
  // instante después para un rol sin permiso.
  if (!resuelto || !puedeSalvoQueFalle("asistente", "consultar")) {
    return null;
  }

  return <PanelDelAsistente />;
}

/**
 * Ejemplos para el panel vacío. Son las preguntas que hoy se pueden contestar
 * con datos (stock, reposición, movimientos), así la primera experiencia no
 * es un "todavía no puedo consultar eso".
 */
const SUGERENCIAS = [
  "¿Qué productos tengo que reponer?",
  "¿Cómo viene el día?",
  "¿Qué se movió esta semana?",
];

function PanelDelAsistente() {
  const [abierto, setAbierto] = useState(false);
  const [turnos, setTurnos] = useState([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Candado de envío, el mismo patrón que HU-12. El `disabled` del botón no
  // alcanza: dos envíos en el mismo tick (Enter + clic, doble clic) ven el
  // botón todavía habilitado porque React no re-renderizó entre uno y otro.
  // La ref se escribe y se lee de forma síncrona, así que el segundo la
  // encuentra cerrada. Acá importa más que en otras pantallas: cada envío
  // repetido es una consulta más que se paga del crédito del equipo.
  const enVuelo = useRef(false);
  const ultimoId = useRef(0);
  // La respuesta puede volver con el panel ya desmontado (se cerró sesión).
  const montado = useRef(true);

  const campoRef = useRef(null);
  const botonRef = useRef(null);
  const finRef = useRef(null);

  const idPanel = useId();
  const idTitulo = useId();
  const idCampo = useId();
  const idContador = useId();

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Cualquier pantalla lo puede abrir sin conocerlo (el banner de Inicio).
  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener(EVENTO_ABRIR_ASISTENTE, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_ASISTENTE, abrir);
  }, []);

  // Al abrir, directo a escribir: es lo único que se hace en el panel.
  useEffect(() => {
    if (abierto) campoRef.current?.focus();
  }, [abierto]);

  // Que se vea lo último. `?.()` porque jsdom no implementa `scrollIntoView`.
  useEffect(() => {
    finRef.current?.scrollIntoView?.({ block: "end" });
  }, [turnos]);

  function actualizarTurno(id, cambios) {
    setTurnos((anteriores) =>
      anteriores.map((turno) =>
        turno.id === id ? { ...turno, ...cambios } : turno,
      ),
    );
  }

  async function preguntar(pregunta) {
    const limpia = pregunta.trim();

    if (!limpia || enVuelo.current) return;

    enVuelo.current = true;
    ultimoId.current += 1;
    const id = ultimoId.current;

    setTurnos((anteriores) => [
      ...anteriores,
      { id, pregunta: limpia, estado: "esperando" },
    ]);
    setEnviando(true);

    try {
      const { respuesta, modo } = await consultarAsistente(limpia);
      if (!montado.current) return;
      actualizarTurno(id, { estado: "respondido", respuesta, modo });
    } catch (fallo) {
      if (!montado.current) return;
      actualizarTurno(id, { estado: "fallido", fallo });
    } finally {
      enVuelo.current = false;
      if (montado.current) setEnviando(false);
    }
  }

  function enviar(evento) {
    evento?.preventDefault();
    if (!texto.trim() || enVuelo.current) return;

    // Se limpia acá y no en `preguntar`: un reintento no tiene que borrar lo
    // que la persona ya empezó a escribir para la pregunta siguiente.
    const pregunta = texto;
    setTexto("");
    preguntar(pregunta);
  }

  function reintentar(turno) {
    // Se saca el turno fallido y se vuelve a preguntar lo mismo, en vez de
    // dejar el error colgado arriba de la respuesta buena.
    setTurnos((anteriores) => anteriores.filter((t) => t.id !== turno.id));
    preguntar(turno.pregunta);
  }

  function alTeclear(evento) {
    // Enter envía y Shift+Enter baja de línea, como en cualquier chat. Durante
    // una composición (acentos con teclado internacional, IME) el Enter
    // confirma el carácter y no tiene que mandar la pregunta a medias.
    if (
      evento.key === "Enter" &&
      !evento.shiftKey &&
      !evento.nativeEvent.isComposing
    ) {
      enviar(evento);
    }
  }

  function cerrar() {
    setAbierto(false);
    // El foco vuelve a quien abrió el panel: si se quedara en un elemento que
    // dejó de existir, quien navega con teclado queda perdido al principio de
    // la página.
    botonRef.current?.focus();
  }

  const sinTexto = texto.trim() === "";

  return (
    // `bottom-24` en celular: la barra de navegación está fija abajo y lo
    // taparía. En escritorio la navegación es la sidebar y el botón baja.
    <div className="fixed right-4 bottom-24 z-40 flex flex-col items-end gap-3 lg:bottom-4">
      {abierto && (
        <section
          id={idPanel}
          aria-labelledby={idTitulo}
          onKeyDown={(evento) => evento.key === "Escape" && cerrar()}
          className="flex max-h-[70vh] w-[calc(100vw-2rem)] max-w-sm flex-col
                     rounded-(--radius) border-2 border-(--color-borde)
                     bg-(--color-tarjeta) shadow-xl"
        >
          <header
            className="flex items-center justify-between border-b-2
                       border-(--color-borde) px-4 py-3"
          >
            <h2 id={idTitulo} className="font-bold text-(--color-texto)">
              Asistente
            </h2>
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar el asistente"
              className="rounded-(--radius) px-2 text-xl leading-none
                         text-(--color-texto-apagado) hover:text-(--color-texto)
                         focus:outline-none focus:ring-4
                         focus:ring-(--color-primario-suave)"
            >
              ×
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {turnos.length === 0 ? (
              <Bienvenida alElegir={preguntar} deshabilitado={enviando} />
            ) : (
              // `aria-live` en la lista: cuando llega una respuesta, quien usa
              // lector de pantalla se entera sin tener que ir a buscarla.
              <ol
                aria-label="Conversación con el asistente"
                aria-live="polite"
                className="flex flex-col gap-4"
              >
                {turnos.map((turno) => (
                  <Turno
                    key={turno.id}
                    turno={turno}
                    alReintentar={() => reintentar(turno)}
                  />
                ))}
              </ol>
            )}
            <div ref={finRef} />
          </div>

          <form
            onSubmit={enviar}
            className="border-t-2 border-(--color-borde) px-4 py-3"
          >
            <label
              htmlFor={idCampo}
              className="mb-1 block text-sm font-semibold text-(--color-texto)"
            >
              Tu pregunta
            </label>
            <textarea
              id={idCampo}
              ref={campoRef}
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              onKeyDown={alTeclear}
              maxLength={PREGUNTA_MAXIMA}
              rows={2}
              aria-describedby={idContador}
              placeholder="Por ejemplo: ¿cuánta yerba me queda?"
              className="w-full resize-none rounded-(--radius) border-2
                         border-(--color-borde) bg-(--color-fondo) px-3 py-2
                         text-(--color-texto) focus:border-(--color-primario)
                         focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <span
                id={idContador}
                className="text-xs text-(--color-texto-apagado)"
              >
                {texto.length}/{PREGUNTA_MAXIMA}
              </span>
              <button
                type="submit"
                disabled={sinTexto || enviando}
                className="rounded-(--radius) bg-(--color-primario) px-4 py-2
                           font-bold text-(--color-primario-texto) transition
                           hover:opacity-90 disabled:cursor-not-allowed
                           disabled:opacity-50 focus:outline-none focus:ring-4
                           focus:ring-(--color-primario-suave)"
              >
                Preguntar
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        ref={botonRef}
        type="button"
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        // Un círculo con ícono y no una pastilla con texto: ocupa menos, y
        // `Layout` le reserva una franja a la derecha del contenido para que
        // nunca quede arriba de un botón de la pantalla (lo tapaba: el
        // «Siguiente →» del historial no se podía tocar). El nombre accesible
        // sigue siendo exactamente "Asistente", que es como lo buscan los E2E.
        aria-label="Asistente"
        title="Asistente"
        className="grid size-14 place-items-center rounded-full
                   bg-(--color-acento) text-(--color-acento-texto) shadow-lg
                   transition hover:opacity-90 focus:outline-none focus:ring-4
                   focus:ring-(--color-primario-suave)"
      >
        {abierto ? (
          <X aria-hidden="true" className="size-6" />
        ) : (
          <Sparkles aria-hidden="true" className="size-6" />
        )}
      </button>
    </div>
  );
}

function Bienvenida({ alElegir, deshabilitado }) {
  return (
    <div className="text-sm text-(--color-texto)">
      <p>
        Preguntame sobre tu stock y tus movimientos, como se lo preguntarías a
        alguien del negocio.
      </p>
      <p className="mt-3 font-semibold">Probá con:</p>
      <ul className="mt-2 flex flex-col gap-2">
        {SUGERENCIAS.map((sugerencia) => (
          <li key={sugerencia}>
            <button
              type="button"
              onClick={() => alElegir(sugerencia)}
              disabled={deshabilitado}
              className="w-full rounded-(--radius) border-2
                         border-(--color-borde) px-3 py-2 text-left
                         transition hover:border-(--color-primario)
                         disabled:opacity-50 focus:outline-none focus:ring-4
                         focus:ring-(--color-primario-suave)"
            >
              {sugerencia}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Turno({ turno, alReintentar }) {
  return (
    <li className="flex flex-col gap-2">
      <p
        className="self-end rounded-(--radius) bg-(--color-primario-suave)
                   px-3 py-2 text-sm text-(--color-texto)"
      >
        <span className="sr-only">Vos: </span>
        {turno.pregunta}
      </p>

      {turno.estado === "esperando" && (
        <p className="text-sm text-(--color-texto-apagado)">
          Buscando en tus datos…
        </p>
      )}

      {turno.estado === "respondido" && (
        <div
          className="self-start rounded-(--radius) bg-(--color-apagado)
                     px-3 py-2 text-sm text-(--color-texto)"
        >
          <span className="sr-only">Asistente: </span>
          {/* `whitespace-pre-line`: el modelo arma listas con saltos de línea. */}
          <p className="whitespace-pre-line">{turno.respuesta}</p>
          {turno.modo === MODO.LIMITADO && (
            // HU-28: la persona tiene que saber que esta respuesta es más
            // pobre que la normal, y que no es culpa de su pregunta.
            <p
              className="mt-2 rounded-(--radius) bg-(--color-atencion-suave)
                         px-2 py-1 text-xs font-semibold text-(--color-atencion)"
            >
              Respuesta limitada: el asistente inteligente no está disponible
              en este momento.
            </p>
          )}
        </div>
      )}

      {turno.estado === "fallido" && (
        <AvisoDeError fallo={turno.fallo} alReintentar={alReintentar} />
      )}
    </li>
  );
}
