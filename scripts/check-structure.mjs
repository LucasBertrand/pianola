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
  "src/domain/model.ts",
  "src/editor/piano-roll",
  "src/use-cases/notes",
  "src/use-cases/selection",
  "src/ui/piano-roll/Timeline.tsx",
  "src/ui/editor-toolbar/ViewControls.tsx",
  "src/ui/inspector/GeneralInspector.tsx",
  "src/ui/piano-roll/useSelectionWorkflow.ts",
  "src/styles/header-transport.css",
];
const requiredGuides = [
  "src/domain/README.md",
  "src/editor/README.md",
  "src/use-cases/README.md",
  "src/audio/README.md",
  "src/project-io/README.md",
  "src/ui/README.md",
];
const requiredStyles = [
  "src/styles/application-header.css",
  "src/styles/dialogs.css",
  "src/styles/editor-toolbar.css",
  "src/styles/inspector.css",
  "src/styles/piano-roll.css",
  "src/styles/project-files.css",
  "src/styles/responsive.css",
  "src/styles/shell.css",
  "src/styles/tokens-reset.css",
  "src/styles/transport.css",
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
const internalCapabilities = [
  {
    targets: [
      "src/audio/audio-param-automation.ts",
      "src/audio/playback-occurrence-scheduler.ts",
      "src/audio/playback-transport-query.ts",
      "src/audio/web-audio-routing.ts",
    ],
    owner: "src/audio/",
  },
  {
    targets: ["src/ui/piano-roll/interactions/"],
    owner: "src/ui/piano-roll/",
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

const appPath = path.join(sourceRoot, "app", "App.tsx");
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
  violations.push(`src/app/App.tsx has ${appLineCount} lines; expected fewer than 350.`);
}

if (appImportCount >= 20) {
  violations.push(`src/app/App.tsx has ${appImportCount} imports; expected fewer than 20.`);
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
