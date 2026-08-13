import {
  spawn,
} from "node:child_process";
import {
  mkdtemp,
  rm,
} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const browserExecutable = process.env["PIANOLA_BASELINE_BROWSER"]
  ?? getDefaultBrowserExecutable();
const userDataDirectory = await mkdtemp(
  path.join(os.tmpdir(), "pianola-browser-baseline-"),
);
const previewPort = await reservePort();
const debuggingPort = await reservePort();
const previewUrl = `http://127.0.0.1:${previewPort}`;
const previewProcess = spawn(
  process.execPath,
  [
    path.resolve("node_modules/vite/bin/vite.js"),
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(previewPort),
    "--strictPort",
  ],
  {
    stdio: "ignore",
    windowsHide: true,
  },
);
let browserProcess;
let protocol;

try {
  await waitForHttp(previewUrl);
  browserProcess = spawn(
    browserExecutable,
    [
      "--headless=new",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${userDataDirectory}`,
      previewUrl,
    ],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  const target = await waitForPageTarget(debuggingPort);

  protocol = await createProtocolClient(target.webSocketDebuggerUrl);
  await protocol.send("Page.enable");
  await protocol.send("Runtime.enable");
  await protocol.send("Emulation.setDeviceMetricsOverride", {
    width: 1_440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await waitForApplication(protocol);

  const browserVersion = await protocol.send("Browser.getVersion");
  const measurements = await evaluateByValue(
    protocol,
    `(${measureBrowserInteractions.toString()})()`,
    true,
  );

  console.log(JSON.stringify({
    capturedAt: new Date().toISOString(),
    browser: browserVersion.product,
    userAgent: browserVersion.userAgent,
    viewport: {
      widthCssPixels: 1_440,
      heightCssPixels: 900,
      devicePixelRatio: 1,
    },
    scene: "demo project loaded by the production preview",
    ...measurements,
  }, null, 2));
} finally {
  protocol?.close();
  browserProcess?.kill();
  previewProcess.kill();
  await waitForProcessExit(browserProcess);
  await waitForProcessExit(previewProcess);
  await rm(userDataDirectory, {
    force: true,
    recursive: true,
  });
}

function getDefaultBrowserExecutable() {
  if (process.platform === "win32") {
    return "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  }

  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }

  return "google-chrome";
}

async function reservePort() {
  const server = net.createServer();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();

  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Unable to reserve a local port.");
  }

  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function waitForHttp(url) {
  await retry(async () => {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Preview returned HTTP ${response.status}.`);
    }
  });
}

async function waitForPageTarget(debuggingPort) {
  let target;

  await retry(async () => {
    const response = await fetch(
      `http://127.0.0.1:${debuggingPort}/json/list`,
    );
    const targets = await response.json();

    target = targets.find((candidate) => candidate.type === "page");

    if (target?.webSocketDebuggerUrl === undefined) {
      throw new Error("The browser page target is not ready.");
    }
  });

  return target;
}

async function waitForApplication(protocolClient) {
  await retry(async () => {
    const ready = await evaluateByValue(
      protocolClient,
      `document.readyState === "complete"
        && document.querySelector(".interaction-overlay") !== null`,
    );

    if (!ready) {
      throw new Error("The piano-roll overlay is not ready.");
    }
  });
}

async function retry(operation) {
  let lastError;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw lastError;
}

async function createProtocolClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pendingRequests = new Map();
  let requestSequence = 0;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.id === undefined) {
      return;
    }

    const request = pendingRequests.get(message.id);

    if (request === undefined) {
      return;
    }

    pendingRequests.delete(message.id);

    if (message.error !== undefined) {
      request.reject(new Error(message.error.message));
    } else {
      request.resolve(message.result);
    }
  });

  return {
    send(method, params = {}) {
      requestSequence += 1;

      return new Promise((resolve, reject) => {
        pendingRequests.set(requestSequence, { resolve, reject });
        socket.send(JSON.stringify({
          id: requestSequence,
          method,
          params,
        }));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function evaluateByValue(protocolClient, expression, awaitPromise = false) {
  const response = await protocolClient.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });

  if (response.exceptionDetails !== undefined) {
    throw new Error(
      response.exceptionDetails.exception?.description
      ?? response.exceptionDetails.text,
    );
  }

  return response.result.value;
}

async function waitForProcessExit(childProcess) {
  if (childProcess === undefined || childProcess.exitCode !== null) {
    return;
  }

  await Promise.race([
    new Promise((resolve) => childProcess.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}

async function measureBrowserInteractions() {
  const overlay = document.querySelector(".interaction-overlay");

  if (!(overlay instanceof HTMLElement)) {
    throw new Error("The interaction overlay is unavailable.");
  }

  overlay.setPointerCapture = () => {};
  overlay.releasePointerCapture = () => {};
  overlay.hasPointerCapture = () => true;
  const bounds = overlay.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const frameTimestamps = [];
  const dispatchPointer = (
    type,
    pointerId,
    clientX,
    clientY,
    buttons = 1,
  ) => {
    overlay.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: "touch",
      isPrimary: pointerId === 1,
      clientX,
      clientY,
      buttons,
    }));
  };

  dispatchPointer("pointerdown", 1, centerX - 100, centerY);
  dispatchPointer("pointerdown", 2, centerX + 100, centerY);

  for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
    await new Promise((resolve) => requestAnimationFrame((timestamp) => {
      frameTimestamps.push(timestamp);
      resolve();
    }));
    const distance = 100 + frameIndex * 2;

    dispatchPointer("pointermove", 1, centerX - distance, centerY);
    dispatchPointer("pointermove", 2, centerX + distance, centerY);
  }

  dispatchPointer("pointerup", 2, centerX + 218, centerY, 0);
  dispatchPointer("pointerup", 1, centerX - 218, centerY, 0);

  const frameDurationsMilliseconds = frameTimestamps
    .slice(1)
    .map((timestamp, index) => timestamp - frameTimestamps[index]);
  const sortedFrameDurations = [...frameDurationsMilliseconds]
    .sort((left, right) => left - right);
  const feedbackStartedAtMilliseconds = performance.now();

  dispatchPointer(
    "pointerdown",
    3,
    bounds.left + bounds.width * 0.75,
    bounds.top + bounds.height * 0.25,
  );
  dispatchPointer(
    "pointermove",
    3,
    bounds.left + bounds.width * 0.78,
    bounds.top + bounds.height * 0.25,
  );
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const gestureFeedbackMilliseconds =
    performance.now() - feedbackStartedAtMilliseconds;

  dispatchPointer(
    "pointercancel",
    3,
    bounds.left + bounds.width * 0.78,
    bounds.top + bounds.height * 0.25,
    0,
  );

  return {
    panZoomFrames: {
      samples: frameDurationsMilliseconds.length,
      medianMilliseconds: roundBrowserMeasurement(
        medianBrowserMeasurement(sortedFrameDurations),
      ),
      p95Milliseconds: roundBrowserMeasurement(
        percentileBrowserMeasurement(sortedFrameDurations, 0.95),
      ),
      maximumMilliseconds: roundBrowserMeasurement(
        Math.max(...frameDurationsMilliseconds),
      ),
    },
    gestureFeedbackMilliseconds: roundBrowserMeasurement(
      gestureFeedbackMilliseconds,
    ),
  };

  function medianBrowserMeasurement(values) {
    return percentileBrowserMeasurement(values, 0.5);
  }

  function percentileBrowserMeasurement(values, percentile) {
    const index = Math.min(
      values.length - 1,
      Math.floor(values.length * percentile),
    );

    return values[index] ?? 0;
  }

  function roundBrowserMeasurement(value) {
    return Math.round(value * 1_000) / 1_000;
  }
}
