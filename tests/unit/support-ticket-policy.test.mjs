import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const policySource = await readFile(
  new URL("../../src/modules/support/domain/ticket-policy.ts", import.meta.url),
  "utf8",
);
const transpiledPolicy = ts.transpileModule(policySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "ticket-policy.ts",
}).outputText;
const {
  SUPPORT_TICKET_COOLDOWN_MS,
  buildSupportSubject,
  canManageSupportDepartment,
  supportCooldownHours,
} = await import(`data:text/javascript;base64,${Buffer.from(transpiledPolicy).toString("base64")}`);

test("buildSupportSubject normalizes whitespace and applies the department prefix", () => {
  assert.equal(
    buildSupportSubject("it", "  Printer\n\twill   not connect  "),
    "IT Support: Printer will not connect",
  );
  assert.equal(
    buildSupportSubject("moderator", "Need a schedule review"),
    "Moderator Support: Need a schedule review",
  );
});

test("buildSupportSubject limits the normalized message excerpt to 72 characters", () => {
  const message = "a".repeat(80);
  const subject = buildSupportSubject("it", message);
  assert.equal(subject, `IT Support: ${"a".repeat(72)}`);
});

test("supportCooldownHours enforces a five-hour window with ceiling semantics", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");
  assert.equal(supportCooldownHours(null, now), null);
  assert.equal(supportCooldownHours("not-a-date", now), null);
  assert.equal(supportCooldownHours(now.toISOString(), now), 5);
  assert.equal(
    supportCooldownHours(new Date(now.getTime() - (SUPPORT_TICKET_COOLDOWN_MS - 1)).toISOString(), now),
    1,
  );
  assert.equal(
    supportCooldownHours(new Date(now.getTime() - SUPPORT_TICKET_COOLDOWN_MS).toISOString(), now),
    null,
  );
});

test("canManageSupportDepartment implements least-privilege role boundaries", () => {
  assert.equal(canManageSupportDepartment("admin", "it"), true);
  assert.equal(canManageSupportDepartment("admin", "moderator"), true);
  assert.equal(canManageSupportDepartment("moderator_a1", "moderator"), true);
  assert.equal(canManageSupportDepartment("moderator_b1", "moderator"), true);
  assert.equal(canManageSupportDepartment("moderator_a1", "it"), false);
  assert.equal(canManageSupportDepartment("moderator_b1", "it"), false);
  assert.equal(canManageSupportDepartment("moderator", "moderator"), false);
  assert.equal(canManageSupportDepartment("employee", "moderator"), false);
  assert.equal(canManageSupportDepartment("staff", "it"), false);
});
