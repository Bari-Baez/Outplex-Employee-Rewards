import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function loadTypeScriptModule(relativePath, options = {}) {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  let source = await readFile(absolutePath, "utf8");
  source = source.replace(/^import\s+["']server-only["'];?\s*$/m, "");

  for (const specifier of options.removeRuntimeImports ?? []) {
    const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    source = source.replace(
      new RegExp(`^import\\s+[^;]+?\\s+from\\s+["']${escaped}["'];?\\s*$`, "m"),
      "",
    );
  }

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: false,
    },
    fileName: absolutePath,
    reportDiagnostics: true,
  });
  const errors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    throw new Error(`Unable to transpile ${relativePath}: ${errors.map((item) => item.messageText).join("; ")}`);
  }

  const encoded = Buffer.from(transpiled.outputText).toString("base64");
  return import(`data:text/javascript;base64,${encoded}#${encodeURIComponent(pathToFileURL(absolutePath).href)}`);
}
