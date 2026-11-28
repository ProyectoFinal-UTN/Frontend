import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Los gráficos del dashboard de KPIs (HU-22), con Recharts.
 *
 * Vive en su propio módulo y se carga con `React.lazy` desde `SeccionKpis`:
 * Recharts pesa bastante más que el resto de Inicio, y el dashboard tiene que
 * abrir en menos de dos segundos (RNF2). Así las tarjetas con los números se
 * pintan primero y los gráficos llegan detrás, sin frenarlas.
 *
 * Es SOLO la parte visual. El título, la explicación y la tabla con los mismos
 * datos para lectores de pantalla los pone `SeccionKpis` alrededor, por eso el
 * gráfico va con `aria-hidden`: un SVG de barras no se lee, se mira.
 *
 * Los colores son las variables del tema (`index.css`), así que respetan el
 * modo oscuro sin tocar nada acá.
 */

const COLORES = {
  ventas: "var(--color-primario)",
  compras: "var(--color-exito)",
  ubicaciones: "var(--color-acento)",
};

const EJE = {
  stroke: "var(--color-texto-apagado)",
  fontSize: 12,
  tickLine: false,
};

const TOOLTIP = {
  contentStyle: {
    background: "var(--color-tarjeta)",
    border: "2px solid var(--color-borde)",
    borderRadius: "1rem",
    color: "var(--color-texto)",
  },
  cursor: { fill: "var(--color-apagado)" },
};

const formatear = (valor) => Number(valor).toLocaleString("es-AR");

/**
 * La serie de ventas: una barra por día, por semana o por mes.
 *
 * El eje usa `etiqueta` y no `fecha` (HU-23): con un rango largo la barra ya no
 * es un día sino un grupo de días —"16/11–22/11", "nov 26"—, y quien decide
 * cómo se agrupa y cómo se llama cada grupo es `agruparSerie` en
 * `services/periodos.js`. Acá sólo se dibuja lo que llega, sin volver a
 * formatear nada: así el eje, el tooltip y la tabla accesible que pone
 * `SeccionKpis` dicen exactamente lo mismo.
 */
function VentasPorDia({ datos }) {
  return (
    <BarChart data={datos} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke="var(--color-borde)" />
      <XAxis dataKey="etiqueta" minTickGap={16} {...EJE} />
      <YAxis allowDecimals={false} tickFormatter={formatear} {...EJE} />
      <Tooltip
        {...TOOLTIP}
        formatter={(valor) => [formatear(valor), "Unidades vendidas"]}
      />
      <Bar dataKey="unidades" fill={COLORES.ventas} radius={[6, 6, 0, 0]} />
    </BarChart>
  );
}

/** Barras horizontales: los nombres de proveedor y de ubicación son largos. */
function BarrasHorizontales({ datos, color, nombreSerie }) {
  return (
    <BarChart
      data={datos}
      layout="vertical"
      margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
    >
      <CartesianGrid horizontal={false} stroke="var(--color-borde)" />
      <XAxis
        type="number"
        allowDecimals={false}
        tickFormatter={formatear}
        {...EJE}
      />
      <YAxis type="category" dataKey="nombre" width={110} {...EJE} />
      <Tooltip
        {...TOOLTIP}
        formatter={(valor) => [formatear(valor), nombreSerie]}
      />
      <Bar dataKey="unidades" fill={color} radius={[0, 6, 6, 0]} />
    </BarChart>
  );
}

/** Alto de un gráfico de barras horizontales: crece con la cantidad de filas. */
function altoHorizontal(filas) {
  return Math.max(120, filas * 40 + 40);
}

export default function GraficoKpi({ tipo, datos }) {
  let grafico;
  let alto = 220;

  if (tipo === "ventasPorDia") {
    grafico = <VentasPorDia datos={datos} />;
  } else if (tipo === "comprasPorProveedor") {
    alto = altoHorizontal(datos.length);
    grafico = (
      <BarrasHorizontales
        datos={datos}
        color={COLORES.compras}
        nombreSerie="Unidades compradas"
      />
    );
  } else if (tipo === "stockPorUbicacion") {
    alto = altoHorizontal(datos.length);
    grafico = (
      <BarrasHorizontales
        datos={datos}
        color={COLORES.ubicaciones}
        nombreSerie="Unidades en stock"
      />
    );
  } else {
    return null;
  }

  return (
    <div aria-hidden="true" data-testid={`grafico-${tipo}`} style={{ height: alto }}>
      <ResponsiveContainer width="100%" height="100%">
        {grafico}
      </ResponsiveContainer>
    </div>
  );
}
