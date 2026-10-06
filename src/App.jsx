import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Asistente from "./components/Asistente";
import RutaProtegida from "./components/RutaProtegida";
import Configuracion from "./pages/Configuracion";
import DetalleProducto from "./pages/DetalleProducto";
import EscanearProducto from "./pages/EscanearProducto";
import HistorialMovimientos from "./pages/HistorialMovimientos";
import ImportarProductos from "./pages/ImportarProductos";
import Inicio from "./pages/Inicio";
import Invitacion from "./pages/Invitacion";
import Login from "./pages/Login";
import Productos from "./pages/Productos";
import Recuperar from "./pages/Recuperar";
import Registro from "./pages/Registro";
import RegistrarMovimiento from "./pages/RegistrarMovimiento";
import Restablecer from "./pages/Restablecer";
import Transferencias from "./pages/Transferencias";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/registro" element={<Registro />} />
        <Route path="/login" element={<Login />} />
        {/*
          Las dos de recuperación van sin RutaProtegida por definición: quien
          las usa es justamente alguien que no puede entrar (HU-3).
        */}
        <Route path="/recuperar" element={<Recuperar />} />
        <Route path="/restablecer" element={<Restablecer />} />
        {/* Sin RutaProtegida: quien recibe el link puede no tener cuenta. */}
        <Route path="/invitacion/:id" element={<Invitacion />} />
        <Route
          path="/"
          element={
            <RutaProtegida>
              <Inicio />
            </RutaProtegida>
          }
        />
        <Route
          path="/configuracion"
          element={
            <RutaProtegida>
              <Configuracion />
            </RutaProtegida>
          }
        />
        <Route
          path="/productos"
          element={
            <RutaProtegida>
              <Productos />
            </RutaProtegida>
          }
        />
        {/*
          Escanear exige `producto:create` y no `read`: el endpoint que consulta
          el código (`GET /api/productos/codigo/:codigoBarras`) existe para dar
          de alta lo que se escanea, así que el backend lo cierra con create. No
          hay variante de solo lectura que ofrecerle al empleado.
        */}
        <Route
          path="/productos/escanear"
          element={
            <RutaProtegida permiso={{ producto: ["create"] }}>
              <EscanearProducto />
            </RutaProtegida>
          }
        />
        {/*
          Va antes que `/productos/:id` en el archivo por prolijidad, pero no
          depende de eso: React Router rankea por especificidad, así que un
          segmento fijo como "importar" siempre le gana al `:id`.
        */}
        <Route
          path="/productos/importar"
          element={
            <RutaProtegida
              permiso={{ producto: ["create"] }}
              mensajeSinPermiso="Tu rol no puede importar productos. Pedile a quien administra el comercio —el propietario o el gerente— que suba la planilla."
            >
              <ImportarProductos />
            </RutaProtegida>
          }
        />
        <Route
          path="/movimientos"
          element={
            <RutaProtegida>
              <HistorialMovimientos />
            </RutaProtegida>
          }
        />
        <Route
          path="/movimientos/nuevo"
          element={
            <RutaProtegida permiso={{ movimiento: ["create"] }}>
              <RegistrarMovimiento />
            </RutaProtegida>
          }
        />
        {/*
          `transferencia:create` y no `movimiento:create`: el backend los separó
          a propósito (HU-32), porque mover mercadería entre locales es una
          decisión distinta de registrar una venta. Hoy los tres roles tienen
          los dos, así que no cambia nada visible; el día que se restrinja uno
          solo, esta guarda ya apunta al correcto.
        */}
        <Route
          path="/transferencias"
          element={
            <RutaProtegida permiso={{ transferencia: ["create"] }}>
              <Transferencias />
            </RutaProtegida>
          }
        />
        <Route
          path="/productos/:id"
          element={
            <RutaProtegida>
              <DetalleProducto />
            </RutaProtegida>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/*
        Fuera de <Routes> a propósito (HU-26): así hay un solo asistente para
        todas las pantallas, y no se desmonta al navegar, con lo que la
        conversación sobrevive al cambiar de pantalla. Se muestra solo con
        sesión iniciada; eso lo decide el propio componente.
      */}
      <Asistente />
    </BrowserRouter>
  );
}
