import crypto from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildXenoCodexPrompt } from "@/lib/ai/xeno-slack-agent";
import { verifySlackRequest } from "@/lib/slack/signature";
import {
  getXenoSlackSource,
  isAllowedXenoSource,
  parseAllowedChannelIds,
  parseSlackXenoPayload,
} from "@/lib/slack/xeno-events";
import { dispatchXenoSlackEvent } from "@/lib/xeno/dispatcher";
import {
  buildSlackIdempotencyKey,
  createMemoryMatterLedger,
} from "@/lib/xeno/matter-ledger";
import { validateXenoPostIntent } from "@/lib/xeno/post-gateway";
import { processXenoSlackPayload } from "@/lib/xeno/slack-event-processor";

const sign = (body: string, secret: string, timestamp: number) => {
  const base = `v0:${timestamp}:${body}`;
  return `v0=${crypto.createHmac("sha256", secret).update(base).digest("hex")}`;
};

describe("verifySlackRequest", () => {
  it("accepts a valid Slack signature", () => {
    const body = JSON.stringify({ type: "event_callback" });
    const timestamp = 1_800_000_000;
    const secret = "test-slack-secret";
    const headers = new Headers({
      "x-slack-request-timestamp": String(timestamp),
      "x-slack-signature": sign(body, secret, timestamp),
    });

    expect(verifySlackRequest(headers, body, secret, timestamp)).toEqual({ ok: true });
  });

  it("rejects stale Slack requests", () => {
    const body = JSON.stringify({ type: "event_callback" });
    const timestamp = 1_800_000_000;
    const secret = "test-slack-secret";
    const headers = new Headers({
      "x-slack-request-timestamp": String(timestamp),
      "x-slack-signature": sign(body, secret, timestamp),
    });

    expect(verifySlackRequest(headers, body, secret, timestamp + 301)).toMatchObject({
      code: "STALE_REQUEST",
      ok: false,
      status: 401,
    });
  });
});

describe("Slack Xeno event parsing", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("parses Slack URL verification payloads", () => {
    const parsed = parseSlackXenoPayload(
      JSON.stringify({
        challenge: "challenge-value",
        type: "url_verification",
      }),
    );

    expect(parsed).toEqual({
      payload: {
        challenge: "challenge-value",
        type: "url_verification",
      },
      success: true,
    });
  });

  it("normalizes app mention events into Xeno sources", () => {
    const parsed = parseSlackXenoPayload(
      JSON.stringify({
        event: {
          channel: "C123",
          text: "<@U_XENO> introduce yourself",
          ts: "1700000000.000100",
          type: "app_mention",
          user: "U_ABE",
        },
        event_id: "Ev123",
        team_id: "T123",
        type: "event_callback",
      }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(getXenoSlackSource(parsed.payload, "U_XENO")).toMatchObject({
      channelId: "C123",
      eventId: "Ev123",
      isDirectMessage: false,
      messageTs: "1700000000.000100",
      teamId: "T123",
      text: "introduce yourself",
      threadTs: "1700000000.000100",
      userId: "U_ABE",
    });
  });

  it("ignores ordinary channel chatter", () => {
    const parsed = parseSlackXenoPayload(
      JSON.stringify({
        event: {
          channel: "C123",
          text: "normal launch chatter",
          ts: "1700000000.000100",
          type: "message",
          user: "U_ABE",
        },
        type: "event_callback",
      }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(getXenoSlackSource(parsed.payload, "U_XENO")).toBeNull();
  });

  it("does not wake on incidental or negated xeno text", () => {
    const parsed = parseSlackXenoPayload(
      JSON.stringify({
        event: {
          channel: "C123",
          text: "this is a non-xeno smoke test",
          ts: "1700000000.000100",
          type: "message",
          user: "U_ABE",
        },
        type: "event_callback",
      }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(getXenoSlackSource(parsed.payload, "U_XENO")).toBeNull();
  });

  it("treats direct xeno commands as Xeno sources", () => {
    const parsed = parseSlackXenoPayload(
      JSON.stringify({
        event: {
          channel: "C0B4S6V22LE",
          text: "Xeno, please fill Owner A profile",
          ts: "1700000000.000100",
          type: "message",
          user: "U_ABE",
        },
        event_id: "EvDirect",
        team_id: "T123",
        type: "event_callback",
      }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(getXenoSlackSource(parsed.payload, "U_XENO")).toMatchObject({
      channelId: "C0B4S6V22LE",
      eventId: "EvDirect",
      text: "Xeno, please fill Owner A profile",
    });
  });

  it("treats explicit command tags as Xeno sources", () => {
    const parsed = parseSlackXenoPayload(
      JSON.stringify({
        event: {
          channel: "C0B4S6V22LE",
          text: "[F6S] please fill Owner A profile",
          ts: "1700000000.000100",
          type: "message",
          user: "U_ABE",
        },
        event_id: "EvTagged",
        team_id: "T123",
        type: "event_callback",
      }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(getXenoSlackSource(parsed.payload, "U_XENO")).toMatchObject({
      channelId: "C0B4S6V22LE",
      eventId: "EvTagged",
      text: "[F6S] please fill Owner A profile",
    });
  });

  it("treats HR outreach command tags as Xeno sources", () => {
    const parsed = parseSlackXenoPayload(
      JSON.stringify({
        event: {
          channel: "C0B4CQDASP9",
          text: "[HR Outreach] run the Gmail workflow for these recipients",
          ts: "1700000000.000100",
          type: "message",
          user: "U_ABE",
        },
        event_id: "EvHrOutreach",
        team_id: "T123",
        type: "event_callback",
      }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(getXenoSlackSource(parsed.payload, "U_XENO")).toMatchObject({
      channelId: "C0B4CQDASP9",
      eventId: "EvHrOutreach",
      text: "[HR Outreach] run the Gmail workflow for these recipients",
    });
  });

  it("restricts Xeno to configured Slack channels while still allowing DMs", () => {
    const allowed = parseAllowedChannelIds("C_WEAVE_X, C_OTHER");
    const source = {
      channelId: "C_WEAVE_X",
      isDirectMessage: false,
      messageTs: "1700000000.000100",
      text: "help with q9",
      userId: "U_USER",
    };

    expect(isAllowedXenoSource(source, allowed)).toBe(true);
    expect(isAllowedXenoSource({ ...source, channelId: "C_RANDOM" }, allowed)).toBe(false);
    expect(
      isAllowedXenoSource({ ...source, channelId: "D123", isDirectMessage: true }, allowed),
    ).toBe(true);
    expect(
      isAllowedXenoSource({ ...source, channelId: "D123", isDirectMessage: true }, allowed, false),
    ).toBe(false);
  });

  it("builds a Codex prompt with WEAVE X context for the application channel", () => {
    vi.stubEnv("WEAVE_X_CONTEXT", "injected-test-context: circularity programme details");

    const prompt = buildXenoCodexPrompt({
      channelId: "C0B4S6V22LE",
      eventId: "Ev123",
      isDirectMessage: false,
      messageTs: "1700000000.000100",
      text: "Improve the Q10 draft",
      threadTs: "1700000000.000100",
      userId: "U_USER",
    });

    expect(prompt).toContain("local Codex CLI harness");
    expect(prompt).toContain("[Reply Xeno]");
    expect(prompt).toContain("Current event context capsule");
    expect(prompt).toContain("Matter: weavex:f6s:2026");
    expect(prompt).toContain("injected-test-context: circularity programme details");
    // Owner map is now in WEAVE_X_SUPPLEMENTAL_CONTEXT env var (loaded from .env.local
    // when running the socket bridge locally; not present in CI or on Vercel).
  });

  it("uses the neutral fallback when WEAVE_X_CONTEXT is empty", () => {
    vi.stubEnv("WEAVE_X_CONTEXT", "");

    const prompt = buildXenoCodexPrompt({
      channelId: "C0B4S6V22LE",
      eventId: "EvFallback",
      isDirectMessage: false,
      messageTs: "1700000000.000100",
      text: "Improve the Q10 draft",
      threadTs: "1700000000.000100",
      userId: "U_USER",
    });

    expect(prompt).toContain("Weave X is a circularity consulting programme.");
  });

  it("uses the lane-specific worker tag in F6S prompts", () => {
    const prompt = buildXenoCodexPrompt({
      channelId: "C0B4S6V22LE",
      eventId: "EvF6S",
      isDirectMessage: false,
      messageTs: "1700000000.000200",
      text: "[F6S] help with Owner A profile",
      threadTs: "1700000000.000200",
      userId: "U_ABE",
    });

    expect(prompt).toContain('Start every Slack reply with "[F6S Registration Xeno]"');
  });

  it("builds a Codex prompt with HR Gmail outreach workflow context", () => {
    const prompt = buildXenoCodexPrompt({
      channelId: "C0B4CQDASP9",
      eventId: "EvHrPrompt",
      isDirectMessage: false,
      messageTs: "1700000000.000250",
      text: "[HR Outreach] create the primary and follow-up Gmail workflow",
      threadTs: "1700000000.000250",
      userId: "U_ABE",
    });

    expect(prompt).toContain('Start every Slack reply with "[HR Outreach Xeno]"');
    expect(prompt).toContain("FTT HR outreach Gmail workflow");
    expect(prompt).toContain("Workflow Builder custom step + Google Mail connector");
    expect(prompt).toContain("Multiple recipients are allowed");
    expect(prompt).toContain("Follow-up email");
  });

  it("includes hydrated Slack thread context in Codex prompts", () => {
    const prompt = buildXenoCodexPrompt({
      channelId: "C0B4S6V22LE",
      eventId: "EvReply",
      isDirectMessage: false,
      messageTs: "1700000000.000200",
      text: "could you do my original ask?",
      threadContext: {
        channelId: "C0B4S6V22LE",
        messages: [
          {
            text: "<@U_XENO> create a full MoM and action points from today's two Notion meeting notes",
            ts: "1700000000.000100",
            userId: "U_ABE",
          },
          {
            botId: "B_XENO",
            text: "[Reply Xeno] I am active now.",
            ts: "1700000000.000150",
          },
        ],
        threadTs: "1700000000.000100",
      },
      threadTs: "1700000000.000100",
      userId: "U_ABE",
    });

    expect(prompt).toContain("Use Slack thread context to resolve references");
    expect(prompt).toContain("Slack thread context, oldest to newest");
    expect(prompt).toContain("create a full MoM and action points");
    expect(prompt).toContain("could you do my original ask?");
  });
});

describe("Xeno control plane", () => {
  const source = {
    channelId: "C0B4S6V22LE",
    eventId: "Ev123",
    isDirectMessage: false,
    messageTs: "1700000000.000100",
    teamId: "T123",
    text: "[F6S] please fill Owner A profile",
    threadTs: "1700000000.000100",
    userId: "U_ABE",
  };

  it("routes tagged F6S profile requests to the F6S lane", () => {
    expect(dispatchXenoSlackEvent(source)).toMatchObject({
      allowedToAutoPost: true,
      lane: "f6s_profile",
      matterId: "weavex:f6s:2026",
      requiredTag: "[F6S Registration Xeno]",
      shouldProcess: true,
    });
  });

  it("routes HR Gmail workflow requests to the HR outreach lane", () => {
    expect(
      dispatchXenoSlackEvent({
        ...source,
        channelId: "C0B4CQDASP9",
        text: "[Gmail] create the HR outreach workflow with multiple recipients",
      }),
    ).toMatchObject({
      allowedToAutoPost: true,
      lane: "hr_outreach",
      matterId: "general:ftt",
      requiredTag: "[HR Outreach Xeno]",
      shouldProcess: true,
    });
  });

  it("blocks automated handling for human-only final F6S actions", () => {
    expect(
      dispatchXenoSlackEvent({
        ...source,
        text: "[F6S] connect with Owner B and submit",
      }),
    ).toMatchObject({
      allowedToAutoPost: false,
      humanFinalActionRequested: true,
      reason: "human_final_action_must_not_be_automated",
    });
  });

  it("uses hydrated thread text to route context-reference replies", () => {
    expect(
      dispatchXenoSlackEvent({
        ...source,
        text: "could you do my original ask?",
        threadContext: {
          channelId: "C0B4S6V22LE",
          messages: [
            {
              text: "<@U_XENO> create a full MoM and action points from today's two Notion meeting notes",
              ts: "1700000000.000100",
              userId: "U_ABE",
            },
          ],
          threadTs: "1700000000.000100",
        },
      }),
    ).toMatchObject({
      lane: "canvas",
      requiredTag: "[Canvas Xeno]",
    });
  });

  it("blocks referenced human-only final actions from hydrated thread text", () => {
    expect(
      dispatchXenoSlackEvent({
        ...source,
        text: "please do the original ask",
        threadContext: {
          channelId: "C0B4S6V22LE",
          messages: [
            {
              text: "<@U_XENO> connect with Owner B and submit",
              ts: "1700000000.000100",
              userId: "U_ABE",
            },
          ],
          threadTs: "1700000000.000100",
        },
      }),
    ).toMatchObject({
      allowedToAutoPost: false,
      humanFinalActionRequested: true,
    });
  });

  it("deduplicates Slack events by idempotency key", () => {
    const ledger = createMemoryMatterLedger();
    const dispatch = dispatchXenoSlackEvent(source);
    const idempotencyKey = buildSlackIdempotencyKey(source, dispatch.lane);
    const event = {
      idempotencyKey,
      lane: dispatch.lane,
      matterId: dispatch.matterId,
      receivedAt: "2026-05-31T09:31:45Z",
      source,
    };

    expect(ledger.recordEvent(event)).toBe(true);
    expect(ledger.recordEvent(event)).toBe(false);
    expect(ledger.hasProcessed(idempotencyKey)).toBe(true);
  });

  it("deduplicates app_mention and message.channel callbacks for the same Slack message", () => {
    const ledger = createMemoryMatterLedger();
    const first = buildSlackIdempotencyKey(
      { ...source, eventId: "EvAppMention" },
      "f6s_profile",
    );
    const second = buildSlackIdempotencyKey(
      { ...source, eventId: "EvMessageChannel" },
      "f6s_profile",
    );

    expect(first).toBe(second);
    expect(
      ledger.recordEvent({
        idempotencyKey: first,
        lane: "f6s_profile",
        matterId: "weavex:f6s:2026",
        receivedAt: "2026-05-31T12:00:00Z",
        source: { ...source, eventId: "EvAppMention" },
      }),
    ).toBe(true);
    expect(
      ledger.recordEvent({
        idempotencyKey: second,
        lane: "f6s_profile",
        matterId: "weavex:f6s:2026",
        receivedAt: "2026-05-31T12:00:01Z",
        source: { ...source, eventId: "EvMessageChannel" },
      }),
    ).toBe(false);
  });

  it("rejects Slack posts without a verified Xeno identity, thread, tag, or source basis", () => {
    expect(
      validateXenoPostIntent({
        channelId: "C0B4S6V22LE",
        idempotencyKey: "",
        identityVerified: false,
        lane: "f6s_profile",
        matterId: "weavex:f6s:2026",
        sourceBasis: "",
        text: "[Reply Xeno] wrong lane tag",
        threadTs: "",
      }),
    ).toEqual({
      errors: [
        "xeno_bot_identity_not_verified",
        "missing_thread",
        "missing_idempotency_key",
        "missing_source_basis",
        "missing_or_wrong_worker_tag",
      ],
      ok: false,
    });
  });

  it("queues a live Slack event through the shared control-plane processor", async () => {
    const ledger = createMemoryMatterLedger();
    const posts: Array<{ channelId: string; text: string; threadTs?: string | null }> = [];
    const tasks: Array<Promise<void>> = [];

    const result = processXenoSlackPayload(
      {
        event: {
          channel: "C0B4S6V22LE",
          text: "[F6S] please map Owner A profile fields",
          ts: "1700000000.000300",
          type: "message",
          user: "U_ABE",
        },
        event_id: "EvSocket",
        team_id: "T123",
        type: "event_callback",
      },
      {
        allowDirectMessages: false,
        allowedChannelIds: new Set(["C0B4S6V22LE"]),
        botUserId: "U_XENO",
        createAgent: () => ({
          async respondToMessage() {
            return {
              kind: "codex_task",
              text: "[F6S Registration Xeno]\nMapped the profile fields; final submit remains human-only.",
            };
          },
        }),
        createSlack: () => ({
          async postMessage(message) {
            posts.push(message);
            return { ok: true, ts: "1700000000.000400" };
          },
        }),
        enabled: true,
        hasSlackReplyTransport: true,
        ledger,
        now: () => "2026-05-31T09:31:45Z",
        schedule: (task) => {
          tasks.push(task());
        },
        verifyIdentity: async () => true,
      },
    );

    expect(result).toMatchObject({
      lane: "f6s_profile",
      matterId: "weavex:f6s:2026",
      ok: true,
      queued: true,
    });

    await Promise.all(tasks);

    expect(posts).toEqual([
      {
        channelId: "C0B4S6V22LE",
        text: "[F6S Registration Xeno]\nMapped the profile fields; final submit remains human-only.",
        threadTs: "1700000000.000300",
      },
    ]);
    expect(ledger.snapshot("weavex:f6s:2026").actions).toMatchObject([
      {
        lane: "f6s_profile",
        postedTs: "1700000000.000400",
        type: "post",
      },
    ]);
  });

  it("hydrates thread context before invoking the agent", async () => {
    const ledger = createMemoryMatterLedger();
    const posts: Array<{ channelId: string; text: string; threadTs?: string | null }> = [];
    const tasks: Array<Promise<void>> = [];
    let seenText = "";

    const result = processXenoSlackPayload(
      {
        event: {
          channel: "C0B4S6V22LE",
          text: "<@U_XENO> could you do my original ask?",
          thread_ts: "1700000000.000100",
          ts: "1700000000.000300",
          type: "app_mention",
          user: "U_ABE",
        },
        event_id: "EvOriginalAsk",
        team_id: "T123",
        type: "event_callback",
      },
      {
        allowDirectMessages: false,
        allowedChannelIds: new Set(["C0B4S6V22LE"]),
        botUserId: "U_XENO",
        createAgent: () => ({
          async respondToMessage(source) {
            seenText = source.threadContext?.messages[0]?.text ?? "";
            return {
              kind: "codex_task",
              text: "[Canvas Xeno]\nI can now see the original ask from the parent thread.",
            };
          },
        }),
        createSlack: () => ({
          async postMessage(message) {
            posts.push(message);
            return { ok: true, ts: "1700000000.000400" };
          },
        }),
        createThreadReader: () => ({
          async getThread() {
            return {
              context: {
                channelId: "C0B4S6V22LE",
                messages: [
                  {
                    text: "<@U_XENO> create a full MoM and action points from today's two Notion meeting notes",
                    ts: "1700000000.000100",
                    userId: "U_ABE",
                  },
                  {
                    text: "<@U_XENO> could you do my original ask?",
                    ts: "1700000000.000300",
                    userId: "U_ABE",
                  },
                ],
                threadTs: "1700000000.000100",
              },
              ok: true,
            };
          },
        }),
        enabled: true,
        hasSlackReplyTransport: true,
        hydrateThreadContext: true,
        ledger,
        schedule: (task) => {
          tasks.push(task());
        },
        verifyIdentity: async () => true,
      },
    );

    expect(result).toMatchObject({
      lane: "reply",
      ok: true,
      queued: true,
    });

    await Promise.all(tasks);

    expect(seenText).toContain("create a full MoM");
    expect(posts).toEqual([
      {
        channelId: "C0B4S6V22LE",
        text: "[Canvas Xeno]\nI can now see the original ask from the parent thread.",
        threadTs: "1700000000.000100",
      },
    ]);
    expect(ledger.snapshot("weavex:f6s:2026").actions.at(-1)).toMatchObject({
      lane: "canvas",
      postedTs: "1700000000.000400",
      type: "post",
    });
  });
});
