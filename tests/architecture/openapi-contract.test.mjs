import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { buildInventory } from "../../scripts/api-route-inventory.mjs";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

test("OpenAPI is valid YAML and represents every implemented operation exactly once", async () => {
  const contract = yaml.load(await readFile(new URL("../../docs/openapi.yaml", import.meta.url), "utf8"));
  assert.equal(contract.openapi, "3.0.3");
  assert.ok(contract.paths && typeof contract.paths === "object");

  const inventory = await buildInventory();
  assert.equal(inventory.summary.routeFiles, 114);
  assert.equal(inventory.summary.implementedOperations, 149);
  assert.deepEqual(inventory.drift.undocumentedRoutes, []);
  assert.deepEqual(inventory.drift.undocumentedOperations, []);
  assert.deepEqual(inventory.drift.stalePaths, []);
  assert.deepEqual(inventory.drift.staleOperations, []);

  for (const route of inventory.routes) {
    assert.ok(route.methods.length > 0, `${route.file} must export at least one HTTP method`);
    assert.deepEqual(route.documentedMethods, route.methods, route.route);
  }
});
