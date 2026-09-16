/**
 * Barra de pestañas tipo píldora, como en el prototipo.
 *
 * Genérica a propósito: recibe los ítems y avisa cuál eligieron, sin saber
 * nada del contenido. Marca `role="tab"` y `aria-selected` para que sea
 * navegable con teclado y para que los tests la consulten por rol y no por
 * clases de CSS.
 *
 * @param {{items: {id: string, etiqueta: string}[], activa: string, alCambiar: (id: string) => void}} props
 */
export default function Pestanas({ items, activa, alCambiar }) {
  return (
    <div
      role="tablist"
      aria-label="Secciones de configuración"
      className="flex flex-wrap gap-2"
    >
      {items.map((item) => {
        const seleccionada = item.id === activa;

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={seleccionada}
            onClick={() => alCambiar(item.id)}
            className={`rounded-(--radius) px-4 py-2 text-sm font-bold transition
                        focus:outline-none focus:ring-4 focus:ring-(--color-primario-suave)
                        ${
                          seleccionada
                            ? "bg-(--color-primario) text-(--color-primario-texto)"
                            : "bg-(--color-apagado) text-(--color-texto-apagado) hover:text-(--color-texto)"
                        }`}
          >
            {item.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
