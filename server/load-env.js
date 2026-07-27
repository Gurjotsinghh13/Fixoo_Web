const { loadEnvConfig } = require("@next/env");

let loaded = false;

function loadRuntimeEnv() {
  if (loaded) return;
  loadEnvConfig(process.cwd());
  loaded = true;
}

module.exports = { loadRuntimeEnv };
