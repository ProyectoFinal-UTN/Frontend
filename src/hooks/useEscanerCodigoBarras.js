import { useCallback, useEffect, useRef, useState } from "react";
import { BarcodeFormat, BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";

// Alineado con lo que el Backend acepta (numérico, 8 a 14 dígitos): EAN-13,
// EAN-8, UPC-A, UPC-E. Restringir el formato reduce falsos positivos y
// acelera la decodificación frente a dejar todos los formatos habilitados.
const FORMATOS_SOPORTADOS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];

function categorizarError(error) {
  if (error?.name === "NotAllowedError") return "permiso-denegado";
  if (error?.name === "NotFoundError") return "sin-camara";
  return "desconocido";
}

/**
 * Encapsula el ciclo de vida de @zxing/browser: pedir permiso de cámara,
 * arrancar/detener el escaneo continuo y devolver el código detectado.
 *
 * La página que use este hook no necesita conocer la API de zxing ni de
 * getUserMedia — solo el estado y, si hay, el código o el tipo de error.
 *
 * `estado`: "inactivo" | "solicitando-permiso" | "escaneando" | "detectado" | "error"
 * `error`: "permiso-denegado" | "sin-camara" | "contexto-inseguro" | "desconocido" | null
 */
export function useEscanerCodigoBarras() {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [estado, setEstado] = useState("inactivo");
  const [error, setError] = useState(null);
  const [codigo, setCodigo] = useState(null);

  useEffect(() => {
    return () => controlsRef.current?.stop();
  }, []);

  const detener = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setEstado("inactivo");
  }, []);

  const iniciar = useCallback(async () => {
    setError(null);
    setCodigo(null);

    // getUserMedia esta bloqueado fuera de un "contexto seguro" (HTTPS,
    // salvo la excepcion de localhost). Chequearlo antes evita un TypeError
    // confuso de `navigator.mediaDevices` (que en ese caso es undefined).
    if (typeof window === "undefined" || !window.isSecureContext) {
      setEstado("error");
      setError("contexto-inseguro");
      return;
    }

    setEstado("solicitando-permiso");

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATOS_SOPORTADOS);
    // Sin esto, zxing se conforma con el primer intento rapido y descarta
    // codigos legibles a simple vista si no calzan perfecto — hace falta
    // para escaneo real con webcam, no solo con imagenes de prueba ideales.
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);

    try {
      // Pedir width/height "ideal" acá rompía la captura en algunas webcams
      // USB (el navegador negocia una resolucion que deja video.videoWidth
      // en 0 un instante, y zxing no puede crear el canvas para leer el
      // frame). Sin esos hints, decodeFromConstraints con solo facingMode
      // es equivalente a decodeFromVideoDevice(undefined, ...).
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current,
        (resultado) => {
          if (!resultado) return; // frame sin codigo legible, es lo normal
          controlsRef.current?.stop();
          setCodigo(resultado.getText());
          setEstado("detectado");
        },
      );

      controlsRef.current = controls;
      // Guard: si el callback ya detecto un codigo mientras se resolvia esta
      // promesa, no pisar "detectado" con "escaneando".
      setEstado((actual) => (actual === "solicitando-permiso" ? "escaneando" : actual));
    } catch (err) {
      setEstado("error");
      setError(categorizarError(err));
    }
  }, []);

  return { videoRef, iniciar, detener, estado, error, codigo };
}
