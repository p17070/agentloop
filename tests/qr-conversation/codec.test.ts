import { describe, it, expect } from "vitest";
import { encode, decode } from "../../src/qr-conversation/codec.js";
import {
  type Conversation,
  Mode,
  TextEncoding,
  EventType,
  QR_CAPACITY,
} from "../../src/qr-conversation/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    version: 1,
    mode: Mode.Duo,
    textEncoding: TextEncoding.Utf8,
    participants: [
      { name: "alice", active: true },
      { name: "bob", active: true },
    ],
    entries: [
      { kind: "event", event: EventType.Enter, participant: 0 },
      { kind: "event", event: EventType.Enter, participant: 1 },
      { kind: "message", speaker: 0, text: "hey bob" },
      { kind: "message", speaker: 1, text: "hi alice!" },
      { kind: "message", speaker: 0, text: "how are you?" },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Round-trip tests
// ---------------------------------------------------------------------------

describe("codec round-trip", () => {
  it("encodes and decodes a basic duo conversation", () => {
    const conv = makeConversation();
    const bytes = encode(conv);
    const decoded = decode(bytes);

    expect(decoded.version).toBe(conv.version);
    expect(decoded.mode).toBe(Mode.Duo);
    expect(decoded.textEncoding).toBe(TextEncoding.Utf8);
    expect(decoded.participants.length).toBe(2);
    expect(decoded.participants[0].name).toBe("alice");
    expect(decoded.participants[1].name).toBe("bob");
    expect(decoded.entries.length).toBe(5);

    // Check messages
    const messages = decoded.entries.filter((e) => e.kind === "message");
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ kind: "message", speaker: 0, text: "hey bob" });
    expect(messages[1]).toEqual({ kind: "message", speaker: 1, text: "hi alice!" });
    expect(messages[2]).toEqual({ kind: "message", speaker: 0, text: "how are you?" });
  });

  it("encodes and decodes system events", () => {
    const conv = makeConversation();
    const bytes = encode(conv);
    const decoded = decode(bytes);

    const events = decoded.entries.filter((e) => e.kind === "event");
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ kind: "event", event: EventType.Enter, participant: 0 });
    expect(events[1]).toEqual({ kind: "event", event: EventType.Enter, participant: 1 });
  });

  it("round-trips with 6-bit text encoding", () => {
    const conv = makeConversation({ textEncoding: TextEncoding.SixBit });
    const bytes = encode(conv, { textEncoding: TextEncoding.SixBit });
    const decoded = decode(bytes);

    expect(decoded.textEncoding).toBe(TextEncoding.SixBit);
    const messages = decoded.entries.filter((e) => e.kind === "message");
    expect(messages[0]).toEqual({ kind: "message", speaker: 0, text: "hey bob" });
    expect(messages[1]).toEqual({ kind: "message", speaker: 1, text: "hi alice!" });
  });

  it("6-bit encoding produces smaller output than UTF-8 for lowercase text", () => {
    const conv = makeConversation();
    const utf8Bytes = encode(conv, { textEncoding: TextEncoding.Utf8 });
    const sixBitBytes = encode(conv, { textEncoding: TextEncoding.SixBit });

    expect(sixBitBytes.length).toBeLessThan(utf8Bytes.length);
  });

  it("round-trips group mode conversations", () => {
    const conv: Conversation = {
      version: 1,
      mode: Mode.Group,
      textEncoding: TextEncoding.Utf8,
      participants: [
        { name: "alice", active: true },
        { name: "bob", active: true },
        { name: "charlie", active: true },
      ],
      entries: [
        { kind: "event", event: EventType.Enter, participant: 0 },
        { kind: "event", event: EventType.Enter, participant: 1 },
        { kind: "event", event: EventType.Enter, participant: 2 },
        { kind: "message", speaker: 0, text: "hey everyone" },
        { kind: "message", speaker: 2, text: "hi alice" },
        { kind: "message", speaker: 1, text: "hello" },
      ],
    };

    const bytes = encode(conv);
    const decoded = decode(bytes);

    expect(decoded.mode).toBe(Mode.Group);
    expect(decoded.participants.length).toBe(3);
    const msgs = decoded.entries.filter((e) => e.kind === "message");
    expect(msgs[0]).toEqual({ kind: "message", speaker: 0, text: "hey everyone" });
    expect(msgs[1]).toEqual({ kind: "message", speaker: 2, text: "hi alice" });
    expect(msgs[2]).toEqual({ kind: "message", speaker: 1, text: "hello" });
  });

  it("round-trips enter and exit events in sequence", () => {
    const conv: Conversation = {
      version: 1,
      mode: Mode.Duo,
      textEncoding: TextEncoding.Utf8,
      participants: [
        { name: "alice", active: true },
        { name: "bob", active: false },
      ],
      entries: [
        { kind: "event", event: EventType.Enter, participant: 0 },
        { kind: "event", event: EventType.Enter, participant: 1 },
        { kind: "message", speaker: 0, text: "hello" },
        { kind: "message", speaker: 1, text: "bye" },
        { kind: "event", event: EventType.Exit, participant: 1 },
        { kind: "message", speaker: 0, text: "oh well" },
      ],
    };

    const bytes = encode(conv);
    const decoded = decode(bytes);

    expect(decoded.entries.length).toBe(6);
    expect(decoded.entries[4]).toEqual({
      kind: "event",
      event: EventType.Exit,
      participant: 1,
    });
    // Bob should be inactive after replay
    expect(decoded.participants[1].active).toBe(false);
    // Alice should be active
    expect(decoded.participants[0].active).toBe(true);
  });

  it("handles empty conversation (no messages, only events)", () => {
    const conv: Conversation = {
      version: 1,
      mode: Mode.Duo,
      textEncoding: TextEncoding.Utf8,
      participants: [{ name: "alice", active: true }],
      entries: [{ kind: "event", event: EventType.Enter, participant: 0 }],
    };

    const bytes = encode(conv);
    const decoded = decode(bytes);

    expect(decoded.participants.length).toBe(1);
    expect(decoded.entries.length).toBe(1);
    expect(decoded.entries[0]).toEqual({
      kind: "event",
      event: EventType.Enter,
      participant: 0,
    });
  });

  it("handles same speaker sending consecutive messages (duo mode)", () => {
    const conv: Conversation = {
      version: 1,
      mode: Mode.Duo,
      textEncoding: TextEncoding.Utf8,
      participants: [
        { name: "alice", active: true },
        { name: "bob", active: true },
      ],
      entries: [
        { kind: "event", event: EventType.Enter, participant: 0 },
        { kind: "event", event: EventType.Enter, participant: 1 },
        { kind: "message", speaker: 0, text: "hey" },
        { kind: "message", speaker: 0, text: "you there?" },
        { kind: "message", speaker: 0, text: "hello??" },
        { kind: "message", speaker: 1, text: "sorry, was afk" },
      ],
    };

    const bytes = encode(conv);
    const decoded = decode(bytes);

    const msgs = decoded.entries.filter((e) => e.kind === "message");
    expect(msgs[0]).toEqual({ kind: "message", speaker: 0, text: "hey" });
    expect(msgs[1]).toEqual({ kind: "message", speaker: 0, text: "you there?" });
    expect(msgs[2]).toEqual({ kind: "message", speaker: 0, text: "hello??" });
    expect(msgs[3]).toEqual({ kind: "message", speaker: 1, text: "sorry, was afk" });
  });
});

// ---------------------------------------------------------------------------
// Size / compactness
// ---------------------------------------------------------------------------

describe("codec compactness", () => {
  it("encodes a minimal conversation in under 30 bytes", () => {
    const conv: Conversation = {
      version: 1,
      mode: Mode.Duo,
      textEncoding: TextEncoding.Utf8,
      participants: [
        { name: "a", active: true },
        { name: "b", active: true },
      ],
      entries: [
        { kind: "message", speaker: 0, text: "hi" },
        { kind: "message", speaker: 1, text: "yo" },
      ],
    };

    const bytes = encode(conv);
    expect(bytes.length).toBeLessThan(30);
  });

  it("fits 50+ short messages in under 2953 bytes (QR v40-L)", () => {
    const conv: Conversation = {
      version: 1,
      mode: Mode.Duo,
      textEncoding: TextEncoding.Utf8,
      participants: [
        { name: "alice", active: true },
        { name: "bob", active: true },
      ],
      entries: [],
    };

    // Add 50 alternating messages
    for (let i = 0; i < 50; i++) {
      conv.entries.push({
        kind: "message",
        speaker: i % 2,
        text: `message number ${i + 1} from ${i % 2 === 0 ? "alice" : "bob"}`,
      });
    }

    const bytes = encode(conv);
    expect(bytes.length).toBeLessThanOrEqual(QR_CAPACITY.L);
  });

  it("header byte packs version, mode, encoding, and participant hint", () => {
    const conv = makeConversation();
    const bytes = encode(conv);

    const header = bytes[0];
    const version = (header >>> 6) & 0x03;
    const mode = (header >>> 4) & 0x03;
    const textEnc = (header >>> 2) & 0x03;
    const ppHint = header & 0x03;

    expect(version).toBe(1);
    expect(mode).toBe(Mode.Duo);
    expect(textEnc).toBe(TextEncoding.Utf8);
    expect(ppHint).toBe(2); // 2 participants fits in hint
  });
});

// ---------------------------------------------------------------------------
// Truncation / overflow
// ---------------------------------------------------------------------------

describe("overflow truncation", () => {
  it("truncates oldest messages when exceeding maxBytes", () => {
    const conv: Conversation = {
      version: 1,
      mode: Mode.Duo,
      textEncoding: TextEncoding.Utf8,
      participants: [
        { name: "alice", active: true },
        { name: "bob", active: true },
      ],
      entries: [],
    };

    // Add lots of messages to exceed a small limit
    for (let i = 0; i < 100; i++) {
      conv.entries.push({
        kind: "message",
        speaker: i % 2,
        text: `this is message number ${i + 1} with some padding text`,
      });
    }

    // Force a small max size
    const bytes = encode(conv, { maxBytes: 500 });
    expect(bytes.length).toBeLessThanOrEqual(500);

    // Decode and verify it's a valid conversation with fewer messages
    const decoded = decode(bytes);
    expect(decoded.entries.length).toBeLessThan(100);
    expect(decoded.entries.length).toBeGreaterThan(0);

    // The LAST message should be preserved (truncation removes oldest)
    const lastMsg = decoded.entries.filter((e) => e.kind === "message").pop();
    expect(lastMsg).toBeDefined();
    if (lastMsg && lastMsg.kind === "message") {
      expect(lastMsg.text).toContain("100");
    }
  });
});
