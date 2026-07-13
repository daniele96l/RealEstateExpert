#!/usr/bin/env node
import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";

const PORT = process.env.PORT ?? "3000";
const HOST = process.env.HOST ?? "127.0.0.1";
const args = process.argv.slice(2);
const force = args.includes("--force");
const devArgs = args.filter((a) => a !== "--force");
const PID_FILE = join(".next", "dev-server.pid");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function portPids(port) {
  try {
    return [
      ...new Set(
        execSync(`lsof -ti:${port}`, { encoding: "utf8" })
          .trim()
          .split("\n")
          .filter(Boolean),
      ),
    ];
  } catch {
    return [];
  }
}

function killPids(pids, signal = "SIGTERM") {
  for (const pid of pids) {
    try {
      process.kill(Number(pid), signal);
    } catch {
      /* already gone */
    }
  }
}

function readPidFile() {
  try {
    if (!existsSync(PID_FILE)) return null;
    const raw = readFileSync(PID_FILE, "utf8").trim();
    const pid = Number(raw);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function writePidFile(pid) {
  writeFileSync(PID_FILE, String(pid), "utf8");
}

function clearPidFile() {
  try {
    unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
}

function healthCheck(port, host = HOST, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(
      { host, port: Number(port), path: "/", timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode != null && res.statusCode < 500);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function stopPortProcesses(port, { reason }) {
  const pids = portPids(port);
  const pidFromFile = readPidFile();
  const targets = [...new Set([...pids, ...(pidFromFile ? [String(pidFromFile)] : [])])];

  if (!targets.length) {
    clearPidFile();
    return;
  }

  console.warn(`${reason} — stopping process(es): ${targets.join(", ")}`);
  killPids(targets, "SIGTERM");
  await sleep(1200);

  const remaining = [
    ...new Set([
      ...portPids(port),
      ...(readPidFile() ? [String(readPidFile())] : []),
    ]),
  ];
  if (remaining.length) {
    killPids(remaining, "SIGKILL");
    await sleep(400);
  }

  clearPidFile();
}

async function waitForHealth(port, attempts = 5, delayMs = 1500) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await healthCheck(port)) return true;
    if (attempt < attempts - 1) await sleep(delayMs);
  }
  return false;
}

async function ensurePortAvailable(port) {
  const pids = portPids(port);
  if (!pids.length) {
    clearPidFile();
    return;
  }

  if (!force) {
    const healthy = await waitForHealth(port);
    if (healthy) {
      console.log(`Dev server already running at http://${HOST}:${port} (PID ${pids.join(", ")})`);
      process.exit(0);
    }
    await stopPortProcesses(port, {
      reason: `Port ${port} is in use but not responding after health checks`,
    });
    return;
  }

  await stopPortProcesses(port, {
    reason: `Force restart on port ${port}`,
  });
}

function cleanNext() {
  rmSync(".next", { recursive: true, force: true });
  console.log("Cache .next rimossa.");
}

function isNextCacheBroken() {
  const nextDir = ".next";
  if (!existsSync(nextDir)) return false;

  const buildIdPath = join(nextDir, "BUILD_ID");
  if (existsSync(buildIdPath)) {
    try {
      if (!readFileSync(buildIdPath, "utf8").trim()) return true;
    } catch {
      return true;
    }
  }

  const serverDir = join(nextDir, "server");
  if (!existsSync(serverDir)) return false;

  let entries;
  try {
    entries = readdirSync(serverDir);
  } catch {
    return true;
  }

  if (entries.length > 0) {
    const hasManifest =
      existsSync(join(serverDir, "app-paths-manifest.json")) ||
      existsSync(join(serverDir, "pages-manifest.json"));
    if (!hasManifest) return true;
  }

  return false;
}

let child = null;
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearPidFile();
  if (child && !child.killed) {
    child.kill(signal);
  }
  setTimeout(() => process.exit(0), 2500).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await ensurePortAvailable(PORT);

if (isNextCacheBroken()) {
  console.warn("Cache .next inconsistente — pulizia automatica...");
  cleanNext();
}

child = spawn("npx", ["next", "dev", "-p", PORT, "-H", HOST, ...devArgs], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

writePidFile(child.pid);

child.on("exit", (code, signal) => {
  clearPidFile();
  if (signal && !shuttingDown) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  clearPidFile();
  console.error(err);
  process.exit(1);
});
