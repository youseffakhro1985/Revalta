import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const canonicalRoot = path.normalize("src/app/(dashboard)/dashboard");
const legacyRoot = path.normalize("src/app/dashboard");
const sourceRoot = path.normalize("src");
const findings = [];

async function collectFiles(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(absolute, predicate);
    return entry.isFile() && predicate(absolute) ? [absolute] : [];
  }));
  return nested.flat();
}

function routeSegmentsFromPage(fileName, root) {
  const relativeDirectory = path.relative(root, path.dirname(fileName));
  const nested = relativeDirectory && relativeDirectory !== "."
    ? relativeDirectory.split(path.sep).filter(Boolean)
    : [];
  return ["dashboard", ...nested.filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))];
}

function displayRoute(segments) {
  return `/${segments.join("/")}`;
}

function normalizeDashboardHref(value) {
  if (typeof value !== "string" || !value.startsWith("/dashboard")) return null;
  const withoutQuery = value.split(/[?#]/, 1)[0] || "/dashboard";
  if (withoutQuery === "/dashboard") return withoutQuery;
  return withoutQuery.replace(/\/+$/, "");
}

function routeMatches(routeSegments, href) {
  const hrefSegments = href.split("/").filter(Boolean);
  let routeIndex = 0;
  let hrefIndex = 0;

  while (routeIndex < routeSegments.length) {
    const routeSegment = routeSegments[routeIndex];
    const optionalCatchAll = /^\[\[\.\.\..+\]\]$/.test(routeSegment);
    const catchAll = /^\[\.\.\..+\]$/.test(routeSegment);
    const dynamic = /^\[[^\]]+\]$/.test(routeSegment);

    if (optionalCatchAll) return true;
    if (catchAll) return hrefIndex < hrefSegments.length;
    if (hrefIndex >= hrefSegments.length) return false;
    if (!dynamic && routeSegment !== hrefSegments[hrefIndex]) return false;

    routeIndex += 1;
    hrefIndex += 1;
  }

  return hrefIndex === hrefSegments.length;
}

function stringLikeValue(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  return null;
}

function propertyName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isStringLiteralLike(node)) return node.text;
  return null;
}

function report(sourceFile, node, message) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  findings.push(`${sourceFile.fileName}:${line + 1}:${character + 1} ${message}`);
}

function validateHref(sourceFile, node, rawHref, canonicalRoutes, legacyRoutes) {
  const href = normalizeDashboardHref(rawHref);
  if (!href) return;
  if (canonicalRoutes.some((route) => routeMatches(route.segments, href))) return;
  const legacy = legacyRoutes.find((route) => routeMatches(route.segments, href));
  if (legacy) {
    report(sourceFile, node, `intern länk använder legacy-alias ${href}; länka till canonical route i stället`);
    return;
  }
  report(sourceFile, node, `dashboardlänk saknar route: ${href}`);
}

function inspectSource(fileName, source, canonicalRoutes, legacyRoutes) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "href" && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) {
        validateHref(sourceFile, node, node.initializer.text, canonicalRoutes, legacyRoutes);
      } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        const value = stringLikeValue(node.initializer.expression);
        if (value) validateHref(sourceFile, node, value, canonicalRoutes, legacyRoutes);
      }
    }

    if (ts.isPropertyAssignment(node) && propertyName(node.name) === "href") {
      const value = stringLikeValue(node.initializer);
      if (value) validateHref(sourceFile, node, value, canonicalRoutes, legacyRoutes);
    }

    if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === "push" || method === "replace") {
        const value = stringLikeValue(node.arguments[0]);
        if (value) validateHref(sourceFile, node, value, canonicalRoutes, legacyRoutes);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

const canonicalPages = (await collectFiles(canonicalRoot, (fileName) => path.basename(fileName) === "page.tsx")).sort();
const legacyPages = (await collectFiles(legacyRoot, (fileName) => path.basename(fileName) === "page.tsx")).sort();
const canonicalRoutes = canonicalPages.map((fileName) => ({ fileName, segments: routeSegmentsFromPage(fileName, canonicalRoot) }));
const legacyRoutes = legacyPages.map((fileName) => ({ fileName, segments: routeSegmentsFromPage(fileName, legacyRoot) }));

for (const legacy of legacyRoutes) {
  const source = await readFile(legacy.fileName, "utf8");
  if (!/\bredirect\s*\(/.test(source)) {
    findings.push(`${legacy.fileName} implementerar ${displayRoute(legacy.segments)} i legacy-trädet utan redirect`);
  }
}

const sourceFiles = (await collectFiles(
  sourceRoot,
  (fileName) => /\.tsx?$/.test(fileName) && !/\.(test|spec)\.tsx?$/.test(fileName),
)).sort();

for (const fileName of sourceFiles) {
  inspectSource(fileName, await readFile(fileName, "utf8"), canonicalRoutes, legacyRoutes);
}

if (findings.length > 0) {
  console.error(`Dashboard integrity audit found ${findings.length} issue(s):`);
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(
  `Dashboard integrity audit passed: ${canonicalRoutes.length} canonical routes, ${legacyRoutes.length} legacy redirects and ${sourceFiles.length} source files checked`,
);
