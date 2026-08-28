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

const workspaceRoot = process.cwd();
const applicationPort = 5173;
const applicationOrigin = `http://127.0.0.1:${applicationPort}`;
const edgePath = resolveEdgePath();
let viteErrorOutput = "";

async function main() {
  const debugPort = await findAvailablePort();
  const browserProfile = await mkdtemp(path.join(os.tmpdir(), "pianola-render-"));
  const viteProcess = spawn(
  process.execPath,
  [
    path.join(workspaceRoot, "node_modules", "vite", "bin", "vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(applicationPort),
    "--strictPort",
  ],
  {
    cwd: workspaceRoot,
    stdio: ["ignore", "pipe", "pipe"],
  },
  );
  viteProcess.stderr.on("data", (chunk) => {
    viteErrorOutput += String(chunk);
  });
  let edgeProcess;

  try {
    await waitForHttp(`${applicationOrigin}/`);
    edgeProcess = spawn(edgePath, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${browserProfile}`,
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1440,900",
    `${applicationOrigin}/?renderBaseline=1`,
  ], {
    stdio: "ignore",
  });

    const debuggerTarget = await waitForDebuggerTarget(debugPort);
    const cdp = await CdpClient.connect(debuggerTarget.webSocketDebuggerUrl);

    try {
      await cdp.send("Page.enable");
      await cdp.send("Runtime.enable");
      const runs = [];

      for (let runNumber = 1; runNumber <= 3; runNumber += 1) {
        runs.push(await runScenario(cdp, runNumber));
      }

      console.log(JSON.stringify({
        scenario: "blank-project transport, viewport, hover and gesture preview",
        applicationOrigin,
        runs,
      }, null, 2));
    } finally {
      cdp.close();
    }
  } finally {
    edgeProcess?.kill();
    viteProcess.kill();
    await Promise.allSettled([
      waitForExit(edgeProcess),
      waitForExit(viteProcess),
    ]);
    await rm(browserProfile, {
      force: true,
      recursive: true,
    });
  }

  if (viteProcess.exitCode !== null && viteProcess.exitCode !== 0) {
    throw new Error(`Vite stopped unexpectedly. ${viteErrorOutput}`);
  }
}

async function runScenario(cdp, runNumber) {
  await cdp.send("Storage.clearDataForOrigin", {
    origin: applicationOrigin,
    storageTypes: "all",
  });
  await cdp.send("Page.navigate", {
    url: `${applicationOrigin}/?renderBaseline=1&run=${runNumber}`,
  });
  await waitForExpression(cdp, "document.readyState === 'complete'");
  await waitForExpression(cdp, `
    [...document.querySelectorAll('button')]
      .some((button) =>
        button.textContent?.trim() === 'New project' && !button.disabled
      )
  `);
  const created = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.trim() === 'New project');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);

  if (!created) {
    throw new Error("New project button could not be activated.");
  }
  await waitForExpression(cdp, `
    document.querySelector('.app-shell') !== null
      && window.__PIANOLA_RENDER_BASELINE__ !== undefined
  `);
  await assertWorkspaceLayout(cdp);
  await delay(400);
  await evaluate(cdp, "window.__PIANOLA_RENDER_BASELINE__.reset()");

  await clickButtonByLabel(cdp, "Play");
  await delay(900);
  await exerciseViewport(cdp);
  const interactionBounds = await evaluate(cdp, `(() => {
    const target = document.querySelector('[aria-label="Interactive piano roll"]');
    if (!(target instanceof HTMLElement)) {
      throw new Error('Interactive piano roll was not found.');
    }
    const bounds = target.getBoundingClientRect();
    return {
      x: bounds.left + bounds.width * 0.45,
      y: bounds.top + bounds.height * 0.45,
      width: bounds.width,
      height: bounds.height,
    };
  })()`);

  for (let offset = 0; offset < 6; offset += 1) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: interactionBounds.x + offset * 8,
      y: interactionBounds.y + offset * 2,
    });
    await delay(20);
  }

  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    buttons: 1,
    clickCount: 1,
    x: interactionBounds.x,
    y: interactionBounds.y,
  });
  await delay(550);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    button: "left",
    buttons: 1,
    x: interactionBounds.x + Math.min(90, interactionBounds.width * 0.15),
    y: interactionBounds.y,
  });
  await delay(120);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    buttons: 0,
    clickCount: 1,
    x: interactionBounds.x + Math.min(90, interactionBounds.width * 0.15),
    y: interactionBounds.y,
  });
  await delay(250);
  await clickButtonByLabel(cdp, "Pause", false);
  await delay(250);

  return evaluate(cdp, `(() => ({
    ...window.__PIANOLA_RENDER_BASELINE__.snapshot(),
    environment: {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
    },
  }))()`);
}

async function assertWorkspaceLayout(cdp) {
  const layout = await evaluate(cdp, `(() => {
    const appShell = document.querySelector('.app-shell');
    const workspace = appShell?.querySelector(':scope > .workspace');
    const editorPanel = workspace?.querySelector(':scope > .editor-panel');
    const rollFrame = editorPanel?.querySelector(':scope > .roll-frame');
    const rollStage = rollFrame?.querySelector(':scope > .roll-stage');
    const canvasHost = rollStage?.querySelector(':scope > .canvas-host');
    const inspector = workspace?.querySelector(':scope > #project-inspector');
    const toolbarHost = inspector?.querySelector(
      ':scope > .project-inspector-toolbar-host',
    );
    const toolbar = toolbarHost?.querySelector(':scope > .editor-toolbar');

    return {
      appShell: appShell instanceof HTMLElement,
      workspace: workspace instanceof HTMLElement,
      editorPanel: editorPanel instanceof HTMLElement,
      rollFrame: rollFrame instanceof HTMLElement,
      rollStage: rollStage instanceof HTMLElement,
      canvasHost: canvasHost instanceof HTMLElement,
      inspector: inspector instanceof HTMLElement,
      toolbarPortal: toolbar instanceof HTMLElement,
    };
  })()`);
  const missing = Object.entries(layout)
    .filter(([, present]) => !present)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Workspace layout smoke failed: ${missing.join(', ')}.`);
  }
}

async function exerciseViewport(cdp) {
  await evaluate(cdp, `(async () => {
    const setRange = (label, ratio) => {
      const input = document.querySelector(
        'input[type="range"][aria-label="' + label + '"]',
      );
      if (!(input instanceof HTMLInputElement)) {
        throw new Error(label + ' range was not found.');
      }
      const minimum = Number(input.min);
      const maximum = Number(input.max);
      const value = minimum + (maximum - minimum) * ratio;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    for (const ratio of [0.25, 0.55, 0.35, 0.65]) {
      setRange('Horizontal timeline position', ratio);
      setRange('Horizontal zoom', ratio);
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
  })()`);
}

async function clickButtonByLabel(cdp, label, required = true) {
  const clicked = await evaluate(cdp, `(() => {
    const button = document.querySelector(
      'button[aria-label=${JSON.stringify(label)}]',
    );
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);

  if (required && !clicked) {
    throw new Error(`${label} button was not found.`);
  }
}

async function evaluate(cdp, expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });

  if (response.exceptionDetails !== undefined) {
    throw new Error(
      response.exceptionDetails.exception?.description
      ?? response.exceptionDetails.text,
    );
  }

  return response.result.value;
}

async function waitForExpression(cdp, expression) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (await evaluate(cdp, `Boolean(${expression})`)) {
      return;
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for: ${expression}`);
}

class CdpClient {
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CdpClient(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.requestId = 0;
    this.pendingRequests = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.pendingRequests.get(message.id);

      if (pending === undefined) {
        return;
      }

      this.pendingRequests.delete(message.id);

      if (message.error !== undefined) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    });
  }

  send(method, params = {}) {
    this.requestId += 1;
    const id = this.requestId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

function resolveEdgePath() {
  const configuredPath = process.env["PIANOLA_EDGE_PATH"];

  if (configuredPath !== undefined && configuredPath.length > 0) {
    return configuredPath;
  }

  if (process.platform === "win32") {
    return "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  }

  throw new Error("Set PIANOLA_EDGE_PATH to a Chromium-compatible Edge binary.");
}

async function findAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null
    ? address.port
    : null;
  await new Promise((resolve) => server.close(resolve));

  if (port === null) {
    throw new Error("Could not allocate a browser debugging port.");
  }

  return port;
}

async function waitForHttp(url) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for ${url}. ${viteErrorOutput}`);
}

async function waitForDebuggerTarget(port) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((candidate) => candidate.type === "page");

      if (target !== undefined) {
        return target;
      }
    } catch {
      // Edge is still starting.
    }

    await delay(100);
  }

  throw new Error("Timed out waiting for the Edge debugging target.");
}

async function waitForExit(childProcess) {
  if (childProcess === undefined || childProcess.exitCode !== null) {
    return;
  }

  await Promise.race([
    new Promise((resolve) => childProcess.once("exit", resolve)),
    delay(2_000),
  ]);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

await main();
