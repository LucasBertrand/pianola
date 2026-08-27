import {
  readdir,
  readFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const CURRENT_SOURCE_ZONE_IMPORTS = new Map([
  ["app", new Set([
    "app",
    "audio",
    "config",
    "domain",
    "editor",
    "infrastructure",
    "music",
    "persistence",
    "project-io",
    "pwa",
    "ui",
    "use-cases",
  ])],
  ["audio", new Set(["audio", "config", "domain"])],
  ["config", new Set(["config"])],
  ["domain", new Set(["config", "domain", "music"])],
  ["infrastructure", new Set([
    "config",
    "domain",
    "editor",
    "infrastructure",
    "music",
    "persistence",
  ])],
  ["editor", new Set([
    "config",
    "domain",
    "editor",
    "music",
    "use-cases",
  ])],
  ["music", new Set(["config", "domain", "music", "use-cases"])],
  ["persistence", new Set([
    "config",
    "domain",
    "editor",
    "music",
    "persistence",
  ])],
  ["project-io", new Set([
    "config",
    "domain",
    "editor",
    "infrastructure",
    "music",
    "persistence",
    "project-io",
  ])],
  ["pwa", new Set(["infrastructure", "persistence", "project-io", "pwa", "use-cases"])],
  ["ui", new Set([
    "audio",
    "config",
    "domain",
    "editor",
    "infrastructure",
    "music",
    "persistence",
    "project-io",
    "pwa",
    "ui",
    "use-cases",
  ])],
  ["use-cases", new Set([
    "config",
    "domain",
    "editor",
    "music",
    "persistence",
    "project-io",
    "use-cases",
  ])],
]);
const COMPOSITION_SOURCE_ZONE = "<entrypoint>";
const PROTECTED_CORE_SOURCE_ZONES = new Set([
  "domain",
  "editor",
  "music",
]);
const BROWSER_FREE_SOURCE_ZONES = new Set([
  "config",
  "domain",
  "editor",
  "music",
  "persistence",
  "use-cases",
]);
const REACT_SOURCE_ZONES = new Set([
  COMPOSITION_SOURCE_ZONE,
  "app",
  "ui",
]);
const ALLOWED_APP_FILES = new Set([
  "App.tsx",
  "create-app-runtime.ts",
]);
const GENERIC_SOURCE_FILE_NAMES = new Set([
  "common.ts",
  "contracts.ts",
  "helpers.ts",
  "input.ts",
  "state.ts",
  "types.ts",
  "utils.ts",
]);
const REACT_PACKAGES = new Set([
  "react",
  "react-dom",
]);
const BROWSER_GLOBALS = new Set([
  "AudioContext",
  "CanvasRenderingContext2D",
  "HTMLElement",
  "HTMLCanvasElement",
  "cancelAnimationFrame",
  "document",
  "indexedDB",
  "localStorage",
  "navigator",
  "requestAnimationFrame",
  "sessionStorage",
  "window",
]);
const MODULE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
];
const ACCEPTED_PRODUCT_CYCLES = new Map([
  [
    [
      "src/editor/geometry/spatial-index-search.ts",
      "src/editor/geometry/spatial-index.ts",
    ].sort().join("|"),
    "cycle typé connu, extraction planifiée au lot 4",
  ],
]);

const workspaceRoot = path.resolve(readRootArgument(process.argv.slice(2)));
const sourceRoot = path.join(workspaceRoot, "src");
const testsRoot = path.join(workspaceRoot, "tests");
const sourceFiles = await collectModuleFiles(sourceRoot, {
  extensions: new Set([".ts", ".tsx"]),
});
const productFiles = sourceFiles.filter((sourceFile) => !isTestFile(sourceFile));
const testFiles = [
  ...sourceFiles.filter(isTestFile),
  ...await collectModuleFiles(testsRoot, {
    extensions: new Set(MODULE_EXTENSIONS),
  }),
].sort((left, right) => left.localeCompare(right));
const allModuleFiles = new Set([...productFiles, ...testFiles]);
const productFileSet = new Set(productFiles);
const testFileSet = new Set(testFiles);
const parsedModules = new Map();
const violations = [];

for (const sourceFile of productFiles) {
  violations.push(...evaluateSourceLayout(sourceRoot, sourceFile));
  const parsedSource = await parseModule(sourceFile);

  for (const importedModule of collectImportedModules(parsedSource)) {
    const violation = evaluateImport(
      sourceRoot,
      sourceFile,
      importedModule.specifier,
    );

    if (violation !== null) {
      violations.push(withLine(violation, parsedSource, importedModule.position));
    }

    const importedFile = resolveLocalModule(
      sourceFile,
      importedModule.specifier,
      allModuleFiles,
    );

    if (importedFile !== null && testFileSet.has(importedFile)) {
      violations.push(withLine(createViolation(
        relative(sourceFile),
        importedModule.specifier,
        "production-test-isolation",
        "Production code must not import a test module.",
      ), parsedSource, importedModule.position));
    }
  }

  if (BROWSER_FREE_SOURCE_ZONES.has(getSourceZone(sourceRoot, sourceFile))) {
    for (const browserApi of collectBrowserApiReferences(parsedSource)) {
      violations.push(withLine(createViolation(
        relative(sourceFile),
        `<browser-global:${browserApi.name}>`,
        PROTECTED_CORE_SOURCE_ZONES.has(getSourceZone(sourceRoot, sourceFile))
          ? "core-browser-isolation"
          : "browser-isolation",
        `${getSourceZone(sourceRoot, sourceFile)} must not use browser APIs.`,
      ), parsedSource, browserApi.position));
    }
  }
}

const productGraph = await createImportGraph(productFiles, productFileSet);
const testGraph = await createImportGraph(testFiles, testFileSet);
const productCycles = findImportCycles(productGraph);
const testCycles = findImportCycles(testGraph);
const acceptedProductCycles = [];

for (const cycle of productCycles) {
  const cycleKey = cycle.map(relative).sort().join("|");
  const acceptedReason = ACCEPTED_PRODUCT_CYCLES.get(cycleKey);

  if (acceptedReason !== undefined) {
    acceptedProductCycles.push({
      files: cycle.map(relative).sort(),
      reason: acceptedReason,
    });
  } else {
    violations.push(createCycleViolation("product", cycle));
  }
}

for (const cycle of testCycles) {
  violations.push(createCycleViolation("test", cycle));
}

if (violations.length > 0) {
  console.error(
    `Import boundary check failed with ${violations.length} violation(s):`,
  );

  for (const violation of violations) {
    console.error(formatViolation(violation));
  }

  process.exitCode = 1;
} else {
  console.log(
    "Import boundary check passed "
    + `(${productFiles.length} product files, ${testFiles.length} test files).`,
  );

  for (const acceptedCycle of acceptedProductCycles) {
    console.log(
      "Accepted product cycle baseline: "
      + `${acceptedCycle.files.join(" <-> ")} `
      + `(${acceptedCycle.reason}).`,
    );
  }
}

function readRootArgument(argumentsList) {
  const rootArgumentIndex = argumentsList.indexOf("--root");

  if (rootArgumentIndex < 0) {
    return process.cwd();
  }

  const rootArgument = argumentsList[rootArgumentIndex + 1];

  if (rootArgument === undefined) {
    throw new Error("--root requires a directory path.");
  }

  return rootArgument;
}

async function collectModuleFiles(directory, options) {
  let entries;

  try {
    entries = await readdir(directory, {
      withFileTypes: true,
    });
  } catch (error) {
    if (error !== null && typeof error === "object" && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectModuleFiles(entryPath, options));
    } else if (
      options.extensions.has(path.extname(entry.name))
      && !entry.name.endsWith(".d.ts")
    ) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function isTestFile(sourceFile) {
  return sourceFile.split(path.sep).includes("__tests__")
    || /\.test\.[cm]?[jt]sx?$/.test(sourceFile);
}

async function parseModule(sourceFile) {
  const cached = parsedModules.get(sourceFile);

  if (cached !== undefined) {
    return cached;
  }

  const sourceText = await readFile(sourceFile, "utf8");
  const extension = path.extname(sourceFile);
  const scriptKind = extension === ".tsx"
    ? ts.ScriptKind.TSX
    : extension === ".ts"
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;
  const parsedSource = ts.createSourceFile(
    sourceFile,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  parsedModules.set(sourceFile, parsedSource);
  return parsedSource;
}

function collectImportedModules(sourceFile) {
  const importedModules = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined
      && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      importedModules.push({
        specifier: node.moduleSpecifier.text,
        position: node.moduleSpecifier.getStart(sourceFile),
      });
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
    ) {
      const [moduleSpecifier] = node.arguments;

      if (
        moduleSpecifier !== undefined
        && ts.isStringLiteralLike(moduleSpecifier)
      ) {
        importedModules.push({
          specifier: moduleSpecifier.text,
          position: moduleSpecifier.getStart(sourceFile),
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return importedModules;
}

function collectBrowserApiReferences(sourceFile) {
  const references = [];
  const locallyDeclaredBrowserGlobals = collectLocallyDeclaredBrowserGlobals(
    sourceFile,
  );

  function visit(node) {
    if (
      ts.isIdentifier(node)
      && BROWSER_GLOBALS.has(node.text)
      && !locallyDeclaredBrowserGlobals.has(node.text)
      && isReferenceIdentifier(node)
    ) {
      references.push({
        name: node.text,
        position: node.getStart(sourceFile),
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

function collectLocallyDeclaredBrowserGlobals(sourceFile) {
  const declarations = new Set();

  function visit(node) {
    if (
      ts.isIdentifier(node)
      && BROWSER_GLOBALS.has(node.text)
      && isDeclarationIdentifier(node)
    ) {
      declarations.add(node.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return declarations;
}

function isDeclarationIdentifier(identifier) {
  const parent = identifier.parent;

  return (
    (ts.isVariableDeclaration(parent) && parent.name === identifier)
    || (ts.isParameter(parent) && parent.name === identifier)
    || (ts.isBindingElement(parent) && parent.name === identifier)
    || (ts.isFunctionDeclaration(parent) && parent.name === identifier)
    || (ts.isClassDeclaration(parent) && parent.name === identifier)
    || (ts.isImportClause(parent) && parent.name === identifier)
    || (ts.isImportSpecifier(parent) && parent.name === identifier)
  );
}

function isReferenceIdentifier(identifier) {
  const parent = identifier.parent;

  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === identifier)
    || (ts.isPropertyAssignment(parent) && parent.name === identifier)
    || (ts.isMethodDeclaration(parent) && parent.name === identifier)
    || (ts.isMethodSignature(parent) && parent.name === identifier)
    || (ts.isPropertyDeclaration(parent) && parent.name === identifier)
    || (ts.isPropertySignature(parent) && parent.name === identifier)
    || (ts.isVariableDeclaration(parent) && parent.name === identifier)
    || (ts.isParameter(parent) && parent.name === identifier)
  ) {
    return false;
  }

  return true;
}

function evaluateImport(sourceRootPath, sourceFile, specifier) {
  const sourceZone = getSourceZone(sourceRootPath, sourceFile);
  const targetZone = getTargetZone(sourceRootPath, sourceFile, specifier);
  const externalPackage = getExternalPackage(specifier);
  const relativeSourceFile = relative(sourceFile);

  if (targetZone !== null && sourceZone !== COMPOSITION_SOURCE_ZONE) {
    const allowedTargets = CURRENT_SOURCE_ZONE_IMPORTS.get(sourceZone);

    if (allowedTargets !== undefined && !allowedTargets.has(targetZone)) {
      return createViolation(
        relativeSourceFile,
        specifier,
        selectLayerRule(sourceZone, targetZone),
        `${sourceZone} must not depend on ${targetZone}.`,
      );
    }
  }

  if (
    REACT_PACKAGES.has(externalPackage)
    && !REACT_SOURCE_ZONES.has(sourceZone)
  ) {
    return createViolation(
      relativeSourceFile,
      specifier,
      PROTECTED_CORE_SOURCE_ZONES.has(sourceZone)
        ? "core-react-isolation"
        : "react-isolation",
      `${sourceZone} must not depend on React.`,
    );
  }

  return null;
}

function selectLayerRule(sourceZone, targetZone) {
  if (targetZone === "app") {
    return "composition-isolation";
  }

  if (PROTECTED_CORE_SOURCE_ZONES.has(sourceZone) && targetZone === "ui") {
    return "core-isolation";
  }

  if (sourceZone === "use-cases" && targetZone === "ui") {
    return "use-case-isolation";
  }

  return "current-layer-direction";
}

function evaluateSourceLayout(sourceRootPath, sourceFile) {
  const relativeSourceFile = relative(sourceFile);
  const sourceZone = getSourceZone(sourceRootPath, sourceFile);
  const fileName = path.basename(sourceFile);
  const layoutViolations = [];

  if (
    sourceZone !== COMPOSITION_SOURCE_ZONE
    && !CURRENT_SOURCE_ZONE_IMPORTS.has(sourceZone)
  ) {
    layoutViolations.push(createViolation(
      relativeSourceFile,
      "<source-layout>",
      "unregistered-source-zone",
      `${sourceZone} is not registered as a current source layer.`,
    ));
  }

  if (sourceZone === "app" && !ALLOWED_APP_FILES.has(fileName)) {
    layoutViolations.push(createViolation(
      relativeSourceFile,
      "<source-layout>",
      "app-composition-layout",
      `app may only contain ${[...ALLOWED_APP_FILES].join(", ")}.`,
    ));
  }

  if (GENERIC_SOURCE_FILE_NAMES.has(fileName)) {
    layoutViolations.push(createViolation(
      relativeSourceFile,
      "<source-layout>",
      "generic-file-name",
      `${fileName} does not expose its functional responsibility.`,
    ));
  }

  return layoutViolations;
}

function getSourceZone(sourceRootPath, sourceFile) {
  const relativeSourceFile = toPosixPath(path.relative(sourceRootPath, sourceFile));

  return relativeSourceFile.includes("/")
    ? relativeSourceFile.split("/")[0]
    : COMPOSITION_SOURCE_ZONE;
}

function getTargetZone(sourceRootPath, sourceFile, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const resolvedTarget = path.resolve(path.dirname(sourceFile), specifier);
  const relativeTarget = toPosixPath(path.relative(sourceRootPath, resolvedTarget));

  if (relativeTarget.startsWith("../") || !relativeTarget.includes("/")) {
    return null;
  }

  return relativeTarget.split("/")[0];
}

function getExternalPackage(specifier) {
  if (specifier.startsWith(".")) {
    return null;
  }

  const segments = specifier.split("/");

  return specifier.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : segments[0];
}

async function createImportGraph(moduleFiles, graphFileSet) {
  const graph = new Map(moduleFiles.map((moduleFile) => [moduleFile, new Set()]));

  for (const moduleFile of moduleFiles) {
    const parsedModule = await parseModule(moduleFile);

    for (const importedModule of collectImportedModules(parsedModule)) {
      const importedFile = resolveLocalModule(
        moduleFile,
        importedModule.specifier,
        allModuleFiles,
      );

      if (importedFile !== null && graphFileSet.has(importedFile)) {
        graph.get(moduleFile)?.add(importedFile);
      }
    }
  }

  return graph;
}

function resolveLocalModule(importer, specifier, moduleFiles) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [base];

  for (const extension of MODULE_EXTENSIONS) {
    candidates.push(`${base}${extension}`);
    candidates.push(path.join(base, `index${extension}`));
  }

  if (/\.m?js$/.test(base)) {
    const extensionlessBase = base.replace(/\.m?js$/, "");
    candidates.push(`${extensionlessBase}.ts`, `${extensionlessBase}.tsx`);
  }

  return candidates.find((candidate) => moduleFiles.has(candidate)) ?? null;
}

function findImportCycles(graph) {
  const indices = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];
  let currentIndex = 0;

  function visit(moduleFile) {
    indices.set(moduleFile, currentIndex);
    lowLinks.set(moduleFile, currentIndex);
    currentIndex += 1;
    stack.push(moduleFile);
    onStack.add(moduleFile);

    for (const importedFile of graph.get(moduleFile) ?? []) {
      if (!indices.has(importedFile)) {
        visit(importedFile);
        lowLinks.set(
          moduleFile,
          Math.min(lowLinks.get(moduleFile), lowLinks.get(importedFile)),
        );
      } else if (onStack.has(importedFile)) {
        lowLinks.set(
          moduleFile,
          Math.min(lowLinks.get(moduleFile), indices.get(importedFile)),
        );
      }
    }

    if (lowLinks.get(moduleFile) !== indices.get(moduleFile)) {
      return;
    }

    const component = [];
    let componentFile;

    do {
      componentFile = stack.pop();
      onStack.delete(componentFile);
      component.push(componentFile);
    } while (componentFile !== moduleFile);

    if (
      component.length > 1
      || (component.length === 1 && graph.get(moduleFile)?.has(moduleFile))
    ) {
      components.push(component);
    }
  }

  for (const moduleFile of graph.keys()) {
    if (!indices.has(moduleFile)) {
      visit(moduleFile);
    }
  }

  return components;
}

function createCycleViolation(kind, cycle) {
  const cycleFiles = cycle.map(relative).sort();

  return {
    sourceFile: cycleFiles[0],
    specifier: "<import-cycle>",
    rule: `${kind}-import-cycle`,
    message: `Import cycle members: ${cycleFiles.join(" -> ")}.`,
  };
}

function createViolation(sourceFile, specifier, rule, message) {
  return {
    sourceFile,
    specifier,
    rule,
    message,
  };
}

function withLine(violation, sourceFile, position) {
  return {
    ...violation,
    line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
  };
}

function formatViolation(violation) {
  const location = violation.line === undefined
    ? violation.sourceFile
    : `${violation.sourceFile}:${violation.line}`;

  return `- ${location} imports "${violation.specifier}" `
    + `[${violation.rule}] ${violation.message}`;
}

function relative(targetPath) {
  return toPosixPath(path.relative(workspaceRoot, targetPath));
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}
