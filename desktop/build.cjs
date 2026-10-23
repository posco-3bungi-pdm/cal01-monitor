const { normalizeServerUrl, LOCAL_SERVER } = require("./server-url.cjs");

function buildOptions(args) {
  const options = args[0] === "--" ? args.slice(1) : args;
  if (options.length && (options.length !== 2 || options[0] !== "--server")) {
    throw new Error("사용법: pnpm build [--server https://팀서버주소]");
  }
  const server = normalizeServerUrl(options.length ? options[1] : LOCAL_SERVER);
  return {
    projectDir: __dirname,
    win: ["portable"],
    x64: true,
    publish: "never",
    config: { extraMetadata: { cal01DefaultServer: server } },
  };
}

if (require.main === module) {
  Promise.resolve().then(() => require("electron-builder").build(buildOptions(process.argv.slice(2))))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { buildOptions };
