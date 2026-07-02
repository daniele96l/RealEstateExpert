#!/usr/bin/env node
import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PORT = process.env.PORT ?? "3000";
const args = process.argv.slice(2);
const force = args.includes("--force");
const devArgs = args.filter((a) => a !== "--force");

function portPid(port) {
  try {
    return execSync(`lsof -ti:${port}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
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

  // Cartella server non vuota ma senza manifest = compile interrotta / cache corrotta
  if (entries.length > 0) {
    const hasManifest =
      existsSync(join(serverDir, "app-paths-manifest.json")) ||
      existsSync(join(serverDir, "pages-manifest.json"));
    if (!hasManifest) return true;
  }

  return false;
}

const pid = portPid(PORT);
if (pid && !force) {
  console.error(`\nPorta ${PORT} già in uso (PID ${pid}).`);
  console.error("Un secondo dev server causa cache .next corrotta.");
  console.error(`\n  kill ${pid}          # ferma il processo esistente`);
  console.error("  npm run dev:clean    # pulisce .next e riavvia\n");
  process.exit(1);
}

if (isNextCacheBroken()) {
  console.warn("Cache .next inconsistente — pulizia automatica...");
  cleanNext();
}

const child = spawn("npx", ["next", "dev", "-p", PORT, ...devArgs], {
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
