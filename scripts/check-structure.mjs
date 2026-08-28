import {
  access,
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const workspaceRoot = path.resolve(readRootArgument(process.argv.slice(2)));
const sourceRoot = path.join(workspaceRoot, "src");
const violations = [];
await import("./check-docs.mjs");

if (process.exitCode !== undefined && process.exitCode !== 0) {
  violations.push("Documentation links or documented paths are invalid.");
}

const forbiddenPaths = [
  "src/config",
  "src/music",
  "src/ui",
  "src/styles",
  "src/audio",
  "src/project-io",
  "src/pwa",
  "src/app",
  "src/main.tsx",
  "src/presentation/shared",
  "src/domain/commands/active-clip-command-helpers.ts",
  "src/domain/commands/clip-commands.ts",
  "src/domain/model.ts",
  "src/editor",
  "src/editor-core/piano-roll",
  "src/use-cases",
  "src/application/notes",
  "src/application/selection",
  "src/presentation/piano-roll/Timeline.tsx",
  "src/presentation/editor-toolbar/ViewControls.tsx",
  "src/presentation/inspector/GeneralInspector.tsx",
  "src/presentation/piano-roll/useSelectionWorkflow.ts",
  "src/presentation/styles/header-transport.css",
];
const requiredGuides = [
  "src/domain/README.md",
  "src/editor-core/README.md",
  "src/application/README.md",
  "src/infrastructure/audio/README.md",
  "src/infrastructure/project-files/README.md",
  "src/presentation/README.md",
];
const requiredStyles = [
  "src/presentation/styles/index.css",
  "src/presentation/styles/application-header.css",
  "src/presentation/styles/dialogs.css",
  "src/presentation/styles/editor-toolbar.css",
  "src/presentation/styles/inspector.css",
  "src/presentation/styles/piano-roll.css",
  "src/presentation/styles/project-files.css",
  "src/presentation/styles/responsive.css",
  "src/presentation/styles/shell.css",
  "src/presentation/styles/tokens-reset.css",
  "src/presentation/styles/transport.css",
];
const forbiddenGenericFileNames = new Set([
  "common.ts",
  "contracts.ts",
  "helpers.ts",
  "input.ts",
  "state.ts",
  "types.ts",
  "utils.ts",
]);
const retiredStateTypeNames = new Set([
  "ProjectClipWorkspaceState",
  "ProjectState",
  "ProjectWorkspaceState",
  "Track",
  "WorkspaceState",
]);
const internalCapabilities = [
  {
    targets: [
      "src/infrastructure/audio/audio-param-automation.ts",
      "src/infrastructure/audio/playback-occurrence-scheduler.ts",
      "src/infrastructure/audio/playback-transport-query.ts",
      "src/infrastructure/audio/web-audio-routing.ts",
    ],
    owner: "src/infrastructure/audio/",
  },
  {
    targets: ["src/presentation/piano-roll/interactions/"],
    owner: "src/presentation/piano-roll/",
  },
];

for (const relativePath of forbiddenPaths) {
  if (await pathExists(path.join(workspaceRoot, relativePath))) {
    violations.push(`${relativePath} is a forbidden legacy path.`);
  }
}

for (const relativePath of [...requiredGuides, ...requiredStyles]) {
  if (!await pathExists(path.join(workspaceRoot, relativePath))) {
    violations.push(`${relativePath} is required.`);
  }
}

const sourceFiles = await collectSourceFiles(sourceRoot);

for (const sourceFile of sourceFiles) {
  const sourceText = await readFile(sourceFile, "utf8");
  const relativeSource = relative(sourceFile);

  if (forbiddenGenericFileNames.has(path.basename(sourceFile))) {
    violations.push(`${relativeSource} has a forbidden generic name.`);
  }

  if (/general-inspector|header-transport/.test(sourceText)) {
    violations.push(`${relativeSource} uses a retired owner name.`);
  }

  const parsed = ts.createSourceFile(
    sourceFile,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourceFile.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  for (const identifier of collectIdentifiers(parsed)) {
    if (retiredStateTypeNames.has(identifier)) {
      violations.push(
        `${relativeSource} uses retired state type identifier ${identifier}.`,
      );
    }
  }

  for (const specifier of collectRelativeImports(parsed)) {
    const target = resolveSourceImport(sourceFile, specifier);

    if (target === null) {
      continue;
    }

    const relativeTarget = relative(target);

    for (const capability of internalCapabilities) {
      if (
        capability.targets.some((prefix) => relativeTarget.startsWith(prefix))
        && !relativeSource.startsWith(capability.owner)
      ) {
        violations.push(
          `${relativeSource} bypasses ${capability.owner} through ${relativeTarget}.`,
        );
      }
    }
  }
}

const appPath = path.join(sourceRoot, "bootstrap", "App.tsx");
const appText = await readFile(appPath, "utf8");
const appParsed = ts.createSourceFile(
  appPath,
  appText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const appLineCount = appText.split(/\r?\n/).length;
const appImportCount = appParsed.statements.filter(ts.isImportDeclaration).length;

if (appLineCount >= 350) {
  violations.push(`src/bootstrap/App.tsx has ${appLineCount} lines; expected fewer than 350.`);
}

if (appImportCount >= 20) {
  violations.push(`src/bootstrap/App.tsx has ${appImportCount} imports; expected fewer than 20.`);
}

const lineReview = [];

for (const sourceFile of sourceFiles) {
  const sourceText = await readFile(sourceFile, "utf8");
  const lineCount = sourceText.split(/\r?\n/).length;

  if (lineCount >= 500) {
    lineReview.push(`${relative(sourceFile)} (${lineCount})`);
  }
}

if (violations.length > 0) {
  console.error(`Structure check failed with ${violations.length} violation(s):`);
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log(`Structure check passed (${sourceFiles.length} source files).`);
  console.log(
    `Informational 500-line review: ${lineReview.length === 0 ? "none" : lineReview.join(", ")}`,
  );
}

function collectRelativeImports(sourceFile) {
  const imports = [];

  for (const statement of sourceFile.statements) {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      && statement.moduleSpecifier !== undefined
      && ts.isStringLiteralLike(statement.moduleSpecifier)
      && statement.moduleSpecifier.text.startsWith(".")
    ) {
      imports.push(statement.moduleSpecifier.text);
    }
  }

  return imports;
}

function collectIdentifiers(sourceFile) {
  const identifiers = [];

  function visit(node) {
    if (ts.isIdentifier(node)) {
      identifiers.push(node.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return identifiers;
}

function resolveSourceImport(importer, specifier) {
  const base = path.resolve(path.dirname(importer), specifier);

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`]) {
    if (sourceFiles.includes(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(entryPath));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function relative(targetPath) {
  return path.relative(workspaceRoot, targetPath).replaceAll(path.sep, "/");
}

function readRootArgument(argumentsList) {
  const index = argumentsList.indexOf("--root");
  return index < 0 ? process.cwd() : argumentsList[index + 1] ?? process.cwd();
}
