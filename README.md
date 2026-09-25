# 🚦 AI Router (v2.0)
### Universal High-Availability LLM Gateway & Smart Failover Middleware

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Express](https://img.shields.io/badge/Express-5.x-lightgrey.svg)](https://expressjs.com/)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-success.svg)]()
[![Author](https://img.shields.io/badge/Author-DeepakPatel03-purple.svg)](https://github.com/DeepakPatel03)

**AI Router** is an asynchronous reverse-proxy and protocol-adapting API gateway for AI developer tools (**Claude Code CLI**, **OpenCode**, **Cursor**, **VS Code Continue**, etc.). 

It aggregates multiple free, cloud, and local AI providers into a single unified local endpoint with **automated failover**, **exponential backoff circuit breaking**, and **real-time Server-Sent Events (SSE) streaming translation**.

---

## 📋 System Requirements (Prerequisites)

Before installing AI Router, make sure your computer has the following tools installed:

| Requirement | Minimum Version | Download Link | Purpose |
|---|---|---|---|
| **Node.js** | `v18.0.0` or higher | [Download Node.js](https://nodejs.org/) | Backend runtime environment to run the router |
| **Git** | Any recent version | [Download Git](https://git-scm.com/) | To clone the repository |
| **Operating System** | Windows 10/11, macOS, or Linux | Built-in | Host OS (1-click `.vbs` and `.bat` scripts provided for Windows) |
| **Internet Access** | Active connection | N/A | To communicate with cloud AI providers |

### 🔍 How to Check if Requirements are Installed:
Open your terminal (PowerShell, Command Prompt, or Terminal) and run:
```bash
node -v
git --version
```
> If `node -v` prints `v18.x.x` (or higher) and Git prints its version, you are 100% ready!

---

## 🎯 Supported AI Tools & Clients

AI Router acts as a drop-in replacement for any AI coding tool. You can use it with:
1. **Claude Code CLI** (Anthropic's official agentic terminal assistant)
2. **OpenCode** (Open-source developer terminal agent)
3. **Cursor IDE** (AI-powered code editor)
4. **VS Code** (with Continue.dev or Cline extension)
5. **cURL / Python / OpenAI SDK** (Any custom HTTP client)

---

## 🚀 Step-by-Step Installation Guide (For Absolute Beginners)

### Step 1: Clone the Repository
Open your terminal and run:
```bash
git clone https://github.com/DeepakPatel03/ai-router.git
cd ai-router
```

### Step 2: Install Project Dependencies
Run this command inside the `ai-router` folder:
```bash
npm install
```
*(This installs Express, Axios, and Dotenv required by the router engine).*

### Step 3: Run the 1-Click Interactive Setup Wizard
```bash
npm run setup
# Or simply double-click setup.bat on Windows
```

The interactive wizard will guide you through:
1. **Google Gemini Free Key** (Unlocks 5 flagship Google models) — [Get free key here](https://aistudio.google.com/)
2. **OpenCode Free Key** (Unlocks 6 coding models) — [Get free key here](https://opencode.ai/)
3. **Nara Router Key** (Optional - 6 fast models) — [Get key here](https://router.bynara.id/)
4. **Port Configuration** (Default: `3000`)

> 💡 **Tip:** You can press **Enter** to skip any key you don't have yet. Even with just **1 free Gemini key**, you get 5 high-speed models activated immediately!
> 
> 🖥️ **Bonus:** The wizard automatically creates a desktop shortcut: **`AI Router Dashboard`** on your Windows Desktop!

### Step 4: Start AI Router
```bash
npm start
# Or double-click START.vbs for silent background execution without CMD windows!
```
Now open your browser and navigate to:  
👉 **`http://localhost:3000`**

You will see the live **AI Router Dashboard** showing all your active providers and health metrics!

---

## 📡 Connecting Your AI Tools (Claude Code, OpenCode, Cursor)

Once AI Router is running at `http://localhost:3000`, configure your favorite tool:

### 1. Claude Code CLI Setup
Open or create your Claude settings file at `~/.claude/settings.json` (on Windows: `C:\Users\<Your-Username>\.claude\settings.json`):
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:3000",
    "ANTHROPIC_API_KEY": "router-handles-this",
    "ANTHROPIC_MODEL": "AI-Router-Pro"
  }
}
```
Now run `claude` in any project terminal. Claude Code will now use AI Router with zero rate-limit interruptions!

### 2. Cursor IDE Setup
1. Open Cursor Settings $\to$ **Models**.
2. Enable **OpenAI API Key**.
3. Set **Base URL** to: `http://localhost:3000/v1`
4. Set **API Key** to: `router-handles-this`
5. Set model name to `auto` or any model ID from the dashboard.

### 3. VS Code (Continue.dev Extension) Setup
Add this to your `~/.continue/config.json`:
```json
{
  "models": [
    {
      "title": "AI Router",
      "provider": "openai",
      "model": "auto",
      "apiBase": "http://localhost:3000/v1",
      "apiKey": "router-handles-this"
    }
  ]
}
```

---

## 🧠 How AI Router Works Under the Hood

```
[Developer Tool] (Claude Code / OpenCode / Cursor)
       │
       │  (1) Sends standard prompt / message
       ▼
[AI Router Gateway] (http://localhost:3000)
       │
       ├──► (2) Session Check: Is a provider pinned? (Maintains session coherence)
       │
       ├──► (3) Protocol Translation: Converts Anthropic Messages schema ⟷ OpenAI format
       │
       ├──► (4) Priority Waterfall: Dispatches to Tier 1 (e.g. Gemini 3.1 Pro)
       │         │
       │         ├── [Success 200 OK] ──► Real-Time SSE Stream back to client
       │         │
       │         └── [Fails / 429 Rate Limit / 5xx Error]
       │                   │
       │                   ├── Automatically triggers Circuit Breaker (15s - 300s cooldown)
       │                   └── Instantly falls back to Tier 2 (OpenCode / Nara / Backup)
       ▼
[Client receives 100% uninterrupted response with zero downtime!]
```

---

## ✨ Standout Features

- **🛡️ Autonomous Failover & Circuit Breaker:** When an API hits HTTP 429 (rate-limit) or server crashes, AI Router automatically shifts to the next best model with exponential backoff cooldown ($15\text{s}$ to $300\text{s}$).
- **🔄 Real-time Protocol & SSE Stream Converter:** Bi-directionally translates between Anthropic Messages API and OpenAI Chat Completions specifications on-the-fly with zero buffer bloat.
- **🎛️ Live Web Dashboard:** Open `http://localhost:3000` to monitor active models, switch providers, view real-time latency and success/fail counts.
- **➕ 1-Click Multi-Model Batch Addition:** In the dashboard, you can add 5+ models from a single provider by typing comma-separated models (e.g. `llama-3.3-70b, deepseek-r1, mixtral-8x7b`).
- **🔑 Dynamic Key Management:** Update API keys directly from the Web Dashboard without opening `.env` or restarting the server.
- **🔒 Pinned Exclusive & Sticky Routing:** Locks onto working models during long coding sessions to prevent context drift and code style degradation.
- **⏱️ 10-Minute Extended Reasoning Timeout:** Allows deep-thinking models (DeepSeek R1, Nemotron Ultra) up to 600 seconds to generate complex codebases.

---

## 🛠️ CLI Commands Cheat Sheet

You can manage AI Router from your terminal using these built-in commands:

```bash
ai-router start       # Start the AI Router gateway
ai-router setup       # Run the interactive setup wizard
ai-router dashboard   # Open the web dashboard in your default browser
ai-router status      # Check health probe and active provider count
```

---

## ❓ Frequently Asked Questions (FAQ) & Troubleshooting

#### Q: Port 3000 is already in use by another program. What should I do?
Run `npm run setup` and specify a different port (e.g. `3005`). Then update your client's base URL to `http://localhost:3005`.

#### Q: Do I need paid API keys to use this?
**No!** AI Router is specifically designed to leverage free-tier quotas from Google Gemini and OpenCode AI. You can run powerful reasoning models completely free of cost.

#### Q: How do I stop AI Router running in the background?
On Windows, double-click **`STOP.vbs`**. It cleanly terminates background router processes on ports 3000 and 3001.

---

## 👨‍💻 Author & Maintainer
- **Deepak Patel** ([@DeepakPatel03](https://github.com/DeepakPatel03))

---

## 📄 License
This project is open-source software licensed under the [MIT License](LICENSE).
