import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import RutaProtegida from "./components/RutaProtegida";
import Configuracion from "./pages/Configuracion";
import DetalleProducto from "./pages/DetalleProducto";
import EscanearProducto from "./pages/EscanearProducto";
import Inicio from "./pages/Inicio";
import Invitacion from "./pages/Invitacion";
import Login from "./pages/Login";
import Productos from "./pages/Productos";
import Recuperar from "./pages/Recuperar";
import Registro from "./pages/Registro";
import RegistrarMovimiento from "./pages/RegistrarMovimiento";
import Restablecer from "./pages/Restablecer";

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
        <Route
          path="/productos/escanear"
          element={
            <RutaProtegida>
              <EscanearProducto />
            </RutaProtegida>
          }
        />
        <Route
          path="/movimientos/nuevo"
          element={
            <RutaProtegida>
              <RegistrarMovimiento />
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
    </BrowserRouter>
  );
}
