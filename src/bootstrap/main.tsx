import React from "react";
import {
  createRoot,
} from "react-dom/client";
import {
  App,
} from "./App";
import {
  APPLICATION_CONSTANTS,
} from "../application/product/product-constants";
import {
  APPLICATION_CSS_COLOR_VARIABLES,
} from "../presentation/styles/application-colors";
import {
  installBrowserErrorCapture,
} from "../presentation/diagnostics/browser-error-reporter";
import {
  registerPianolaServiceWorker,
} from "../infrastructure/browser/service-worker/register-service-worker";
import "../presentation/styles/index.css";

document.title = APPLICATION_CONSTANTS.productName;
installBrowserErrorCapture();
registerPianolaServiceWorker();

/*
 * Install the centralized theme before React renders. Defining the custom
 * properties on the document root makes them available to every portal,
 * overlay, and responsive layout without prop drilling.
 */
for (const [property, value] of Object.entries(
  APPLICATION_CSS_COLOR_VARIABLES,
)) {
  document.documentElement.style.setProperty(property, value);
}

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element was not found.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
