/**
 * Campo de texto con su etiqueta y su mensaje de error.
 *
 * Lo usan el registro y el login, así que los dos formularios se ven y se
 * comportan igual: mismo borde de error, mismo `aria-invalid` y mismo
 * `aria-describedby` para que un lector de pantalla anuncie el problema.
 */
export default function Campo({ id, etiqueta, error, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-(--color-texto)">
        {etiqueta}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `error-${id}` : undefined}
        className={`w-full rounded-(--radius) border-2 bg-(--color-tarjeta) px-4 py-3
                    text-base text-(--color-texto) outline-none transition
                    focus:border-(--color-primario)
                    ${error ? "border-(--color-peligro)" : "border-(--color-borde)"}`}
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
