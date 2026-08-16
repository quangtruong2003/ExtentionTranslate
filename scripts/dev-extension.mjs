import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const viteBin = join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const children = [
  spawn(process.execPath, [viteBin, "build", "--watch", "--mode", "development"], {
    cwd: projectRoot,
    stdio: "inherit",
  }),
  spawn(
    process.execPath,
    [viteBin, "build", "--watch", "--mode", "development", "--config", "vite.content.config.ts"],
    {
      cwd: projectRoot,
      stdio: "inherit",
    },
  ),
];

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exitCode = code;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const child of children) {
  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) shutdown(code ?? 1);
  });
}
