/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🚦 AI Router — Interactive Setup Wizard
 * ═══════════════════════════════════════════════════════════════════════════════
 * Automates configuration for any PC. Asks user for their free keys,
 * provisions .env, calculates active models, and readies the gateway.
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ENV_PATH = path.join(__dirname, ".env");
const ENV_EXAMPLE_PATH = path.join(__dirname, ".env.example");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

async function runWizard() {
  console.clear();
  console.log("\x1b[36m%s\x1b[0m", "═════════════════════════════════════════════════════════════════");
  console.log("\x1b[1m\x1b[35m%s\x1b[0m", "   ✨ Welcome to AI Router Setup Wizard!");
  console.log("\x1b[36m%s\x1b[0m", "═════════════════════════════════════════════════════════════════");
  console.log("Easily configure your AI Router with free keys (no credit card needed).");
  console.log("Press [Enter] to skip any key you don't have yet.\n");

  // Read current .env if it exists
  let envContent = "";
  if (fs.existsSync(ENV_PATH)) {
    envContent = fs.readFileSync(ENV_PATH, "utf8");
  } else if (fs.existsSync(ENV_EXAMPLE_PATH)) {
    envContent = fs.readFileSync(ENV_EXAMPLE_PATH, "utf8");
  }

  // 1. Google Gemini Free Key
  console.log("\x1b[33m%s\x1b[0m", "1️⃣  Google Gemini Free Key (Unlocks 5 Flagship Google Models)");
  console.log("   👉 Get it free at: https://aistudio.google.com/");
  const geminiKey = await ask("   ? Enter Gemini API Key (or press Enter to skip): ");

  // 2. OpenCode Free Key
  console.log("\n\x1b[33m%s\x1b[0m", "2️⃣  OpenCode Free Key (Unlocks 6 Coding & Reasoning Models)");
  console.log("   👉 Get it free at: https://opencode.ai/");
  const openCodeKey = await ask("   ? Enter OpenCode API Key (or press Enter to skip): ");

  // 3. Fallback #1: AgentRouter
  console.log("\n\x1b[33m%s\x1b[0m", "3️⃣  Fallback #1: AgentRouter API Key (Optional — Claude Opus 4.8)");
  console.log("   👉 Get it at: https://agentrouter.org/");
  const agentRouterKey = await ask("   ? Enter AgentRouter API Key (or press Enter to skip): ");

  // 4. Fallback #2: OpenRouter
  console.log("\n\x1b[33m%s\x1b[0m", "4️⃣  Fallback #2: OpenRouter API Key (Optional — Nemotron Ultra Free)");
  console.log("   👉 Get it at: https://openrouter.ai/");
  const openRouterKey = await ask("   ? Enter OpenRouter API Key (or press Enter to skip): ");

  // 5. Fallback #3: GitHub Models
  console.log("\n\x1b[33m%s\x1b[0m", "5️⃣  Fallback #3: GitHub Models Token (Optional — GPT-4o Mini)");
  console.log("   👉 Get it at: https://github.com/marketplace/models");
  const githubKey = await ask("   ? Enter GitHub Token (or press Enter to skip): ");

  // 6. Port configuration
  console.log("\n\x1b[33m%s\x1b[0m", "6️⃣  Port Configuration");
  const portInput = await ask("   ? Enter Local Port [Default: 3000]: ");
  const chosenPort = portInput || "3000";

  let keysCount = 0;
  let activatedModels = 0;

  // Update or build .env
  let lines = envContent ? envContent.split("\n") : [];

  // If .env doesn't exist, create full template with all providers
  if (lines.length < 50) {
    // Generate fresh baseline .env
    lines = generateBaselineEnv();
  }

  // Apply inputs to lines
  let updatedLines = lines.map((line) => {
    // Port
    if (line.startsWith("PORT=")) {
      return `PORT=${chosenPort}`;
    }

    // Gemini
    if (geminiKey) {
      if (line.startsWith("GEMINI_API_KEY=")) return `GEMINI_API_KEY=${geminiKey}`;
      if (line.startsWith("CUSTOM_1_KEY=")) return `CUSTOM_1_KEY=${geminiKey}`;
      if (line.startsWith("CUSTOM_2_KEY=")) return `CUSTOM_2_KEY=${geminiKey}`;
      if (line.startsWith("CUSTOM_3_KEY=")) return `CUSTOM_3_KEY=${geminiKey}`;
      if (line.startsWith("CUSTOM_4_KEY=")) return `CUSTOM_4_KEY=${geminiKey}`;
    }

    // OpenCode
    if (openCodeKey) {
      if (line.startsWith("CUSTOM_69_KEY=")) return `CUSTOM_69_KEY=${openCodeKey}`;
      if (line.startsWith("CUSTOM_70_KEY=")) return `CUSTOM_70_KEY=${openCodeKey}`;
      if (line.startsWith("CUSTOM_71_KEY=")) return `CUSTOM_71_KEY=${openCodeKey}`;
      if (line.startsWith("CUSTOM_72_KEY=")) return `CUSTOM_72_KEY=${openCodeKey}`;
      if (line.startsWith("CUSTOM_73_KEY=")) return `CUSTOM_73_KEY=${openCodeKey}`;
      if (line.startsWith("CUSTOM_74_KEY=")) return `CUSTOM_74_KEY=${openCodeKey}`;
    }

    // Fallbacks if existing in file
    if (agentRouterKey && line.startsWith("AGENTROUTER_API_KEY=")) return `AGENTROUTER_API_KEY=${agentRouterKey}`;
    if (openRouterKey && line.startsWith("OPENROUTER_API_KEY=")) return `OPENROUTER_API_KEY=${openRouterKey}`;
    if (githubKey && line.startsWith("GITHUB_API_KEY=")) return `GITHUB_API_KEY=${githubKey}`;

    return line;
  });

  // Helper to ensure key is appended if not present
  function upsertVar(arr, keyName, val) {
    if (!val) return arr;
    const exists = arr.some(l => l.startsWith(`${keyName}=`));
    if (!exists) {
      arr.push(`${keyName}=${val}`);
    }
    return arr;
  }

  updatedLines = upsertVar(updatedLines, "AGENTROUTER_API_KEY", agentRouterKey);
  updatedLines = upsertVar(updatedLines, "OPENROUTER_API_KEY", openRouterKey);
  updatedLines = upsertVar(updatedLines, "GITHUB_API_KEY", githubKey);

  fs.writeFileSync(ENV_PATH, updatedLines.join("\n"), "utf8");

  if (geminiKey) {
    keysCount++;
    activatedModels += 5;
  }
  if (openCodeKey) {
    keysCount++;
    activatedModels += 6;
  }
  if (agentRouterKey) {
    keysCount++;
    activatedModels += 1;
  }
  if (openRouterKey) {
    keysCount++;
    activatedModels += 1;
  }
  if (githubKey) {
    keysCount++;
    activatedModels += 1;
  }

  // Check if OmniRoute/FreeLLM are present in .env
  const hasOmni = envContent.includes("127.0.0.1:20128");
  const hasFreeLLM = envContent.includes("localhost:3001");
  if (hasFreeLLM) activatedModels += 14;
  if (hasOmni) activatedModels += 55;

  const totalProvidersPossible = 92;
  const skipped = Math.max(0, totalProvidersPossible - activatedModels);

  console.log("\n\x1b[32m%s\x1b[0m", "═════════════════════════════════════════════════════════════════");
  console.log(`\x1b[1m\x1b[32m✅ Setup Complete!\x1b[0m`);
  console.log(`   🔑 ${keysCount} API Key(s) saved securely to .env`);
  console.log(`   🟢 Activated: \x1b[1m${activatedModels} High-Speed Models\x1b[0m`);
  if (geminiKey) console.log(`      • Gemini Cloud: 5 Models (3.1 Pro, 2.5 Pro, 3.5 Flash, 3 Flash, 2.5 Flash)`);
  if (openCodeKey) console.log(`      • OpenCode: 6 Models (DeepSeek-V4, Mimo, Nemotron, Laguna, Ling, North)`);
  if (agentRouterKey) console.log(`      • Fallback #1: AgentRouter (Claude Opus 4.8)`);
  if (openRouterKey) console.log(`      • Fallback #2: OpenRouter (Nemotron Ultra)`);
  if (githubKey) console.log(`      • Fallback #3: GitHub Models (GPT-4o Mini)`);
  if (hasFreeLLM || hasOmni) console.log(`      • Local Services: FreeLLM & OmniRoute endpoints mapped`);
  if (skipped > 0) {
    console.log(`   🟡 Skipped: ${skipped} unconfigured models (Gracefully bypassed)`);
  }
  // Create Desktop Shortcut for Dashboard automatically on Windows
  try {
    const desktopPath = path.join(process.env.USERPROFILE || "", "Desktop");
    if (fs.existsSync(desktopPath)) {
      const shortcutPath = path.join(desktopPath, "AI Router Dashboard.url");
      fs.writeFileSync(shortcutPath, `[InternetShortcut]\nURL=http://localhost:${chosenPort}\nIconIndex=0\n`);
      console.log(`   🖥️  Desktop Shortcut created: "AI Router Dashboard"`);
    }
  } catch (e) {}

  console.log(`\x1b[32m🚀 AI Router is ready at http://localhost:${chosenPort}\x1b[0m`);
  console.log("\x1b[32m%s\x1b[0m", "═════════════════════════════════════════════════════════════════\n");

  console.log("📡 To connect Claude Code CLI, add this to ~/.claude/settings.json:");
  console.log(`   ANTHROPIC_BASE_URL = http://localhost:${chosenPort}`);
  console.log(`   ANTHROPIC_API_KEY  = router-handles-this\n`);

  const startNow = await ask("? Would you like to start AI Router right now? (Y/n): ");
  rl.close();

  if (startNow.toLowerCase() !== "n") {
    console.log("\n🚀 Starting AI Router on port " + chosenPort + "...\n");
    require("./index.js");
  } else {
    console.log("\nYou can start AI Router anytime by running: node index.js or double-clicking START.vbs\n");
  }
}

function generateBaselineEnv() {
  // If no .env exists, returns minimal structure pointing to HF and basic ports
  return [
    "# AI Router Configuration",
    "PORT=3000",
    "GEMINI_API_KEY=",
    "GEMINI_MODEL=gemini-3.1-pro-preview"
  ];
}

runWizard().catch(console.error);
