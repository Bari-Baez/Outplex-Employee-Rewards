import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import { loadTypeScriptModule } from "../helpers/load-typescript-module.mjs";

const capabilities = await loadTypeScriptModule("src/platform/auth/capabilities.ts", {
  removeRuntimeImports: ["@/lib/supabase/server"],
});
const redirects = await loadTypeScriptModule("src/platform/http/redirects.ts");
const fileValidation = await loadTypeScriptModule("src/platform/http/file-validation.ts");
const requestBody = await loadTypeScriptModule("src/platform/http/request-body.ts");
const safeFetch = await loadTypeScriptModule("src/platform/http/safe-fetch.ts");

test("authorization capability matrix denies unapproved role/capability combinations", () => {
  const roles = ["employee", "staff", "moderator", "moderator_a1", "moderator_b1", "admin"];
  const expected = {
    "assets:upload:self-service": new Set(roles),
    "assets:upload:managed": new Set(["moderator", "moderator_a1", "moderator_b1", "admin"]),
    "ocr:metrics": new Set(roles),
    "ocr:ot": new Set(["moderator", "moderator_a1", "moderator_b1", "admin"]),
    "slack:notify": new Set(["moderator", "moderator_a1", "moderator_b1", "admin"]),
  };

  let assertions = 0;
  for (const [capability, allowed] of Object.entries(expected)) {
    for (const role of roles) {
      assert.equal(capabilities.hasCapability(role, capability), allowed.has(role), `${role} / ${capability}`);
      assertions += 1;
    }
  }
  assert.equal(assertions, 30);
});

test("CSRF origin helper rejects cross-site, malformed, and mismatched origins", () => {
  const expectedOrigin = new URL("https://outplex.example");
  assert.equal(redirects.isSameOriginRequest(new Request("https://outplex.example/api/test"), expectedOrigin), true);
  assert.equal(redirects.isSameOriginRequest(new Request("https://outplex.example/api/test", {
    headers: { Origin: "https://outplex.example" },
  }), expectedOrigin), true);
  assert.equal(redirects.isSameOriginRequest(new Request("https://outplex.example/api/test", {
    headers: { Origin: "https://evil.example" },
  }), expectedOrigin), false);
  assert.equal(redirects.isSameOriginRequest(new Request("https://outplex.example/api/test", {
    headers: { Origin: "not a url" },
  }), expectedOrigin), false);
  assert.equal(redirects.isSameOriginRequest(new Request("https://outplex.example/api/test", {
    headers: { "Sec-Fetch-Site": "cross-site" },
  }), expectedOrigin), false);
});

test("redirect helper rejects protocol-relative, encoded separator, backslash, and control payloads", () => {
  for (const payload of [
    "https://evil.example",
    "//evil.example/path",
    "/%2f%2fevil.example",
    "/\\evil",
    "/safe\u0000evil",
    "javascript:alert(1)",
  ]) {
    assert.equal(redirects.safeRelativePath(payload, "/safe"), "/safe", payload);
  }
  assert.equal(redirects.safeRelativePath("/dashboard?tab=ot#today", "/safe"), "/dashboard?tab=ot#today");
});

test("SSRF-safe fetch rejects local, private, credentialed, custom-port, and non-HTTP targets before network I/O", async () => {
  const cases = [
    ["http://localhost/file", "blocked"],
    ["http://127.0.0.1/file", "blocked"],
    ["http://10.10.10.10/file", "blocked"],
    ["http://169.254.169.254/latest/meta-data", "blocked"],
    ["http://[::1]/file", "blocked"],
    ["https://user:password@example.com/file", "blocked"],
    ["https://8.8.8.8:444/file", "blocked"],
    ["file:///etc/passwd", "invalid"],
  ];

  for (const [target, failure] of cases) {
    await assert.rejects(
      safeFetch.fetchSafeBytes(new URL(target), {
        maxBytes: 1024,
        maxRedirects: 0,
        timeoutMs: 250,
        allowedHosts: new Set(['localhost', '127.0.0.1', '10.10.10.10', '169.254.169.254', '::1', 'example.com', '8.8.8.8']),
      }),
      (error) => error instanceof safeFetch.SafeFetchError && error.failure === failure,
      target,
    );
  }

  await assert.rejects(
    safeFetch.fetchSafeBytes(new URL('https://example.net/file'), {
      maxBytes: 1024,
      maxRedirects: 0,
      timeoutMs: 250,
      allowedHosts: new Set(['example.com']),
    }),
    (error) => error instanceof safeFetch.SafeFetchError && error.failure === 'blocked',
  );
});

test("upload validation rejects extension, MIME, signature, empty, and oversized mismatches", async () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const valid = await fileValidation.validateFile(
    new File([png], "safe.png", { type: "image/png" }),
    { maxBytes: 1024, allowedKinds: ["png"] },
  );
  assert.equal(valid?.kind, "png");

  const rejected = await Promise.all([
    fileValidation.validateFile(new File([png], "safe.jpg", { type: "image/png" }), { maxBytes: 1024, allowedKinds: ["png"] }),
    fileValidation.validateFile(new File([png], "safe.png", { type: "image/jpeg" }), { maxBytes: 1024, allowedKinds: ["png"] }),
    fileValidation.validateFile(new File([Uint8Array.from([1, 2, 3])], "safe.png", { type: "image/png" }), { maxBytes: 1024, allowedKinds: ["png"] }),
    fileValidation.validateFile(new File([], "safe.png", { type: "image/png" }), { maxBytes: 1024, allowedKinds: ["png"] }),
    fileValidation.validateFile(new File([png], "safe.png", { type: "image/png" }), { maxBytes: 4, allowedKinds: ["png"] }),
  ]);
  assert.deepEqual(rejected, [null, null, null, null, null]);
});

test("request body readers reject invalid content types, shapes, lengths, and streaming overflow", async () => {
  await assert.rejects(
    requestBody.readJsonObject(new Request("https://outplex.example/api", { method: "POST", body: "{}" }), 32),
    (error) => error instanceof requestBody.RequestBodyError && error.status === 415,
  );
  await assert.rejects(
    requestBody.readJsonObject(new Request("https://outplex.example/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "[]",
    }), 32),
    (error) => error instanceof requestBody.RequestBodyError && error.status === 400,
  );
  await assert.rejects(
    requestBody.readBodyBytes(new Request("https://outplex.example/api", {
      method: "POST",
      headers: { "Content-Length": "100" },
      body: "oversized",
    }), 8),
    (error) => error instanceof requestBody.RequestBodyError && error.status === 413,
  );
  await assert.rejects(
    requestBody.readBodyBytes(new Request("https://outplex.example/api", {
      method: "POST",
      body: "stream-overflow",
    }), 4),
    (error) => error instanceof requestBody.RequestBodyError && error.status === 413,
  );
});
