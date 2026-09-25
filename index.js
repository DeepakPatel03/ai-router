require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");

const PORT = process.env.PORT || 3000;

// ─── Claude Code mein yahi naam dikhega (Opus 4.8 ki jagah) ──────────────────
const DISPLAY_MODEL = "AI Router";

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 FIXED PROVIDERS — Sirf Gemini direct (best model)
// ═══════════════════════════════════════════════════════════════════════════════
const PROVIDERS = [
  {
    name: "Gemini Direct",
    type: "openai",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    key: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-3.1-pro-preview",
    extraHeaders: {},
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ✨ DYNAMIC PROVIDERS — Sirf .env file se add karo, index.js mat chhoona!
// ═══════════════════════════════════════════════════════════════════════════════
for (let i = 1; i <= 120; i++) {
  const name  = process.env[`CUSTOM_${i}_NAME`];
  const key   = process.env[`CUSTOM_${i}_KEY`];
  const url   = process.env[`CUSTOM_${i}_URL`];
  const model = process.env[`CUSTOM_${i}_MODEL`];
  const type  = process.env[`CUSTOM_${i}_TYPE`] || "openai";

  if (!name && !key) continue;
  if (!name || !key || !url || !model) {
    if (name || key || url || model)
      console.warn(`⚠️  CUSTOM_${i}: incomplete config — name/key/url/model sab chahiye, skip kar raha hoon`);
    continue;
  }

  PROVIDERS.push({ name, type, url, key, model, extraHeaders: {} });
  console.log(`🔌 Dynamic provider loaded: ${name} [${model}]`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️  FALLBACK PROVIDERS — (Sirf jab primary free providers fail ho)
// Exact order: 1. AgentRouter -> 2. OpenRouter -> 3. GitHub Models
// ═══════════════════════════════════════════════════════════════════════════════
if (process.env.AGENTROUTER_API_KEY) {
  PROVIDERS.push({
    name: "AgentRouter (Fallback #1)",
    type: "anthropic",
    url: "https://agentrouter.org/v1/messages",
    key: process.env.AGENTROUTER_API_KEY,
    model: process.env.AGENTROUTER_MODEL || "claude-opus-4-8",
    extraHeaders: { "anthropic-version": "2023-06-01", "User-Agent": "claude-cli/1.0.0 (external, cli)" },
  });
  console.log(`🔌 Fallback #1: AgentRouter [${process.env.AGENTROUTER_MODEL || "claude-opus-4-8"}]`);
}

if (process.env.OPENROUTER_API_KEY) {
  PROVIDERS.push({
    name: "OpenRouter (Fallback #2)",
    type: "openai",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
    extraHeaders: { "HTTP-Referer": "http://localhost", "X-Title": "AI-Router" },
  });
  console.log(`🔌 Fallback #2: OpenRouter [${process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free"}]`);
}

if (process.env.GITHUB_API_KEY) {
  PROVIDERS.push({
    name: "GitHub Models (Fallback #3)",
    type: "openai",
    url: "https://models.github.ai/inference/chat/completions",
    key: process.env.GITHUB_API_KEY,
    model: process.env.GITHUB_MODEL || "gpt-4o-mini",
    extraHeaders: {},
  });
  console.log(`🔌 Fallback #3: GitHub Models [${process.env.GITHUB_MODEL || "gpt-4o-mini"}]`);
}


// ═══════════════════════════════════════════════════════════════════════════════
// ⏳ COOLDOWN SYSTEM — Ek provider fail kare to kuch der ke liye use skip karo
// Agar baar baar fail ho toh cooldown badhta jaata hai (exponential backoff)
// ═══════════════════════════════════════════════════════════════════════════════
const COOLDOWN_BASE_MS = 15 * 1000; // 15 seconds base cooldown (fast failover)
const COOLDOWN_MAX_MS = 5 * 60 * 1000; // max 5 minutes

const cooldowns = {}; // { providerName: { until: timestamp, failures: count } }

function isOnCooldown(name) {
  const c = cooldowns[name];
  if (!c) return false;
  if (Date.now() < c.until) return true;
  return false;
}

function setCooldown(name) {
  const prev = cooldowns[name] || { failures: 0, until: 0 };
  const failures = prev.failures + 1;
  const delay = Math.min(COOLDOWN_BASE_MS * Math.pow(2, failures - 1), COOLDOWN_MAX_MS);
  cooldowns[name] = { failures, until: Date.now() + delay };
  const mins = (delay / 60000).toFixed(1);
  console.log(`⏳ ${name} cooldown: ${mins} min (failure #${failures})`);
}

function clearCooldown(name) {
  delete cooldowns[name];
}

function cooldownRemaining(name) {
  const c = cooldowns[name];
  if (!c || Date.now() >= c.until) return 0;
  return Math.ceil((c.until - Date.now()) / 1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 STATS — Kitni baar kaun sa provider kaam aaya
// ═══════════════════════════════════════════════════════════════════════════════
const stats = {};
PROVIDERS.forEach((p) => {
  stats[p.name] = { success: 0, fail: 0, lastUsed: null };
});

// ═══════════════════════════════════════════════════════════════════════════════
// 🔄 TRANSLATION: Anthropic ↔ OpenAI (with full Tools & Tool Calls support)
// ═══════════════════════════════════════════════════════════════════════════════
function anthropicToOpenAI(body, model) {
  const messages = [];

  // 1. System Prompt translation
  if (body.system) {
    const sys = Array.isArray(body.system)
      ? body.system.map((b) => b.text || "").join("\n")
      : body.system;
    if (sys) messages.push({ role: "system", content: sys });
  }

  // 2. Messages & Tool calls translation
  for (const m of body.messages || []) {
    if (typeof m.content === "string") {
      messages.push({ role: m.role, content: m.content });
      continue;
    }

    if (Array.isArray(m.content)) {
      let textContent = "";
      const toolCalls = [];

      for (const block of m.content) {
        if (block.type === "text") {
          textContent += (textContent ? "\n" : "") + block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
        } else if (block.type === "tool_result") {
          // Tool result becomes a separate message with role "tool" in OpenAI
          let resultText = "";
          if (typeof block.content === "string") {
            resultText = block.content;
          } else if (Array.isArray(block.content)) {
            resultText = block.content.map((x) => x.text || "").join("\n");
          }
          messages.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content: resultText,
          });
        }
      }

      // Add the assistant text and/or tool call
      if (textContent || toolCalls.length > 0) {
        const msg = { role: m.role };
        if (textContent) msg.content = textContent;
        if (toolCalls.length > 0) msg.tool_calls = toolCalls;
        messages.push(msg);
      }
    }
  }

  const out = {
    model,
    messages,
    max_tokens: body.max_tokens,
    stream: body.stream === true,
  };

  // Translate tools schema
  if (body.tools && Array.isArray(body.tools)) {
    out.tools = body.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  if (body.temperature != null) out.temperature = body.temperature;
  if (body.top_p != null) out.top_p = body.top_p;
  if (body.stop_sequences) out.stop = body.stop_sequences;
  return out;
}

function mapStopReason(r) {
  return { stop: "end_turn", length: "max_tokens", tool_calls: "tool_use", content_filter: "end_turn" }[r] || "end_turn";
}

function newMsgId() {
  return "msg_" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

function openAIToAnthropic(data, model) {
  const choice = data.choices?.[0] || {};
  const message = choice.message || {};
  const content = [];

  if (message.content) {
    content.push({ type: "text", text: message.content });
  }

  if (message.tool_calls && Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      let input = {};
      try {
        input = JSON.parse(tc.function.arguments || "{}");
      } catch (e) {}
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: input,
      });
    }
  }

  return {
    id: data.id || newMsgId(),
    type: "message",
    role: "assistant",
    model,
    content: content.length > 0 ? content : [{ type: "text", text: "" }],
    stop_reason: mapStopReason(choice.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: data.usage?.prompt_tokens || 0,
      output_tokens: data.usage?.completion_tokens || 0,
    },
  };
}

// Streaming translation: OpenAI SSE → Anthropic SSE
function streamOpenAIToAnthropic(upstream, res, model) {
  const id = newMsgId();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  send("message_start", {
    type: "message_start",
    message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
  });

  let textStarted = false;
  const activeToolCalls = {}; // index -> { id, name, blockIndex }
  let buffer = "", finishReason = "stop", outputTokens = 0;

  upstream.on("data", (chunk) => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices?.[0]?.delta;
        const fr = j.choices?.[0]?.finish_reason;

        if (delta) {
          // 1. Stream Text content
          if (delta.content) {
            if (!textStarted) {
              send("content_block_start", {
                type: "content_block_start",
                index: 0,
                content_block: { type: "text", text: "" },
              });
              textStarted = true;
            }
            send("content_block_delta", {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: delta.content },
            });
          }

          // 2. Stream Tool calls
          if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;

              // Start of a tool call block
              if (tc.id && tc.function?.name) {
                activeToolCalls[idx] = {
                  id: tc.id,
                  name: tc.function.name,
                  blockIndex: idx + (textStarted ? 1 : 0),
                };
                send("content_block_start", {
                  type: "content_block_start",
                  index: activeToolCalls[idx].blockIndex,
                  content_block: {
                    type: "tool_use",
                    id: tc.id,
                    name: tc.function.name,
                    input: {},
                  },
                });
              }

              // Feed arguments stream
              if (tc.function?.arguments && activeToolCalls[idx]) {
                send("content_block_delta", {
                  type: "content_block_delta",
                  index: activeToolCalls[idx].blockIndex,
                  delta: {
                    type: "input_json_delta",
                    partial_json: tc.function.arguments,
                  },
                });
              }
            }
          }
        }

        if (fr) finishReason = fr;
        if (j.usage?.completion_tokens) outputTokens = j.usage.completion_tokens;
      } catch (e) {}
    }
  });

  upstream.on("end", () => {
    // Stop all active tool calls
    for (const idx in activeToolCalls) {
      send("content_block_stop", {
        type: "content_block_stop",
        index: activeToolCalls[idx].blockIndex,
      });
    }

    // Stop text block
    if (textStarted) {
      send("content_block_stop", { type: "content_block_stop", index: 0 });
    }

    send("message_delta", {
      type: "message_delta",
      delta: { stop_reason: mapStopReason(finishReason), stop_sequence: null },
      usage: { output_tokens: outputTokens },
    });
    send("message_stop", { type: "message_stop" });
    res.end();
  });

  upstream.on("error", () => res.end());
}

// Streaming: Native Anthropic SSE pass-through lekin model naam patch karta hai
// Jab AgentRouter se Claude ka response aata hai, message_start mein uska apna
// model naam hota hai — lekin Claude Code ko sahi model dikhane ke liye hum
// usse provider.model se replace kar dete hain.
function streamAnthropicWithModelPatch(upstream, res, model) {
  let buffer = "";
  let patchDone = false; // sirf pehle message_start ko patch karo

  upstream.on("data", (chunk) => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const rawLine = buffer.slice(0, nl + 1); // include the newline
      buffer = buffer.slice(nl + 1);
      const trimmed = rawLine.trim();

      // message_start event ke data line mein model naam patch karo
      if (!patchDone && trimmed.startsWith("data:")) {
        const payload = trimmed.slice(5).trim();
        try {
          const j = JSON.parse(payload);
          if (j.type === "message_start" && j.message) {
            j.message.model = model; // ← yahan model naam replace hota hai
            const patched = `data: ${JSON.stringify(j)}\n\n`;
            res.write(patched);
            patchDone = true;
            continue;
          }
        } catch (e) {}
      }

      // Baaki sabhi lines as-is forward karo
      res.write(rawLine);
    }
  });

  upstream.on("end", () => {
    if (buffer) res.write(buffer); // remaining buffer flush karo
    res.end();
  });

  upstream.on("error", () => res.end());
}

async function streamToString(stream) {
  if (!stream) return "";
  return new Promise((resolve) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", () => resolve("error reading stream"));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
// ═══════════════════════════════════════════════════════════════════════════════
// 🚀 CORE ROUTER — Ek request ko saare providers pe try karta hai
// ═══════════════════════════════════════════════════════════════════════════════
async function tryProviders(req, res) {
  const wantsStream = req.body.stream === true;
  // Smart pinning: pinned provider PEHLE try hoga, agar fail ho to baaki sabko bhi try karega
  const configured = PROVIDERS.filter((p) => p.key);
  let activeProviders;
  let pinnedExclusive = false; // true = sirf pinned provider, koi fallback nahi

  if (pinnedProvider) {
    // EXCLUSIVE PIN: Sirf pinned provider use hoga. Koi fallback nahi.
    const pinned = configured.filter((p) => p.name === pinnedProvider);
    if (pinned.length > 0) {
      activeProviders = pinned;
      pinnedExclusive = true;
      console.log(`📌 Pinned EXCLUSIVE mode: ONLY ${pinnedProvider} (no fallback)`);
    } else {
      activeProviders = configured;
    }
  } else if (stickyProvider && !isOnCooldown(stickyProvider)) {
    // Sticky mode: last successful provider ko SIRF pehle try karo
    const sticky = configured.filter((p) => p.name === stickyProvider);
    const others = configured.filter((p) => p.name !== stickyProvider);
    activeProviders = [...sticky, ...others];
    console.log(`🔒 Sticky mode: trying ${stickyProvider} first`);
  } else {
    if (stickyProvider && isOnCooldown(stickyProvider)) {
      console.log(`🔓 Sticky provider ${stickyProvider} on cooldown — switching...`);
      stickyProvider = null;
    }
    activeProviders = configured;
  }

  if (activeProviders.length === 0) {
    return res.status(502).json({ type: "error", error: { type: "router_error", message: "Koi bhi provider configure nahi hai. .env file check karo." } });
  }

  let lastError = null;

  // Pinned exclusive mode: retry same provider up to 3 times
  const maxRetries = pinnedExclusive ? 3 : 1;

  for (let retryAttempt = 0; retryAttempt < maxRetries; retryAttempt++) {
    if (pinnedExclusive && retryAttempt > 0) {
      console.log(`🔄 Pinned retry #${retryAttempt + 1}/${maxRetries} for ${pinnedProvider}...`);
      await new Promise(r => setTimeout(r, 2000)); // 2 sec wait before retry
    }

  for (const provider of activeProviders) {
    // Cooldown check — pinned provider ka cooldown skip karo
    if (isOnCooldown(provider.name)) {
      if (pinnedExclusive && provider.name === pinnedProvider) {
        console.log(`📌 ${provider.name} cooldown skip (pinned mode)`);
        // Don't skip pinned provider
      } else {
        const secs = cooldownRemaining(provider.name);
        console.log(`⏭️  ${provider.name} skip (cooldown: ${secs}s baki)`);
        continue;
      }
    }

    // Request payload banana
    let payload;
    if (provider.type === "openai") {
      payload = anthropicToOpenAI(req.body, provider.model);
    } else {
      // Anthropic provider ke liye — sirf supported fields rakho
      // Claude Code kabhi kabhi "betas", "container" jaisi fields bhejta hai jo
      // third-party providers (AgentRouter) support nahi karte → 400 aata hai
      const { model: _m, betas, container, ...cleanBody } = req.body;
      payload = { ...cleanBody, model: provider.model };
    }

    // Headers banana
    const headers = { "Content-Type": "application/json", ...provider.extraHeaders };
    if (provider.type === "anthropic") {
      headers["x-api-key"] = provider.key;
    } else {
      headers["Authorization"] = `Bearer ${provider.key}`;
    }

    try {
      console.log(`➡️  Trying ${provider.name} [${provider.model}]...`);

      let upstream = await axios.post(provider.url, payload, {
        headers,
        timeout: 600000,
        responseType: wantsStream ? "stream" : "json",
        validateStatus: () => true,
      });

      let status = upstream.status;

      // Log initial 403 response
      if (status === 403 && provider.name.startsWith("AgentRouter")) {
        let errorMsg = wantsStream ? await streamToString(upstream.data) : JSON.stringify(upstream.data);
        console.log(`⚠️  AgentRouter returned 403 on initial try. Error Body: ${errorMsg}`);
      }

      // Smart fallback: Agar AgentRouter 403 deta hai (key doesn't support tools) aur tools passed hain
      // toh request ko bina tools ke retry karo so that text responses continue working.
      if (status === 403 && provider.name.startsWith("AgentRouter") && payload.tools) {
        console.log(`⚠️  AgentRouter returned 403 (limit/tools). Retrying without tools...`);
        const { tools: _t, ...noToolsPayload } = payload;
        
        // Response responseType will be same as original request
        upstream = await axios.post(provider.url, noToolsPayload, {
          headers,
          timeout: 600000,
          responseType: wantsStream ? "stream" : "json",
          validateStatus: () => true,
        });
        status = upstream.status;

        if (status >= 400) {
          let errorMsg = wantsStream ? await streamToString(upstream.data) : JSON.stringify(upstream.data);
          console.log(`❌ AgentRouter fallback retry failed with ${status}. Error Body: ${errorMsg}`);
        }
      }

      // Koi bhi 4xx ya 5xx → switch (sirf 200-299 hi accept karo)
      if (status < 200 || status >= 300) {
        if (pinnedExclusive) {
          // Pinned mode: cooldown mat lagao, retry karega
          console.log(`🔁 ${provider.name} → ${status} — PINNED mode, will retry (no fallback)`);
          stats[provider.name].fail++;
          lastError = { provider: provider.name, status };
          if (wantsStream && upstream.data?.destroy) upstream.data.destroy();
          continue; // retry same provider (loop sirf 1 provider hai)
        }
        console.log(`🔁 ${provider.name} → ${status} — next provider try kar raha hoon`);
        setCooldown(provider.name);
        stats[provider.name].fail++;
        lastError = { provider: provider.name, status };
        if (wantsStream && upstream.data?.destroy) upstream.data.destroy();
        continue;
      }

      // ✅ Success!
      console.log(`✅ ${provider.name} → 200 OK`);
      clearCooldown(provider.name);
      stats[provider.name].success++;
      stats[provider.name].lastUsed = new Date().toISOString();
      // Sticky mode: is provider ko yaad rakho — next request mein isse pehle try hoga
      if (!pinnedProvider) stickyProvider = provider.name;

      res.setHeader("X-Router-Provider", provider.name);
      res.setHeader("X-Router-Model", provider.model);

      if (wantsStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        if (provider.type === "anthropic") {
          // DISPLAY_MODEL se patch karo — Claude Code mein "AI Router" dikhega
          streamAnthropicWithModelPatch(upstream.data, res, DISPLAY_MODEL);
        } else {
          streamOpenAIToAnthropic(upstream.data, res, DISPLAY_MODEL);
        }
      } else {
        let bodyOut;
        if (provider.type === "anthropic") {
          // Non-streaming Anthropic: model naam patch karo
          bodyOut = { ...upstream.data, model: DISPLAY_MODEL };
        } else {
          bodyOut = openAIToAnthropic(upstream.data, DISPLAY_MODEL);
        }
        res.json(bodyOut);
      }
      return;
    } catch (err) {
      // Network error, timeout, etc.
      const msg = err.code || err.message;
      console.log(`❌ ${provider.name} → Network error: ${msg}`);
      if (!pinnedExclusive) setCooldown(provider.name);
      stats[provider.name].fail++;
      lastError = { provider: provider.name, error: msg };
      continue;
    }
  }
  } // end retry loop

  // Saare providers fail ho gaye
  console.log("🚫 Saare providers fail ho gaye ya cooldown pe hain.");
  res.status(502).json({
    type: "error",
    error: {
      type: "router_error",
      message: "Saare providers fail ho gaye ya temporarily unavailable hain.",
      last_error: lastError,
      cooldowns: Object.fromEntries(
        PROVIDERS.filter((p) => isOnCooldown(p.name)).map((p) => [p.name, `${cooldownRemaining(p.name)}s`])
      ),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🌐 EXPRESS SERVER
// ═══════════════════════════════════════════════════════════════════════════════
const app = express();
app.use(express.json({ limit: "25mb" }));

// Main endpoint — Claude Code yahan request karta hai
app.post("/v1/messages", (req, res) => tryProviders(req, res));

// Token count — AgentRouter ya koi bhi Anthropic provider ko forward karo
app.post("/v1/messages/count_tokens", async (req, res) => {
  const p = PROVIDERS.find((x) => x.type === "anthropic" && x.key && !isOnCooldown(x.name));
  if (!p) return res.status(502).json({ error: "Koi anthropic provider available nahi" });
  try {
    const headers = { "Content-Type": "application/json", "x-api-key": p.key, ...p.extraHeaders };
    const r = await axios.post(
      p.url.replace("/v1/messages", "/v1/messages/count_tokens"),
      { ...req.body, model: p.model },
      { headers, timeout: 30000, validateStatus: () => true }
    );
    res.status(r.status).json(r.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Manual Provider Switching ─────────────────────────────────────────────────
// Pinned provider: agar set hai to sirf wahi use hoga (auto-failover off)
let pinnedProvider = null; // null = auto mode
let stickyProvider = null; // Sticky mode: last successful provider yaad rakhta hai

// POST /switch — provider pin karo
app.post("/switch", express.json(), (req, res) => {
  const { provider } = req.body;
  if (!provider || provider === "auto") {
    pinnedProvider = null;
    console.log("🔄 Auto mode — all providers in rotation");
    return res.json({ ok: true, mode: "auto" });
  }
  const found = PROVIDERS.find((p) => p.name.toLowerCase() === provider.toLowerCase() && p.key);
  if (!found) return res.status(404).json({ ok: false, error: `Provider "${provider}" not found or not configured` });
  pinnedProvider = found.name;
  // Pinned provider ka cooldown clear karo taaki turant use ho
  clearCooldown(found.name);
  console.log(`📌 Pinned to ${found.name} [${found.model}]`);
  res.json({ ok: true, mode: "pinned", provider: found.name, model: found.model });
});

// ── Update API Keys dynamically via Web Dashboard ────────────────────────────
app.post("/api/save-keys", (req, res) => {
  try {
    const { geminiKey, openCodeKey, agentRouterKey, openRouterKey, githubKey } = req.body;
    const envFile = path.join(__dirname, ".env");
    let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
    let lines = content.split("\n");

    lines = lines.map((line) => {
      if (geminiKey) {
        if (line.startsWith("GEMINI_API_KEY=")) return `GEMINI_API_KEY=${geminiKey}`;
        if (line.startsWith("CUSTOM_1_KEY=")) return `CUSTOM_1_KEY=${geminiKey}`;
        if (line.startsWith("CUSTOM_2_KEY=")) return `CUSTOM_2_KEY=${geminiKey}`;
        if (line.startsWith("CUSTOM_3_KEY=")) return `CUSTOM_3_KEY=${geminiKey}`;
        if (line.startsWith("CUSTOM_4_KEY=")) return `CUSTOM_4_KEY=${geminiKey}`;
      }
      if (openCodeKey) {
        if (line.startsWith("CUSTOM_69_KEY=")) return `CUSTOM_69_KEY=${openCodeKey}`;
        if (line.startsWith("CUSTOM_70_KEY=")) return `CUSTOM_70_KEY=${openCodeKey}`;
        if (line.startsWith("CUSTOM_71_KEY=")) return `CUSTOM_71_KEY=${openCodeKey}`;
        if (line.startsWith("CUSTOM_72_KEY=")) return `CUSTOM_72_KEY=${openCodeKey}`;
        if (line.startsWith("CUSTOM_73_KEY=")) return `CUSTOM_73_KEY=${openCodeKey}`;
        if (line.startsWith("CUSTOM_74_KEY=")) return `CUSTOM_74_KEY=${openCodeKey}`;
      }
      if (agentRouterKey) {
        if (line.startsWith("AGENTROUTER_API_KEY=")) return `AGENTROUTER_API_KEY=${agentRouterKey}`;
      }
      if (openRouterKey) {
        if (line.startsWith("OPENROUTER_API_KEY=")) return `OPENROUTER_API_KEY=${openRouterKey}`;
      }
      if (githubKey) {
        if (line.startsWith("GITHUB_API_KEY=")) return `GITHUB_API_KEY=${githubKey}`;
      }
      return line;
    });

    function upsertVar(arr, keyName, val) {
      if (!val) return arr;
      const exists = arr.some(l => l.startsWith(`${keyName}=`));
      if (!exists) arr.push(`${keyName}=${val}`);
      return arr;
    }

    lines = upsertVar(lines, "AGENTROUTER_API_KEY", agentRouterKey);
    lines = upsertVar(lines, "OPENROUTER_API_KEY", openRouterKey);
    lines = upsertVar(lines, "GITHUB_API_KEY", githubKey);

    fs.writeFileSync(envFile, lines.join("\n"), "utf8");

    // Update in-memory PROVIDERS array
    PROVIDERS.forEach((p) => {
      if (geminiKey && (p.name.includes("Gemini") || p.name === "Gemini Direct")) p.key = geminiKey;
      if (openCodeKey && p.name.startsWith("OCode")) p.key = openCodeKey;
      if (agentRouterKey && p.name.startsWith("AgentRouter")) p.key = agentRouterKey;
      if (openRouterKey && p.name.startsWith("OpenRouter")) p.key = openRouterKey;
      if (githubKey && p.name.startsWith("GitHub")) p.key = githubKey;
    });

    console.log("🔑 API Keys updated dynamically via Dashboard!");
    res.json({ ok: true, activeCount: PROVIDERS.filter(p => p.key).length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Add Custom Provider dynamically via Web Dashboard ────────────────────────
app.post("/api/add-provider", (req, res) => {
  try {
    const { name, model, url, key, type } = req.body;
    if (!name || !model || !url || !key) {
      return res.status(400).json({ ok: false, error: "Name, Model, URL and Key are all required!" });
    }

    const envFile = path.join(__dirname, ".env");
    let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";

    // Find highest CUSTOM_N index
    let nextIdx = 89;
    const matches = content.match(/CUSTOM_(\d+)_NAME/g);
    if (matches) {
      const nums = matches.map(m => parseInt(m.replace(/\D/g, ""), 10));
      nextIdx = Math.max(...nums) + 1;
    }

    const modelList = model.split(",").map(m => m.trim()).filter(Boolean);
    if (modelList.length === 0) {
      return res.status(400).json({ ok: false, error: "At least one model is required!" });
    }

    let appendContent = "";
    const addedModels = [];

    modelList.forEach((m) => {
      const displayName = modelList.length === 1 ? name : `${name} [${m}]`;
      const providerType = type === "anthropic" ? "anthropic" : "openai";
      appendContent += `\n# Custom Added: ${displayName}\nCUSTOM_${nextIdx}_NAME=${displayName}\nCUSTOM_${nextIdx}_KEY=${key}\nCUSTOM_${nextIdx}_URL=${url}\nCUSTOM_${nextIdx}_MODEL=${m}\nCUSTOM_${nextIdx}_TYPE=${providerType}\n`;

      const newProvider = { name: displayName, type: providerType, url, key, model: m, extraHeaders: {} };
      PROVIDERS.push(newProvider);
      stats[displayName] = { success: 0, fail: 0, lastUsed: null };
      addedModels.push({ name: displayName, model: m });
      nextIdx++;
    });

    fs.appendFileSync(envFile, appendContent, "utf8");
    console.log(`🔌 Added ${addedModels.length} models for provider: ${name}`);
    res.json({ ok: true, count: addedModels.length, added: addedModels, totalActive: PROVIDERS.filter(p => p.key).length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Status Dashboard ─────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  // Tier boundaries — actual quality based (provider brand se nahi)
  const getTier = (idx, name) => {
    if (name.includes("Fallback") || name.includes("Last Resort")) return { label: "🛡", bg: "#dc2626", desc: "Fallback" };
    if (idx < 1)  return { label: "S", bg: "#6d28d9", desc: "Direct" };     // Gemini Direct
    if (idx < 5)  return { label: "S", bg: "#7c3aed", desc: "Gemini" };     // Gemini Cloud
    if (idx < 19) return { label: "A", bg: "#1d4ed8", desc: "FreeLLM" };    // FreeLLM
    if (idx < 35) return { label: "B", bg: "#065f46", desc: "NVIDIA" };     // OmniRoute NVIDIA
    if (idx < 47) return { label: "C", bg: "#92400e", desc: "OC/Ollama" };  // OC + Ollama
    return               { label: "D", bg: "#374151", desc: "AGY/CF" };     // AGY + CF + AI21
  };

  const TIER_HEADERS = {};
  PROVIDERS.forEach((p, idx) => {
    if (idx === 0)  TIER_HEADERS[idx] = "🏆 Flagship — Direct Gemini 3.1 Pro";
    if (idx === 1)  TIER_HEADERS[idx] = "🏆 Tier S — Gemini Cloud (Always Available)";
    if (idx === 5)  TIER_HEADERS[idx] = "⭐ Tier A — FreeLLM (Best Free Models)";
    if (idx === 19) TIER_HEADERS[idx] = "🔵 Tier B — OmniRoute NVIDIA NIM (Billion Tokens)";
    if (idx === 35) TIER_HEADERS[idx] = "🟢 Tier C — OmniRoute OpenCode + Ollama Cloud";
    if (idx === 47) TIER_HEADERS[idx] = "🟡 Tier D — OmniRoute AGY + Cloudflare + AI21";
    if (p.name === "GitHub Models (Fallback)") TIER_HEADERS[idx] = "🛡️ Fallback — Last Resort Only";
  });

  let rankCounter = 0;
  const providerRows = PROVIDERS.map((p, idx) => {
    const hasKey = !!p.key;
    const cd = isOnCooldown(p.name);
    const cdSecs = cooldownRemaining(p.name);
    const s = stats[p.name] || { success: 0, fail: 0, lastUsed: null };
    const isPinned = pinnedProvider === p.name;
    const tier = getTier(idx, p.name);
    rankCounter++;
    const rank = rankCounter;

    const statusIcon = !hasKey ? "⚫" : isPinned ? "📌" : cd ? "🟡" : "🟢";
    const statusText = !hasKey ? "No Key" : isPinned ? "Pinned ✦" : cd ? `Cooldown (${cdSecs}s)` : "Ready";
    const btnStyle = isPinned
      ? "background:#6d28d9;color:#fff"
      : hasKey
      ? "background:#1e3a5f;color:#93c5fd;cursor:pointer"
      : "background:#1e293b;color:#475569;cursor:not-allowed";

    const tierHeader = TIER_HEADERS[idx]
      ? `<tr><td colspan="8" style="padding:12px 8px 6px;font-size:0.75rem;font-weight:700;color:#94a3b8;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #334155;background:#0f172a">${TIER_HEADERS[idx]}</td></tr>`
      : "";

    return `${tierHeader}
      <tr id="row-${p.name}" style="opacity:${hasKey ? 1 : 0.45}">
        <td style="color:#64748b;font-size:0.75rem;font-weight:700;text-align:center;width:40px">#${rank}</td>
        <td><span style="background:${tier.bg};color:#fff;padding:1px 6px;border-radius:4px;font-size:0.65rem;font-weight:800;margin-right:6px">${tier.label}</span>${statusIcon} <strong>${p.name}</strong></td>
        <td><code>${p.model}</code></td>
        <td style="color:#4ade80">${s.success} ✅</td>
        <td style="color:#f87171">${s.fail} ❌</td>
        <td>${statusText}</td>
        <td>${s.lastUsed ? new Date(s.lastUsed).toLocaleTimeString() : "—"}</td>
        <td>
          ${hasKey ? `<button onclick="switchTo('${p.name}')" style="padding:4px 12px;border:none;border-radius:6px;font-size:0.8rem;transition:all 0.2s;${btnStyle}">
            ${isPinned ? "✦ Active" : "Use This"}
          </button>` : `<span style="color:#475569;font-size:0.8rem">No Key</span>`}
        </td>
      </tr>`;
  }).join("");

  const stickyText = stickyProvider ? ` | 🔒 Sticky: <strong>${stickyProvider}</strong>` : '';
  const flowText = pinnedProvider
    ? `<span style="color:#a78bfa">📌 Pinned: <strong>${pinnedProvider}</strong></span> &nbsp;(Auto-failover bhi chalega agar fail ho)`
    : PROVIDERS.filter(p => p.key).slice(0,5).map(p => `<span class="badge">${p.name}</span>`).join(" → ") + " → ... &nbsp;(Auto mode — best available use hoga)" + stickyText;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AI Router — Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f172a; color: #e2e8f0; font-family: 'Segoe UI', sans-serif; padding: 2rem; }
    h1 { font-size: 1.8rem; margin-bottom: 0.3rem; }
    h1 span { color: #818cf8; }
    .subtitle { color: #94a3b8; margin-bottom: 2rem; font-size: 0.9rem; }
    .card { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid #334155; }
    .card h2 { font-size: 1rem; color: #94a3b8; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 1px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 0.5rem 0.75rem; color: #64748b; font-size: 0.8rem; text-transform: uppercase; border-bottom: 1px solid #334155; }
    td { padding: 0.6rem 0.75rem; border-bottom: 1px solid #1e293b; font-size: 0.85rem; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255,255,255,0.02); }
    code { background: #0f172a; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; color: #a78bfa; }
    .endpoint { background: #0f172a; padding: 0.75rem 1rem; border-radius: 8px; font-family: monospace; color: #34d399; font-size: 0.9rem; margin-top: 0.5rem; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 0.8rem; background: #334155; color: #94a3b8; }
    .refresh { color: #475569; font-size: 0.75rem; margin-top: 1rem; }
    .mode-bar { display:flex; gap:0.5rem; align-items:center; margin-bottom:1rem; flex-wrap:wrap; }
    .mode-btn { padding:8px 18px; border:none; border-radius:8px; font-size:0.85rem; cursor:pointer; font-weight:600; transition: all 0.2s; }
    .mode-btn.auto { background:#0ea5e9; color:#fff; }
    .mode-btn.provider { background:#1e3a5f; color:#93c5fd; border:1px solid #1e4a8f; }
    .mode-btn.provider:hover { background:#1d4ed8; color:#fff; }
    .toast { position:fixed; bottom:1.5rem; right:1.5rem; background:#22c55e; color:#fff; padding:0.75rem 1.2rem; border-radius:10px; font-size:0.9rem; display:none; z-index:99; box-shadow:0 4px 20px rgba(0,0,0,0.4); }
    .toast.error { background:#ef4444; }
    .tier-header td { background:#0f172a !important; }
    .btn-action { padding:8px 16px; border:none; border-radius:8px; font-size:0.85rem; cursor:pointer; font-weight:700; transition:all 0.2s; display:inline-flex; align-items:center; gap:6px; }
    .btn-key { background:#8b5cf6; color:#fff; }
    .btn-key:hover { background:#7c3aed; }
    .btn-add { background:#10b981; color:#fff; }
    .btn-add:hover { background:#059669; }
    .header-bar { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem; }
    .modal-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); display:none; justify-content:center; align-items:center; z-index:1000; }
    .modal-card { background:#1e293b; border:1px solid #475569; border-radius:14px; width:95%; max-width:540px; padding:1.8rem; box-shadow:0 10px 40px rgba(0,0,0,0.5); }
    .modal-card h3 { font-size:1.2rem; color:#f8fafc; margin-bottom:0.5rem; }
    .modal-card p { font-size:0.85rem; color:#94a3b8; margin-bottom:1.2rem; }
    .form-group { margin-bottom:1rem; }
    .form-group label { display:block; font-size:0.8rem; font-weight:700; color:#cbd5e1; margin-bottom:0.35rem; }
    .form-group input, .form-group select { width:100%; padding:0.6rem 0.8rem; background:#0f172a; border:1px solid #334155; border-radius:8px; color:#e2e8f0; font-size:0.85rem; font-family:inherit; outline:none; }
    .form-group input:focus, .form-group select:focus { border-color:#818cf8; }
    .form-hint { font-size:0.75rem; color:#64748b; margin-top:0.25rem; }
    .form-hint a { color:#818cf8; text-decoration:none; }
    .form-hint a:hover { text-decoration:underline; }
    .modal-actions { display:flex; justify-content:flex-end; gap:0.6rem; margin-top:1.5rem; }
  </style>
</head>
<body>
  <div class="header-bar">
    <div>
      <h1>🚦 AI <span>Router</span></h1>
      <p class="subtitle" style="margin-bottom:0">Universal AI Provider — Claude Code ke liye free unlimited access · <strong style="color:#34d399">${PROVIDERS.filter(p=>p.key).length} providers active</strong></p>
    </div>
    <div style="display:flex; gap:0.6rem; flex-wrap:wrap">
      <button class="btn-action btn-key" onclick="openModal('keysModal')">🔑 Manage API Keys</button>
      <button class="btn-action btn-add" onclick="openModal('addModal')">➕ Add Custom Provider</button>
    </div>
  </div>

  <div class="card">
    <h2>⚡ Provider Status — Priority Order (Best → Light)</h2>
    <table>
      <thead>
        <tr>
          <th style="width:40px">#</th><th>Provider</th><th>Model</th><th>OK</th><th>Fail</th><th>Status</th><th>Last Used</th><th>Switch</th>
        </tr>
      </thead>
      <tbody>${providerRows}</tbody>
    </table>
  </div>

  <div class="card">
    <h2>🎛️ Quick Switch</h2>
    <p style="color:#94a3b8;font-size:0.85rem;margin-bottom:1rem">Kisi bhi provider ko pin karo. Auto mode mein router khud decide karta hai (priority order follow karta hai).</p>
    <div class="mode-bar">
      <button class="mode-btn auto" onclick="switchTo('auto')">🔄 Auto Mode (Recommended)</button>
      ${PROVIDERS.filter(p => p.key).map(p =>
        `<button class="mode-btn provider" onclick="switchTo('${p.name}')" title="${p.model}">📌 ${p.name}</button>`
      ).join("")}
    </div>
  </div>

  <div class="card">
    <h2>🔄 Current Flow</h2>
    <p style="color:#94a3b8; font-size:0.85rem">${flowText}</p>
  </div>

  <div class="card">
    <h2>📡 Claude Code Connection</h2>
    <p style="color:#94a3b8;font-size:0.85rem;margin-bottom:0.5rem">Apne Claude Code settings.json mein ye daalo:</p>
    <div class="endpoint">ANTHROPIC_BASE_URL = http://localhost:${PORT}</div>
    <div class="endpoint" style="margin-top:0.5rem">ANTHROPIC_API_KEY = router-handles-this</div>
  </div>

  <p class="refresh">⟳ Page 10 seconds mein auto-refresh hota hai</p>
  <div class="toast" id="toast"></div>

  <!-- Modal 1: Keys Management -->
  <div class="modal-overlay" id="keysModal">
    <div class="modal-card">
      <h3>🔑 Manage API Keys</h3>
      <p>Apni free API keys daalo. Ek key daalne se us provider ke saare models active ho jayenge!</p>
      
      <div class="form-group">
        <label>Google Gemini Free Key (5 models active honge)</label>
        <input type="password" id="keyGemini" placeholder="AIzaSy... ya AQ.Ab..." />
        <div class="form-hint">Get free key from <a href="https://aistudio.google.com/" target="_blank">Google AI Studio ↗</a></div>
      </div>

      <div class="form-group">
        <label>OpenCode Free Key (6 coding models active honge)</label>
        <input type="password" id="keyOpenCode" placeholder="sk-..." />
        <div class="form-hint">Get free key from <a href="https://opencode.ai/" target="_blank">OpenCode AI ↗</a></div>
      </div>

      <div class="form-group">
        <label>AgentRouter Key (Fallback #1 — Claude Opus 4.8)</label>
        <input type="password" id="keyAgentRouter" placeholder="sk-paZT..." />
        <div class="form-hint">Anthropic format fallback endpoint: <a href="https://agentrouter.org/" target="_blank">AgentRouter ↗</a></div>
      </div>

      <div class="form-group">
        <label>OpenRouter Key (Fallback #2 — Nemotron Ultra Free)</label>
        <input type="password" id="keyOpenRouter" placeholder="sk-or-v1-..." />
        <div class="form-hint">Emergency backup endpoint: <a href="https://openrouter.ai/" target="_blank">OpenRouter ↗</a></div>
      </div>

      <div class="form-group">
        <label>GitHub Models Key (Fallback #3 — GPT-4o Mini)</label>
        <input type="password" id="keyGitHub" placeholder="ghp_..." />
        <div class="form-hint">Free developer models: <a href="https://github.com/marketplace/models" target="_blank">GitHub Models ↗</a></div>
      </div>

      <div class="modal-actions">
        <button class="btn-action" style="background:#334155;color:#e2e8f0" onclick="closeModal('keysModal')">Cancel</button>
        <button class="btn-action btn-key" onclick="submitKeys()">💾 Save & Activate Keys</button>
      </div>
    </div>
  </div>

  <!-- Modal 2: Add Custom Provider -->
  <div class="modal-overlay" id="addModal">
    <div class="modal-card">
      <h3>➕ Add Custom Provider / Model</h3>
      <p>Kisi bhi naye OpenAI ya Anthropic compatible model ko AI Router rotation mein add karo.</p>

      <div class="form-group">
        <label>Provider Name (Display Label)</label>
        <input type="text" id="custName" placeholder="e.g. Groq Llama-3.3 ya Together DeepSeek" />
      </div>

      <div class="form-group">
        <label>Model ID(s) — <span style="color:#818cf8;font-weight:normal">comma lagakar multiple models daal sakte ho</span></label>
        <input type="text" id="custModel" placeholder="e.g. llama-3.3-70b-versatile, deepseek-r1, mixtral-8x7b" />
        <div class="form-hint">💡 Ek hi key se multiple models add karne ke liye comma use karein (e.g. model1, model2)</div>
      </div>

      <div class="form-group">
        <label>API Endpoint URL</label>
        <input type="text" id="custUrl" placeholder="https://api.groq.com/openai/v1/chat/completions" />
      </div>

      <div class="form-group">
        <label>API Key / Token</label>
        <input type="password" id="custKey" placeholder="Bearer token ya API key" />
      </div>

      <div class="form-group">
        <label>Protocol Type</label>
        <select id="custType">
          <option value="openai">OpenAI Compatible (Most Common)</option>
          <option value="anthropic">Anthropic Messages Format</option>
        </select>
      </div>

      <div class="modal-actions">
        <button class="btn-action" style="background:#334155;color:#e2e8f0" onclick="closeModal('addModal')">Cancel</button>
        <button class="btn-action btn-add" onclick="submitCustomProvider()">✨ Add to AI Router</button>
      </div>
    </div>
  </div>

  <script>
    function openModal(id) {
      document.getElementById(id).style.display = 'flex';
    }
    function closeModal(id) {
      document.getElementById(id).style.display = 'none';
    }

    async function submitKeys() {
      const geminiKey = document.getElementById('keyGemini')?.value.trim() || '';
      const openCodeKey = document.getElementById('keyOpenCode')?.value.trim() || '';
      const agentRouterKey = document.getElementById('keyAgentRouter')?.value.trim() || '';
      const openRouterKey = document.getElementById('keyOpenRouter')?.value.trim() || '';
      const githubKey = document.getElementById('keyGitHub')?.value.trim() || '';

      try {
        const r = await fetch('/api/save-keys', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ geminiKey, openCodeKey, agentRouterKey, openRouterKey, githubKey })
        });
        const d = await r.json();
        if (d.ok) {
          closeModal('keysModal');
          showToast(\`✅ Keys saved! \${d.activeCount} providers active now.\`);
          setTimeout(() => location.reload(), 1500);
        } else {
          alert('Error: ' + d.error);
        }
      } catch(e) {
        alert('Failed to connect to router.');
      }
    }

    async function submitCustomProvider() {
      const name = document.getElementById('custName').value.trim();
      const model = document.getElementById('custModel').value.trim();
      const url = document.getElementById('custUrl').value.trim();
      const key = document.getElementById('custKey').value.trim();
      const type = document.getElementById('custType').value;

      if (!name || !model || !url || !key) {
        alert('Please fill all fields!');
        return;
      }

      try {
        const r = await fetch('/api/add-provider', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ name, model, url, key, type })
        });
        const d = await r.json();
        if (d.ok) {
          closeModal('addModal');
          showToast(\`✅ Added \${d.count} model(s)! Total active: \${d.totalActive}\`);
          setTimeout(() => location.reload(), 1500);
        } else {
          alert('Error: ' + d.error);
        }
      } catch(e) {
        alert('Failed to connect to router.');
      }
    }

    function showToast(msg, isError) {
      const toast = document.getElementById('toast');
      toast.className = isError ? 'toast error' : 'toast';
      toast.textContent = msg;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 2500);
    }

    async function switchTo(name) {
      try {
        const r = await fetch('/switch', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ provider: name })
        });
        const d = await r.json();
        if (d.ok) {
          showToast(name === 'auto'
            ? '✅ Auto mode active — router khud switch karega'
            : \`📌 Switched to \${d.provider} (\${d.model})\`);
          setTimeout(() => location.reload(), 1800);
        } else {
          showToast('❌ ' + d.error, true);
        }
      } catch(e) {
        alert('Router se connect nahi ho pa raha. Refresh karo.');
      }
    }
    setTimeout(() => location.reload(), 10000);
  </script>
</body>
</html>`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 MODEL DISCOVERY — Claude Desktop ke liye /v1/models endpoint
// Claude Desktop Gateway mode mein yahan se models ki list leti hai
// ═══════════════════════════════════════════════════════════════════════════════
app.get("/v1/models", (_req, res) => {
  const models = PROVIDERS.filter(p => p.key).map((p, idx) => ({
    id: `auto/${p.model}`,
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: p.name,
    permission: [],
    root: p.model,
    parent: null,
  }));

  // "auto" model bhi add karo — ye AI Router ka auto-failover mode hai
  models.unshift({
    id: "auto/claude-opus",
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "AI Router",
    permission: [],
    root: "auto",
    parent: null,
  });

  res.json({ object: "list", data: models });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 🔄 OPENAI CHAT COMPLETIONS — Claude Desktop Gateway ke liye
// Claude Desktop OpenAI format mein request bhejta hai Gateway mode mein
// ═══════════════════════════════════════════════════════════════════════════════
app.post("/v1/chat/completions", async (req, res) => {
  const wantsStream = req.body.stream === true;
  const requestedModel = req.body.model || "";

  // Agar specific model maanga hai toh usse pehle try karo
  const configured = PROVIDERS.filter(p => p.key);
  let activeProviders;

  if (requestedModel && requestedModel !== "auto/claude-opus") {
    // "auto/gemini-2.5-pro" → "gemini-2.5-pro" extract karo
    const cleanModel = requestedModel.replace(/^auto\//, "");
    const matched = configured.filter(p => p.model === cleanModel);
    const others = configured.filter(p => p.model !== cleanModel);
    activeProviders = [...matched, ...others];
  } else {
    activeProviders = pinnedProvider
      ? [...configured.filter(p => p.name === pinnedProvider), ...configured.filter(p => p.name !== pinnedProvider)]
      : configured;
  }

  if (activeProviders.length === 0) {
    return res.status(502).json({ error: { message: "Koi provider available nahi", type: "router_error" } });
  }

  for (const provider of activeProviders) {
    if (isOnCooldown(provider.name)) continue;

    // OpenAI format mein forward karo (Claude Desktop OpenAI format use karta hai)
    const payload = { ...req.body, model: provider.model };

    const headers = { "Content-Type": "application/json", ...provider.extraHeaders };
    if (provider.type === "anthropic") {
      headers["x-api-key"] = provider.key;
    } else {
      headers["Authorization"] = `Bearer ${provider.key}`;
    }

    // Anthropic provider ke liye OpenAI→Anthropic translation chahiye
    let targetUrl = provider.url;
    let finalPayload = payload;

    if (provider.type === "anthropic") {
      // Claude Desktop OpenAI format bhejta hai, Anthropic provider ko Anthropic format chahiye
      // Skip anthropic providers for now — OpenAI-compatible ones hi use karo
      continue;
    }

    try {
      console.log(`➡️  [Desktop] Trying ${provider.name} [${provider.model}]...`);
      const upstream = await axios.post(targetUrl, finalPayload, {
        headers, timeout: 600000,
        responseType: wantsStream ? "stream" : "json",
        validateStatus: () => true,
      });

      if (upstream.status < 200 || upstream.status >= 300) {
        console.log(`🔁 [Desktop] ${provider.name} → ${upstream.status}`);
        setCooldown(provider.name);
        stats[provider.name].fail++;
        if (wantsStream && upstream.data?.destroy) upstream.data.destroy();
        continue;
      }

      console.log(`✅ [Desktop] ${provider.name} → 200 OK`);
      clearCooldown(provider.name);
      stats[provider.name].success++;
      stats[provider.name].lastUsed = new Date().toISOString();

      if (wantsStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        upstream.data.pipe(res);
      } else {
        res.json(upstream.data);
      }
      return;
    } catch (err) {
      console.log(`❌ [Desktop] ${provider.name} → ${err.code || err.message}`);
      setCooldown(provider.name);
      stats[provider.name].fail++;
      continue;
    }
  }

  res.status(502).json({ error: { message: "Saare providers fail", type: "router_error" } });
});

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    mode: pinnedProvider ? "pinned" : "auto",
    pinned: pinnedProvider,
    providers: PROVIDERS.map((p) => ({
      name: p.name,
      configured: !!p.key,
      cooldown: isOnCooldown(p.name) ? cooldownRemaining(p.name) : 0,
      stats: stats[p.name],
    })),
  });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const configured = PROVIDERS.filter((p) => p.key).map((p) => p.name);
  const missing = PROVIDERS.filter((p) => !p.key).map((p) => p.name);

  console.log(`\n🚦 AI-Router v2.0 — http://localhost:${PORT}`);
  console.log(`   Dashboard:  http://localhost:${PORT}/`);
  console.log(`   Endpoint:   POST http://localhost:${PORT}/v1/messages`);
  console.log(`\n   ✅ Active:  ${configured.join(" → ") || "NONE"}`);
  if (missing.length) console.log(`   ⚫ No key:  ${missing.join(", ")}`);
  console.log(`\n   Claude Code settings.json mein daalo:`);
  console.log(`   ANTHROPIC_BASE_URL = http://localhost:${PORT}`);
  console.log(`   ANTHROPIC_API_KEY  = router-handles-this\n`);
});


