import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const roots = ["src/app", "src/components"];
const findings = [];

async function collectTsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [absolute] : [];
  }));
  return nested.flat();
}

function tagName(node) {
  return node.tagName.getText();
}

function attribute(node, name) {
  return node.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function hasSpread(node) {
  return node.attributes.properties.some(ts.isJsxSpreadAttribute);
}

function stringAttributeValue(node, name) {
  const item = attribute(node, name);
  if (!item?.initializer) return null;
  if (ts.isStringLiteral(item.initializer)) return item.initializer.text;
  if (
    ts.isJsxExpression(item.initializer)
    && item.initializer.expression
    && ts.isStringLiteralLike(item.initializer.expression)
  ) return item.initializer.expression.text;
  return null;
}

function hasFormAncestor(node) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current) && tagName(current.openingElement) === "form") return true;
    current = current.parent;
  }
  return false;
}

function isAlwaysDisabled(node) {
  const disabled = attribute(node, "disabled");
  if (!disabled) return false;
  if (!disabled.initializer) return true;
  return ts.isJsxExpression(disabled.initializer)
    && disabled.initializer.expression?.kind === ts.SyntaxKind.TrueKeyword;
}

function report(sourceFile, node, message) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  findings.push(`${sourceFile.fileName}:${line + 1}:${character + 1} ${message}`);
}

function inspectOpeningElement(sourceFile, node) {
  const name = tagName(node);

  if (name === "button") {
    const type = stringAttributeValue(node, "type");
    const interactive = Boolean(attribute(node, "onClick") || attribute(node, "formAction"));
    const submitsForm = type === "submit" || type === "reset" || (!type && hasFormAncestor(node));
    const targetsExternalForm = Boolean(attribute(node, "form"));
    if (!interactive && !submitsForm && !targetsExternalForm && !isAlwaysDisabled(node) && !hasSpread(node)) {
      report(sourceFile, node, "button saknar onClick, formAction eller formulärkoppling");
    }
  }

  if (name === "a" || name === "Link") {
    const href = stringAttributeValue(node, "href")?.trim().toLowerCase();
    if (href === "" || href === "#" || href?.startsWith("javascript:")) {
      report(sourceFile, node, `ogiltig eller tom navigationslänk: ${JSON.stringify(href)}`);
    }
  }
}

function inspectSource(fileName, source) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      inspectOpeningElement(sourceFile, node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

const files = (await Promise.all(roots.map(collectTsxFiles))).flat().sort();
for (const fileName of files) {
  inspectSource(fileName, await readFile(fileName, "utf8"));
}

if (findings.length > 0) {
  console.error(`UI interaction audit found ${findings.length} issue(s):`);
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`UI interaction audit passed for ${files.length} TSX files`);
