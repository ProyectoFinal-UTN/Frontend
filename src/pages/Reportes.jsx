import TarjetaReportePdf from "../components/TarjetaReportePdf";

/**
 * Pantalla «Reportes y KPIs» (épica E4).
 *
 * PROVISORIA. La página completa —KPIs (HU-22), gráfico «Evolución de stock»
 * (HU-23) y lo que sume HU-24— todavía no está en `dev`. Mientras tanto acá
 * vive solo la tarjeta de reporte PDF de HU-25, para que se pueda usar y
 * probar.
 *
 * Cuando llegue la página de verdad, esta se reemplaza por esa y la tarjeta se
 * monta con una sola línea, al final, debajo del gráfico:
 *
 *   <TarjetaReportePdf />
 *
 * La tarjeta decide sola si se muestra (permiso `reporte:generar`), así que no
 * hace falta envolverla en ninguna condición.
 */
export default function Reportes() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-(--color-texto) sm:text-4xl">
          Reportes y KPIs
        </h1>
        <p className="mt-2 text-(--color-texto-apagado)">
          Exportá los movimientos del comercio para archivarlos o compartirlos.
        </p>
      </header>

      <div className="max-w-3xl">
        <TarjetaReportePdf />
      </div>
    </main>
  );
}
