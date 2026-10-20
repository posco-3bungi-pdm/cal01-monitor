const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeServerUrl } = require("./server-url.cjs");

test("local and shared HTTPS server origins are supported", () => {
  assert.equal(normalizeServerUrl(" http://127.0.0.1:9017/ "), "http://127.0.0.1:9017");
  assert.equal(normalizeServerUrl("https://team.example.org/"), "https://team.example.org");
});
test("credentials, insecure remote URLs and injected destinations are rejected", () => {
  for (const value of [
    "file:///C:/Windows", "javascript:alert(1)", "http://team.example.org",
    "http://127.0.0.1.evil.example", "https://user:password@team.example",
    "https://team.example/api", "https://team.example/?token=private",
    "https://team.example/#somewhere", null,
  ]) assert.throws(() => normalizeServerUrl(value));
});
