import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const apiRoot = path.join(repositoryRoot, "src", "app", "api");
const openApiPath = path.join(repositoryRoot, "docs", "openapi.yaml");
const inventoryPath = path.join(repositoryRoot, "docs", "architecture", "api-route-inventory.json");
const driftBaselinePath = path.join(repositoryRoot, "docs", "quality", "openapi-drift-baseline.json");

async function findRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findRouteFiles(fullPath);
      return entry.isFile() && entry.name === "route.ts" ? [fullPath] : [];
    }),
  );

  return nested.flat().sort((left, right) => left.localeCompare(right));
}

function routePathFromFile(filePath) {
  const relative = path.relative(path.join(repositoryRoot, "src", "app"), filePath);
  const segments = relative.split(path.sep).slice(0, -1).map((segment) => {
    const catchAll = segment.match(/^\[\[?\.\.\.([^\]]+)\]?\]$/);
    if (catchAll) return `{${catchAll[1]}}`;
    const dynamic = segment.match(/^\[([^\]]+)\]$/);
    return dynamic ? `{${dynamic[1]}}` : segment;
  });

  return `/${segments.join("/")}`;
}

function exportedMethods(source) {
  const methods = new Set();
  const exportPattern = /export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  for (const match of source.matchAll(exportPattern)) methods.add(match[1]);
  return HTTP_METHODS.filter((method) => methods.has(method));
}

function parseOpenApi(source) {
  const paths = new Map();
  let currentPath;

  for (const line of source.split(/\r?\n/)) {
    const pathMatch = line.match(/^  (\/api\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      paths.set(currentPath, new Set());
      continue;
    }

    const methodMatch = line.match(/^    (get|post|put|patch|delete|head|options):\s*$/);
    if (currentPath && methodMatch) paths.get(currentPath).add(methodMatch[1].toUpperCase());
  }

  return paths;
}

export async function buildInventory() {
  const [routeFiles, openApiSource] = await Promise.all([
    findRouteFiles(apiRoot),
    readFile(openApiPath, "utf8"),
  ]);
  const documented = parseOpenApi(openApiSource);
  const implementedPaths = new Set();
  const routes = [];

  for (const routeFile of routeFiles) {
    const route = routePathFromFile(routeFile);
    const methods = exportedMethods(await readFile(routeFile, "utf8"));
    const documentedMethods = HTTP_METHODS.filter((method) => documented.get(route)?.has(method));
    implementedPaths.add(route);
    routes.push({
      route,
      file: path.relative(repositoryRoot, routeFile).split(path.sep).join("/"),
      methods,
      documentedMethods,
      missingInOpenApi: methods.filter((method) => !documentedMethods.includes(method)),
      staleOpenApiMethods: documentedMethods.filter((method) => !methods.includes(method)),
    });
  }

  const undocumentedRoutes = routes
    .filter((entry) => entry.documentedMethods.length === 0)
    .map((entry) => entry.route);
  const undocumentedOperations = routes.flatMap((entry) =>
    entry.missingInOpenApi.map((method) => `${method} ${entry.route}`),
  );
  const stalePaths = [...documented.keys()].filter((route) => !implementedPaths.has(route)).sort();
  const staleOperations = routes.flatMap((entry) =>
    entry.staleOpenApiMethods.map((method) => `${method} ${entry.route}`),
  );

  return {
    schemaVersion: 1,
    source: "src/app/api/**/route.ts",
    contract: "docs/openapi.yaml",
    summary: {
      routeFiles: routes.length,
      implementedOperations: routes.reduce((total, entry) => total + entry.methods.length, 0),
      documentedOperations: routes.reduce((total, entry) => total + entry.documentedMethods.length, 0),
      undocumentedRoutes: undocumentedRoutes.length,
      undocumentedOperations: undocumentedOperations.length,
      stalePaths: stalePaths.length,
      staleOperations: staleOperations.length,
    },
    drift: { undocumentedRoutes, undocumentedOperations, stalePaths, staleOperations },
    routes,
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main() {
  const generated = stableJson(await buildInventory());
  if (process.argv.includes("--write")) {
    await writeFile(inventoryPath, generated, "utf8");
    console.log(`Updated ${path.relative(repositoryRoot, inventoryPath)}`);
    return;
  }

  const committed = await readFile(inventoryPath, "utf8").catch(() => "");
  if (committed !== generated) {
    console.error("API inventory is stale. Run: node scripts/api-route-inventory.mjs --write");
    process.exitCode = 1;
    return;
  }

  const inventory = JSON.parse(generated);
  const { summary } = inventory;
  console.log(
    `API inventory current: ${summary.routeFiles} routes, ${summary.implementedOperations} operations, ` +
      `${summary.undocumentedOperations} OpenAPI gaps, ${summary.staleOperations} stale operations.`,
  );

  const driftBaseline = JSON.parse(await readFile(driftBaselinePath, "utf8"));
  const newDrift = [
    ...inventory.drift.undocumentedOperations
      .filter((operation) => !driftBaseline.allowedUndocumentedOperations.includes(operation))
      .map((operation) => `undocumented: ${operation}`),
    ...inventory.drift.staleOperations
      .filter((operation) => !driftBaseline.allowedStaleOperations.includes(operation))
      .map((operation) => `stale: ${operation}`),
    ...inventory.drift.stalePaths
      .filter((route) => !driftBaseline.allowedStalePaths.includes(route))
      .map((route) => `stale path: ${route}`),
  ];
  if (newDrift.length > 0) {
    console.error("New OpenAPI drift is not allowed:\n- " + newDrift.join("\n- "));
    process.exitCode = 1;
    return;
  }

  if (process.argv.includes("--strict-openapi") &&
      (summary.undocumentedOperations > 0 || summary.staleOperations > 0 || summary.stalePaths > 0)) {
    console.error("OpenAPI drift is non-zero; strict contract gate failed.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
