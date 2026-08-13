import {
  access,
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const workspaceRoot = path.resolve(readRootArgument(process.argv.slice(2)));
const markdownFiles = await collectMarkdownFiles(workspaceRoot);
const violations = [];

for (const markdownFile of markdownFiles) {
  const markdown = await readFile(markdownFile, "utf8");

  for (const link of collectLocalLinks(markdown)) {
    const targetPath = path.resolve(path.dirname(markdownFile), link.target);

    if (!await pathExists(targetPath)) {
      violations.push(
        `${relative(markdownFile)}:${lineAt(markdown, link.index)} links to missing ${link.target}`,
      );
    }
  }
}

for (const markdownFile of await collectAuthoritativeDocs(workspaceRoot)) {
  const markdown = await readFile(markdownFile, "utf8");

  for (const codePath of collectDocumentedCodePaths(markdown)) {
    const targetPath = path.resolve(workspaceRoot, codePath.target);

    if (!await pathExists(targetPath)) {
      violations.push(
        `${relative(markdownFile)}:${lineAt(markdown, codePath.index)} documents missing ${codePath.target}`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error(`Documentation check failed with ${violations.length} violation(s):`);

  for (const violation of violations) {
    console.error(`- ${violation}`);
  }

  process.exitCode = 1;
} else {
  console.log(
    `Documentation check passed (${markdownFiles.length} Markdown files, local links and code paths).`,
  );
}

function collectLocalLinks(markdown) {
  const links = [];
  const pattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  let match;

  while ((match = pattern.exec(markdown)) !== null) {
    let target = match[1]?.trim() ?? "";

    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    } else {
      target = target.split(/\s+["']/)[0] ?? target;
    }

    target = decodeURIComponent(target.split("#")[0] ?? "");

    if (
      target.length > 0
      && !target.startsWith("#")
      && !/^[a-z][a-z\d+.-]*:/i.test(target)
    ) {
      links.push({ target, index: match.index });
    }
  }

  return links;
}

function collectDocumentedCodePaths(markdown) {
  const paths = [];
  const pattern = /`([^`\r\n]+)`/g;
  let match;

  while ((match = pattern.exec(markdown)) !== null) {
    const target = (match[1] ?? "").replaceAll("\\", "/").replace(/\/$/, "");

    if (
      /^(src|tests|scripts|docs|\.github)\/[\w./@-]+$/.test(target)
      || /^(README\.md|package\.json|tsconfig(?:\.[\w-]+)?\.json|vite\.config\.ts|vitest\.config\.ts)$/.test(target)
    ) {
      paths.push({ target, index: match.index });
    }
  }

  return paths;
}

async function collectAuthoritativeDocs(root) {
  const candidates = [
    path.join(root, "README.md"),
    path.join(root, "docs", "README.md"),
    path.join(root, "docs", "architecture.md"),
    path.join(root, "docs", "code-map.md"),
    path.join(root, "docs", "state-ownership.md"),
    ...await collectMarkdownFiles(path.join(root, "docs", "guides")),
    ...await collectMarkdownFiles(path.join(root, "src")),
  ];

  const existingCandidates = [];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      existingCandidates.push(candidate);
    }
  }

  return existingCandidates;
}

async function collectMarkdownFiles(directory) {
  if (!await pathExists(directory)) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if ([".git", "dist", "node_modules"].includes(entry.name)) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(entryPath));
    } else if (entry.name.endsWith(".md")) {
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

function lineAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function relative(targetPath) {
  return path.relative(workspaceRoot, targetPath).replaceAll(path.sep, "/");
}

function readRootArgument(argumentsList) {
  const index = argumentsList.indexOf("--root");
  return index < 0 ? process.cwd() : argumentsList[index + 1] ?? process.cwd();
}
