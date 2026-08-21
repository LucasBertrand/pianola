import React from "react";
import {
  createRoot,
} from "react-dom/client";
import {
  App,
} from "./app/App";
import {
  APPLICATION_CONSTANTS,
} from "./config/product-config";
import {
  APPLICATION_CSS_COLOR_VARIABLES,
} from "./config/application-colors";
import {
  installBrowserErrorCapture,
} from "./ui/diagnostics/browser-error-reporter";
import "./styles.css";

document.title = APPLICATION_CONSTANTS.productName;
installBrowserErrorCapture();

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
