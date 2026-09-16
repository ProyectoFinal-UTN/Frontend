import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Cada test arranca con el DOM limpio, sin restos del anterior.
afterEach(() => {
  cleanup();
});
