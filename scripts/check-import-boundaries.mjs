import {
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const PROTECTED_SOURCE_ZONES = new Set([
  "domain",
  "music",
  "geometry",
]);
const USE_CASE_SOURCE_ZONES = new Set([
  "application",
  "use-cases",
]);
const ADAPTER_SOURCE_ZONES = new Set([
  "audio",
  "midi",
  "persistence",
  "project-io",
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

const workspaceRoot = path.resolve(readRootArgument(process.argv.slice(2)));
const sourceRoot = path.join(workspaceRoot, "src");
const sourceFiles = await collectSourceFiles(sourceRoot);
const violations = [];

for (const sourceFile of sourceFiles) {
  const sourceText = await readFile(sourceFile, "utf8");
  const parsedSource = ts.createSourceFile(
    sourceFile,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourceFile.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  for (const importedModule of collectImportedModules(parsedSource)) {
    const violation = evaluateImport(
      sourceRoot,
      sourceFile,
      importedModule.specifier,
    );

    if (violation !== null) {
      violations.push({
        ...violation,
        line: parsedSource.getLineAndCharacterOfPosition(
          importedModule.position,
        ).line + 1,
      });
    }
  }

  if (PROTECTED_SOURCE_ZONES.has(getSourceZone(sourceRoot, sourceFile))) {
    for (const browserApi of collectBrowserApiReferences(parsedSource)) {
      violations.push({
        sourceFile: toPosixPath(path.relative(workspaceRoot, sourceFile)),
        specifier: `<browser-global:${browserApi.name}>`,
        rule: "core-browser-isolation",
        message:
          `${getSourceZone(sourceRoot, sourceFile)} must not use browser APIs.`,
        line: parsedSource.getLineAndCharacterOfPosition(
          browserApi.position,
        ).line + 1,
      });
    }
  }
}

if (violations.length > 0) {
  console.error(
    `Import boundary check failed with ${violations.length} violation(s):`,
  );

  for (const violation of violations) {
    console.error(
      `- ${violation.sourceFile}:${violation.line} imports `
      + `"${violation.specifier}" [${violation.rule}] `
      + violation.message,
    );
  }

  process.exitCode = 1;
} else {
  console.log(
    `Import boundary check passed (${sourceFiles.length} source files).`,
  );
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

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(entryPath));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
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

  function visit(node) {
    if (
      ts.isIdentifier(node)
      && BROWSER_GLOBALS.has(node.text)
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

function isReferenceIdentifier(identifier) {
  const parent = identifier.parent;

  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === identifier)
    || (ts.isPropertyAssignment(parent) && parent.name === identifier)
    || (ts.isMethodDeclaration(parent) && parent.name === identifier)
    || (ts.isPropertyDeclaration(parent) && parent.name === identifier)
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
  const relativeSourceFile = toPosixPath(path.relative(
    path.dirname(sourceRootPath),
    sourceFile,
  ));

  if (PROTECTED_SOURCE_ZONES.has(sourceZone)) {
    if (targetZone === "app" || targetZone === "ui") {
      return createViolation(
        relativeSourceFile,
        specifier,
        "core-isolation",
        `${sourceZone} must not depend on ${targetZone}.`,
      );
    }

    if (REACT_PACKAGES.has(externalPackage)) {
      return createViolation(
        relativeSourceFile,
        specifier,
        "core-react-isolation",
        `${sourceZone} must not depend on React.`,
      );
    }
  }

  if (
    USE_CASE_SOURCE_ZONES.has(sourceZone)
    && (targetZone === "app" || targetZone === "ui")
  ) {
    return createViolation(
      relativeSourceFile,
      specifier,
      "use-case-isolation",
      `${sourceZone} must not depend on ${targetZone}.`,
    );
  }

  if (ADAPTER_SOURCE_ZONES.has(sourceZone)) {
    if (targetZone === "app") {
      return createViolation(
        relativeSourceFile,
        specifier,
        "adapter-composition-isolation",
        `${sourceZone} must not depend on app composition.`,
      );
    }

    if (
      REACT_PACKAGES.has(externalPackage)
      || isReactComponentTarget(sourceRootPath, sourceFile, specifier)
    ) {
      return createViolation(
        relativeSourceFile,
        specifier,
        "adapter-react-isolation",
        `${sourceZone} must not depend on React components.`,
      );
    }
  }

  return null;
}

function getSourceZone(sourceRootPath, sourceFile) {
  return toPosixPath(path.relative(sourceRootPath, sourceFile)).split("/")[0];
}

function getTargetZone(sourceRootPath, sourceFile, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const resolvedTarget = path.resolve(path.dirname(sourceFile), specifier);
  const relativeTarget = toPosixPath(path.relative(sourceRootPath, resolvedTarget));

  if (relativeTarget.startsWith("../")) {
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

function isReactComponentTarget(sourceRootPath, sourceFile, specifier) {
  if (!specifier.startsWith(".")) {
    return false;
  }

  const resolvedTarget = path.resolve(path.dirname(sourceFile), specifier);
  const relativeTarget = toPosixPath(path.relative(sourceRootPath, resolvedTarget));

  return relativeTarget.startsWith("ui/components/")
    || relativeTarget.endsWith(".tsx");
}

function createViolation(sourceFile, specifier, rule, message) {
  return {
    sourceFile,
    specifier,
    rule,
    message,
  };
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}
