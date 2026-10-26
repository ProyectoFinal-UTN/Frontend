import { useCallback } from "react";
import { Link } from "react-router-dom";
import EditorDeVinculos from "./EditorDeVinculos";
import { obtenerProductos } from "../services/productos";
import {
  asociarProveedor,
  desasociarProveedor,
  obtenerProductosDeProveedor,
} from "../services/proveedores";

/**
 * Qué productos se le compran a un proveedor (HU-20). Es el otro lado de
 * `ProveedoresDelProducto`, sobre el mismo vínculo: asociar acá escribe en
 * `/productos/:id/proveedores` igual que allá.
 */
export default function ProductosDelProveedor({ proveedorId, puedeEditar }) {
  const cargarVinculados = useCallback(
    () => obtenerProductosDeProveedor(proveedorId),
    [proveedorId],
  );
  const asociar = useCallback(
    (productoId) => asociarProveedor(productoId, proveedorId),
    [proveedorId],
  );
  const quitar = useCallback(
    (productoId) => desasociarProveedor(productoId, proveedorId),
    [proveedorId],
  );

  return (
    <EditorDeVinculos
      id={`productoAAsociar-${proveedorId}`}
      cargarVinculados={cargarVinculados}
      cargarOpciones={obtenerProductos}
      asociar={asociar}
      quitar={quitar}
      puedeEditar={puedeEditar}
      etiquetaSelect="Agregar producto"
      textoVacio="Todavía no le asociaste ningún producto."
      sinOpciones={
        <p className="text-sm text-(--color-texto-apagado)">
          Todavía no cargaste productos.{" "}
          <Link to="/productos" className="font-bold text-(--color-primario) underline">
            Ir a Productos
          </Link>
        </p>
      }
      renderElemento={(producto) => (
        <Link
          to={`/productos/${producto.id}`}
          className="font-bold text-(--color-primario) underline"
        >
          {producto.nombre}
        </Link>
      )}
    />
  );
}
