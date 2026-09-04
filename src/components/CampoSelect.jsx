/**
 * Desplegable con su etiqueta y su mensaje de error.
 *
 * Es el hermano de `Campo` para los casos en que se elige de una lista cerrada
 * en vez de escribir: mismo borde de error, mismo `aria-invalid` y mismo
 * `aria-describedby`, así los formularios de la app se comportan igual sin
 * importar el tipo de campo.
 *
 * `SeccionProductos` (HU-9) tiene una copia local de esto, hecha cuando era el
 * único formulario con un desplegable. Al aparecer el segundo (HU-13, con tres)
 * el componente se mudó acá; esa copia puede reemplazarse por este import
 * cuando alguien vuelva a tocar productos.
 */
export default function CampoSelect({ id, etiqueta, error, children, ...props }) {
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
        className={`w-full rounded-(--radius) border-2 bg-(--color-tarjeta) px-4 py-3
                    text-base text-(--color-texto) outline-none transition
                    focus:border-(--color-primario)
                    ${error ? "border-(--color-peligro)" : "border-(--color-borde)"}`}
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
