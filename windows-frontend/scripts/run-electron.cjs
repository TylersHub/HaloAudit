const { spawn } = require("child_process");
const path = require("path");

const [, , entryArg] = process.argv;

if (!entryArg) {
  console.error("Missing Electron entry file argument.");
  process.exit(1);
}

const electronBinary = require("electron");
const entry = path.resolve(process.cwd(), entryArg);
const env = { ...process.env };

delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [entry], {
  stdio: "inherit",
  env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("Failed to launch Electron:", error);
  process.exit(1);
});
