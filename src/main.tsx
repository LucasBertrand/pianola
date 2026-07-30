import React, {
  StrictMode,
} from "react";
import {
  createRoot,
} from "react-dom/client";
import {
  App,
} from "./app/App";
import {
  APPLICATION_CONSTANTS,
} from "./config/program-constants";
import "./styles.css";

document.title = APPLICATION_CONSTANTS.productName;

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
