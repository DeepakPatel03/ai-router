#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🚦 AI Router CLI — Official Command-Line Interface
 * ═══════════════════════════════════════════════════════════════════════════════
 * Allows users to run `ai-router`, `ai-router setup`, `ai-router dashboard`, etc.
 */

const { spawn, exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const rootDir = path.resolve(__dirname, "..");
const envFile = path.join(rootDir, ".env");
const args = process.argv.slice(2);
const command = args[0] ? args[0].toLowerCase() : "start";

console.log("\x1b[36m%s\x1b[0m", `\n🚦 AI Router CLI v2.0\n`);

switch (command) {
  case "setup":
  case "init": {
    // Run setup wizard
    const setupScript = path.join(rootDir, "setup.js");
    const child = spawn(process.execPath, [setupScript], {
      stdio: "inherit",
      cwd: rootDir,
    });
    child.on("exit", (code) => process.exit(code || 0));
    break;
  }

  case "dashboard":
  case "open":
  case "ui": {
    // Read PORT
    let port = 3000;
    if (fs.existsSync(envFile)) {
      const match = fs.readFileSync(envFile, "utf8").match(/PORT=(\d+)/);
      if (match) port = match[1];
    }
    const url = `http://localhost:${port}`;
    console.log(`🌐 Opening AI Router Dashboard: ${url}...`);
    
    // Open in browser based on OS
    const startCmd = process.platform === "win32" ? `start ${url}` : process.platform === "darwin" ? `open ${url}` : `xdg-open ${url}`;
    exec(startCmd);
    break;
  }

  case "status":
  case "health": {
    let port = 3000;
    if (fs.existsSync(envFile)) {
      const match = fs.readFileSync(envFile, "utf8").match(/PORT=(\d+)/);
      if (match) port = match[1];
    }
    const req = http.get(`http://localhost:${port}/health`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const j = JSON.parse(data);
          console.log(`\x1b[32m✔ AI Router is ONLINE\x1b[0m`);
          console.log(`  Port:      ${port}`);
          console.log(`  Mode:      ${j.mode}`);
          console.log(`  Providers: ${j.providers.length} total (${j.providers.filter(p => p.configured).length} active)`);
        } catch (e) {
          console.log(`\x1b[31m✖ Could not parse health response\x1b[0m`);
        }
      });
    });
    req.on("error", () => {
      console.log(`\x1b[31m✖ AI Router is OFFLINE on port ${port}\x1b[0m`);
      console.log(`  Run: ai-router start  to launch it.`);
    });
    break;
  }

  case "start":
  default: {
    // If no .env exists, launch setup wizard first
    if (!fs.existsSync(envFile)) {
      console.log("\x1b[33m%s\x1b[0m", "⚠️  No configuration found. Launching initial setup wizard...\n");
      const setupScript = path.join(rootDir, "setup.js");
      const child = spawn(process.execPath, [setupScript], {
        stdio: "inherit",
        cwd: rootDir,
      });
      child.on("exit", (code) => {
        if (code === 0) {
          launchServer();
        }
      });
    } else {
      launchServer();
    }
    break;
  }
}

function launchServer() {
  const indexScript = path.join(rootDir, "index.js");
  const child = spawn(process.execPath, [indexScript], {
    stdio: "inherit",
    cwd: rootDir,
  });
  child.on("exit", (code) => process.exit(code || 0));
}
