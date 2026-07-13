#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const PORT = process.env.PORT ?? "3000";
const PID_FILE = join(".next", "dev-server.pid");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function portPids(port) {
  try {
    return execSync(`lsof -ti:${port}`, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function readPidFile() {
  try {
    if (!existsSync(PID_FILE)) return null;
    const pid = Number(readFileSync(PID_FILE, "utf8").trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function killPids(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(Number(pid), signal);
    } catch {
      /* ignore */
    }
  }
}

const targets = [...new Set([...portPids(PORT), ...(readPidFile() ? [String(readPidFile())] : [])])];

if (!targets.length) {
  console.log(`No dev server on port ${PORT}.`);
  process.exit(0);
}

killPids(targets, "SIGTERM");
await sleep(1200);

const remaining = portPids(PORT);
if (remaining.length) {
  killPids(remaining, "SIGKILL");
  await sleep(400);
}

try {
  unlinkSync(PID_FILE);
} catch {
  /* ignore */
}

console.log(`Stopped dev server on port ${PORT}.`);
