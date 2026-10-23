const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOptions } = require("./build.cjs");
const { resolveInitialServer, LOCAL_SERVER } = require("./server-url.cjs");

test("the build default applies only when no valid saved server exists", () => {
  const team = "https://team.example.org";
  assert.equal(resolveInitialServer("https://saved.example.org/", team), "https://saved.example.org");
  assert.equal(resolveInitialServer(LOCAL_SERVER, team), LOCAL_SERVER);
  assert.equal(resolveInitialServer(undefined, team), team);
  assert.equal(resolveInitialServer("invalid", team), team);
  assert.equal(resolveInitialServer(undefined, undefined), LOCAL_SERVER);
  assert.equal(resolveInitialServer(null, "http://remote.example.org"), LOCAL_SERVER);
});

test("a build embeds only the normalized origin and preserves the source package metadata", () => {
  const packageBefore = JSON.stringify(require("./package.json"));
  const options = buildOptions(["--server", " https://team.example.org/ "]);
  assert.deepEqual(options.config.extraMetadata, { cal01DefaultServer: "https://team.example.org" });
  assert.equal(options.publish, "never");
  assert.deepEqual(options.win, ["portable"]);
  assert.equal(options.x64, true);
  assert.equal(buildOptions([]).config.extraMetadata.cal01DefaultServer, LOCAL_SERVER);
  assert.equal(buildOptions(["--", "--server", "https://team.example.org"]).config.extraMetadata.cal01DefaultServer,
    "https://team.example.org");
  assert.equal(JSON.stringify(require("./package.json")), packageBefore);
});

test("invalid build arguments, credentials and insecure team URLs fail before packaging", () => {
  for (const args of [
    ["--server"], ["--unknown", "https://team.example.org"],
    ["--server", "https://team.example.org", "extra"],
    ["--server", "https://user:secret@team.example.org"],
    ["--server", "http://team.example.org"],
    ["--server", "https://team.example.org/?token=secret"],
  ]) assert.throws(() => buildOptions(args));
});
