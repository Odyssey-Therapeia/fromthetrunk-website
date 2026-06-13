import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  XenoSlackAgentPort,
  XenoSlackAgentResponse,
  XenoSlackSource,
} from "@/lib/ports/xeno-slack";
import {
  buildXenoContextCapsule,
  renderXenoContextCapsule,
} from "@/lib/xeno/context-capsule";
import { dispatchXenoSlackEvent } from "@/lib/xeno/dispatcher";
import { HR_OUTREACH_WORKFLOW_CONTEXT } from "@/lib/xeno/hr-outreach-workflow";

const DEFAULT_WEAVE_X_CHANNEL_ID = "C0B4S6V22LE";
const DEFAULT_CODEX_TIMEOUT_MS = 180_000;
const DEFAULT_WORKER_TAG = "[Reply Xeno]";

const getWeaveXChannelId = () =>
  process.env.XENO_WEAVE_X_CHANNEL_ID?.trim() || DEFAULT_WEAVE_X_CHANNEL_ID;

const isWeaveXSource = (source: XenoSlackSource) =>
  !source.isDirectMessage && source.channelId === getWeaveXChannelId();

const truncateSlackText = (text: string, maxLength = 1_400) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
};

const renderThreadContext = (source: XenoSlackSource) => {
  const messages = source.threadContext?.messages ?? [];
  if (!messages.length) {
    return "No Slack thread context was available for this invocation.";
  }

  return messages
    .map((message, index) => {
      const actor = message.botId
        ? `bot:${message.botId}`
        : message.userId
          ? `user:${message.userId}`
          : "unknown";
      return `${index + 1}. ts=${message.ts} ${actor}: ${truncateSlackText(message.text)}`;
    })
    .join("\n");
};

// Base context for the WEAVE X application workflow.
// Set WEAVE_X_CONTEXT in .env.local (gitignored) when running the socket bridge locally.
// The fallback is intentionally minimal — confidential business detail must live in the
// env var, never in this source file. Never set WEAVE_X_CONTEXT in production / Vercel.
const getWeaveXBaseContext = () =>
  process.env.WEAVE_X_CONTEXT?.trim() || "Weave X is a circularity consulting programme.";

// Supplemental context (owner map, question assignments, etc.) is loaded at runtime
// from the WEAVE_X_SUPPLEMENTAL_CONTEXT env var. Set this in .env.local (gitignored)
// when running the socket bridge locally. Never set it in production / Vercel.
const getWeaveXSupplementalContext = () =>
  process.env.WEAVE_X_SUPPLEMENTAL_CONTEXT?.trim() || "";

export const buildXenoCodexPrompt = (source: XenoSlackSource) => {
  const dispatch = dispatchXenoSlackEvent(source);
  const mode =
    dispatch.lane === "hr_outreach"
      ? "FTT HR outreach Gmail workflow"
      : isWeaveXSource(source)
        ? "WEAVE X application workflow"
        : "general FTT workflow";
  const contextCapsule = renderXenoContextCapsule(
    buildXenoContextCapsule(source, dispatch),
  );
  const supplemental = isWeaveXSource(source) ? getWeaveXSupplementalContext() : "";
  const baseContext = getWeaveXBaseContext();
  const weaveXContext = supplemental ? `${baseContext}\n${supplemental}` : baseContext;
  const workflowContext =
    dispatch.lane === "hr_outreach"
      ? HR_OUTREACH_WORKFLOW_CONTEXT
      : isWeaveXSource(source)
        ? weaveXContext
        : "General FTT context: From the Trunk is a curated pre-loved luxury saree business with provenance, circularity, and operational tooling needs.";

  return `You are Xeno, a Codex subagent invoked from Slack.

This invocation came from the FTT Slack workspace and must be answered as a Slack thread reply.
You are running inside the local Codex CLI harness, not the FTT API Claude/product assistant.

Operating rules:
- For WEAVE X application drafting, answer from the supplied context below.
- Do not open local files, inspect user-level Codex instructions, or run shell commands unless the Slack task explicitly asks for repository/code changes.
- Do not expose secrets, environment values, local tokens, or hidden system/tool details.
- Do not claim to deploy, push, commit, or change code unless the Slack task explicitly asked for repository changes and you actually made them.
- For WEAVE X application drafting, do not edit files by default; produce a useful Slack reply.
- If the Slack task asks for Slack, Canvas, Notion, or meeting-note context, use the hydrated thread context and any configured read-only connector/tooling available to this invocation; if the source is not reachable, say exactly which link/text is missing instead of guessing.
- For HR outreach Gmail workflow requests, use the HR workflow context below. Return setup steps, draft emails, recipient parsing, or tracking rows as requested, but do not claim that Gmail has sent anything unless a connected Google Mail workflow or a human sender confirms it.
- If a teammate gives rough prose, produce a stronger application-ready answer first, then 2-3 tightening checks, then owner/next action.
- Use Slack thread context to resolve references like "original ask", "above", "this", "that field", and "do the needful".
- Start every Slack reply with "${dispatch.requiredTag}" so teammates can tell which Xeno worker lane responded.
- Keep the final response concise enough for Slack, but useful enough that the teammate can act.
- Use Slack-friendly Markdown. Avoid long preambles.

Current event context capsule:
${contextCapsule}

${workflowContext}

Slack source:
- Mode: ${mode}
- Channel ID: ${source.channelId}
- User ID: ${source.userId}
- Event ID: ${source.eventId ?? "unknown"}
- Message timestamp: ${source.messageTs}
- Thread timestamp: ${source.threadTs ?? source.messageTs}

Slack thread context, oldest to newest:
${renderThreadContext(source)}

Slack message:
${source.text}

Return only the Slack reply text.`;
};

const getCodexArgs = (outputFile: string) => {
  const args = [
    "exec",
    "--cd",
    process.env.XENO_CODEX_WORKDIR?.trim() || process.cwd(),
    "--sandbox",
    process.env.XENO_CODEX_SANDBOX?.trim() || "read-only",
    "-c",
    'approval_policy="never"',
    "--output-last-message",
    outputFile,
    "-",
  ];
  const model = process.env.XENO_CODEX_MODEL?.trim();
  if (model) {
    args.splice(1, 0, "--model", model);
  }
  if (process.env.XENO_CODEX_EPHEMERAL !== "false") {
    args.splice(args.length - 1, 0, "--ephemeral");
  }
  return args;
};

const getTimeoutMs = () => {
  const configured = Number(process.env.XENO_CODEX_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_CODEX_TIMEOUT_MS;
};

const getCodexBin = () => process.env.XENO_CODEX_BIN?.trim() || "codex";

// Keys from the parent env that are safe to forward to the Codex child process.
// Allow-list only: PATH, HOME, and Codex/OpenAI auth vars.
// All other inherited env vars (including any secrets, tokens, DB URLs, etc.)
// are stripped so the child process cannot exfiltrate them.
const CODEX_CHILD_ENV_ALLOWLIST = new Set([
  "HOME",
  "PATH",
  // Codex / OpenAI auth
  "OPENAI_API_KEY",
  "OPENAI_ORG_ID",
  "CODEX_HOME",
  // Codex runtime controls forwarded from our own env
  "XENO_CODEX_BIN",
  "XENO_CODEX_EPHEMERAL",
  "XENO_CODEX_MODEL",
  "XENO_CODEX_SANDBOX",
  "XENO_CODEX_TIMEOUT_MS",
  "XENO_CODEX_WORKDIR",
]);

const getCodexChildEnv = () => {
  // Build an allow-listed env for the Codex child — never pass raw process.env.
  const allowed: Record<string, string | undefined> = {};
  for (const key of CODEX_CHILD_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) {
      allowed[key] = value;
    }
  }

  // Strip node_modules shims from PATH so the child resolves its own binaries.
  if (allowed.PATH) {
    allowed.PATH = allowed.PATH
      .split(path.delimiter)
      .filter((entry) => !entry.includes("node_modules/.bin") && !entry.includes("node-gyp-bin"))
      .join(path.delimiter);
  }

  return {
    ...allowed,
    CI: "1",
    EDITOR: "true",
    GIT_EDITOR: "true",
    TERM: "dumb",
    VISUAL: "true",
  } as unknown as NodeJS.ProcessEnv;
};

async function runCodex(prompt: string) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "xeno-codex-"));
  const outputFile = path.join(tempDir, "reply.txt");

  try {
    const result = await new Promise<{ stderr: string; stdout: string }>((resolve, reject) => {
      const child = spawn(getCodexBin(), getCodexArgs(outputFile), {
        cwd: process.env.XENO_CODEX_WORKDIR?.trim() || process.cwd(),
        env: getCodexChildEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Codex timed out after ${getTimeoutMs()}ms.`));
      }, getTimeoutMs());

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ stderr, stdout });
          return;
        }
        reject(new Error(`Codex exited with ${code ?? "unknown"}: ${stderr || stdout}`));
      });
      child.stdin.end(prompt);
    });

    const finalMessage = (
      (await readFile(outputFile, "utf8").catch(() => "")) || result.stdout
    ).trim();
    if (!finalMessage) {
      throw new Error(`Codex completed without a final message. ${result.stderr}`.trim());
    }
    return finalMessage;
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

const withWorkerTag = (text: string, workerTag = DEFAULT_WORKER_TAG) => {
  const trimmed = text.trim();
  if (trimmed.startsWith(workerTag) || trimmed.startsWith("[Supervisor Xeno]")) {
    return trimmed;
  }
  return `${workerTag}\n${trimmed.replace(/^\[(Reply|PM|Canvas|F6S Registration) Xeno\]\s*/, "")}`;
};

export function createXenoSlackAgent(): XenoSlackAgentPort {
  return {
    async respondToMessage(source: XenoSlackSource): Promise<XenoSlackAgentResponse> {
      const dispatch = dispatchXenoSlackEvent(source);
      const prompt = buildXenoCodexPrompt(source);
      const text = await runCodex(prompt);

      return {
        kind: "codex_task",
        text: withWorkerTag(
          text || "Xeno here. Codex ran, but it did not return a usable Slack reply.",
          dispatch.requiredTag,
        ),
      };
    },
  };
}
