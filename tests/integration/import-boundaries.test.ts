import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  tmpdir,
} from "node:os";
import path from "node:path";
import {
  spawnSync,
} from "node:child_process";
import {
  afterEach,
  expect,
  test,
} from "vitest";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

test("reports an actionable failure for a forbidden import", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "pianola-boundaries-"));
  const domainDirectory = path.join(fixtureRoot, "src", "domain");
  const uiDirectory = path.join(fixtureRoot, "src", "ui");

  temporaryDirectories.push(fixtureRoot);
  mkdirSync(domainDirectory, { recursive: true });
  mkdirSync(uiDirectory, { recursive: true });
  writeFileSync(
    path.join(domainDirectory, "forbidden.ts"),
    'import "../ui/component";\n',
  );
  writeFileSync(path.join(uiDirectory, "component.ts"), "export {};\n");

  const result = spawnSync(
    process.execPath,
    [
      path.resolve("scripts/check-import-boundaries.mjs"),
      "--root",
      fixtureRoot,
    ],
    {
      encoding: "utf8",
    },
  );

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("src/domain/forbidden.ts:1");
  expect(result.stderr).toContain('imports "../ui/component"');
  expect(result.stderr).toContain("[core-isolation]");
});

test("rejects a browser API in a protected source zone", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "pianola-boundaries-"));
  const musicDirectory = path.join(fixtureRoot, "src", "music");

  temporaryDirectories.push(fixtureRoot);
  mkdirSync(musicDirectory, { recursive: true });
  writeFileSync(
    path.join(musicDirectory, "browser-coupling.ts"),
    "export const pageTitle = document.title;\n",
  );

  const result = spawnSync(
    process.execPath,
    [
      path.resolve("scripts/check-import-boundaries.mjs"),
      "--root",
      fixtureRoot,
    ],
    {
      encoding: "utf8",
    },
  );

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("src/music/browser-coupling.ts:1");
  expect(result.stderr).toContain("<browser-global:document>");
  expect(result.stderr).toContain("[core-browser-isolation]");
});

test("enforces the dependency map for every current production layer", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "pianola-boundaries-"));
  const configDirectory = path.join(fixtureRoot, "src", "config");
  const domainDirectory = path.join(fixtureRoot, "src", "domain");

  temporaryDirectories.push(fixtureRoot);
  mkdirSync(configDirectory, { recursive: true });
  mkdirSync(domainDirectory, { recursive: true });
  writeFileSync(
    path.join(configDirectory, "invalid-owner.ts"),
    'import "../domain/model";\n',
  );
  writeFileSync(path.join(domainDirectory, "model.ts"), "export {};\n");

  const result = runBoundaryCheck(fixtureRoot);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("src/config/invalid-owner.ts:1");
  expect(result.stderr).toContain("[current-layer-direction]");
});

test("detects production import cycles", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "pianola-boundaries-"));
  const domainDirectory = path.join(fixtureRoot, "src", "domain");

  temporaryDirectories.push(fixtureRoot);
  mkdirSync(domainDirectory, { recursive: true });
  writeFileSync(path.join(domainDirectory, "left.ts"), 'import "./right";\n');
  writeFileSync(path.join(domainDirectory, "right.ts"), 'import "./left";\n');

  const result = runBoundaryCheck(fixtureRoot);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("[product-import-cycle]");
  expect(result.stderr).toContain("src/domain/left.ts");
  expect(result.stderr).toContain("src/domain/right.ts");
}, 15_000);

test("checks test cycles separately without applying production layer rules", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "pianola-boundaries-"));
  const domainTestsDirectory = path.join(
    fixtureRoot,
    "src",
    "domain",
    "__tests__",
  );
  const uiDirectory = path.join(fixtureRoot, "src", "ui");

  temporaryDirectories.push(fixtureRoot);
  mkdirSync(domainTestsDirectory, { recursive: true });
  mkdirSync(uiDirectory, { recursive: true });
  writeFileSync(
    path.join(domainTestsDirectory, "left.test.ts"),
    'import "./right.test";\nimport "../../ui/component";\n',
  );
  writeFileSync(
    path.join(domainTestsDirectory, "right.test.ts"),
    'import "./left.test";\n',
  );
  writeFileSync(path.join(uiDirectory, "component.ts"), "export {};\n");

  const result = runBoundaryCheck(fixtureRoot);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("[test-import-cycle]");
  expect(result.stderr).not.toContain("[core-isolation]");
}, 15_000);

function runBoundaryCheck(fixtureRoot: string) {
  return spawnSync(
    process.execPath,
    [
      path.resolve("scripts/check-import-boundaries.mjs"),
      "--root",
      fixtureRoot,
    ],
    {
      encoding: "utf8",
    },
  );
}
