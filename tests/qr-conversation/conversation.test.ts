import { describe, it, expect } from "vitest";
import {
  create,
  join,
  addMessage,
  leave,
  toBytes,
  fromBytes,
  summarize,
  remainingCapacity,
} from "../../src/qr-conversation/conversation.js";
import { Mode, TextEncoding, EventType } from "../../src/qr-conversation/types.js";

// ---------------------------------------------------------------------------
// create()
// ---------------------------------------------------------------------------

describe("create", () => {
  it("creates a conversation with one participant", () => {
    const conv = create("alice");
    expect(conv.participants).toHaveLength(1);
    expect(conv.participants[0].name).toBe("alice");
    expect(conv.participants[0].active).toBe(true);
  });

  it("starts in duo mode", () => {
    const conv = create("alice");
    expect(conv.mode).toBe(Mode.Duo);
  });

  it("has an initial enter event", () => {
    const conv = create("alice");
    expect(conv.entries).toHaveLength(1);
    expect(conv.entries[0]).toEqual({
      kind: "event",
      event: EventType.Enter,
      participant: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// join()
// ---------------------------------------------------------------------------

describe("join", () => {
  it("adds a second participant", () => {
    const conv = create("alice");
    const bobIdx = join(conv, "bob");

    expect(bobIdx).toBe(1);
    expect(conv.participants).toHaveLength(2);
    expect(conv.participants[1].name).toBe("bob");
    expect(conv.participants[1].active).toBe(true);
  });

  it("records an enter event", () => {
    const conv = create("alice");
    join(conv, "bob");

    const lastEntry = conv.entries[conv.entries.length - 1];
    expect(lastEntry).toEqual({
      kind: "event",
      event: EventType.Enter,
      participant: 1,
    });
  });

  it("upgrades to group mode when 3rd participant joins", () => {
    const conv = create("alice");
    join(conv, "bob");
    expect(conv.mode).toBe(Mode.Duo);

    join(conv, "charlie");
    expect(conv.mode).toBe(Mode.Group);
    expect(conv.participants).toHaveLength(3);
  });

  it("allows rejoining with the same name", () => {
    const conv = create("alice");
    const bobIdx = join(conv, "bob");
    leave(conv, bobIdx);

    // Bob rejoins
    const bobIdx2 = join(conv, "bob");
    expect(bobIdx2).toBe(bobIdx); // same index
    expect(conv.participants[bobIdx2].active).toBe(true);
  });

  it("rejoin is case-insensitive", () => {
    const conv = create("alice");
    const bobIdx = join(conv, "bob");
    leave(conv, bobIdx);

    const bobIdx2 = join(conv, "Bob");
    expect(bobIdx2).toBe(bobIdx);
  });
});

// ---------------------------------------------------------------------------
// addMessage()
// ---------------------------------------------------------------------------

describe("addMessage", () => {
  it("adds a message to the conversation", () => {
    const conv = create("alice");
    const bobIdx = join(conv, "bob");

    addMessage(conv, bobIdx, "hello alice!");

    const msgs = conv.entries.filter((e) => e.kind === "message");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({
      kind: "message",
      speaker: bobIdx,
      text: "hello alice!",
    });
  });

  it("throws on invalid speaker index", () => {
    const conv = create("alice");
    expect(() => addMessage(conv, 5, "test")).toThrow(RangeError);
  });

  it("throws when speaker has exited", () => {
    const conv = create("alice");
    const bobIdx = join(conv, "bob");
    leave(conv, bobIdx);

    expect(() => addMessage(conv, bobIdx, "test")).toThrow(/exited/);
  });

  it("throws on empty message text", () => {
    const conv = create("alice");
    expect(() => addMessage(conv, 0, "")).toThrow(/empty/);
  });
});

// ---------------------------------------------------------------------------
// leave()
// ---------------------------------------------------------------------------

describe("leave", () => {
  it("marks participant as inactive", () => {
    const conv = create("alice");
    const bobIdx = join(conv, "bob");
    leave(conv, bobIdx);

    expect(conv.participants[bobIdx].active).toBe(false);
  });

  it("records an exit event", () => {
    const conv = create("alice");
    const bobIdx = join(conv, "bob");
    leave(conv, bobIdx);

    const lastEntry = conv.entries[conv.entries.length - 1];
    expect(lastEntry).toEqual({
      kind: "event",
      event: EventType.Exit,
      participant: bobIdx,
    });
  });

  it("throws on invalid participant index", () => {
    const conv = create("alice");
    expect(() => leave(conv, 99)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Full round-trip: create → join → chat → encode → decode
// ---------------------------------------------------------------------------

describe("full workflow round-trip", () => {
  it("round-trips a complete conversation", () => {
    // Alice creates
    const conv = create("alice");

    // Bob joins
    const bobIdx = join(conv, "bob");

    // They chat
    addMessage(conv, bobIdx, "hey alice!");
    addMessage(conv, 0, "hi bob, what's up?");
    addMessage(conv, bobIdx, "not much, just testing qr codes");
    addMessage(conv, 0, "cool, me too!");

    // Encode to bytes
    const bytes = toBytes(conv);

    // Decode (as if scanned from QR)
    const restored = fromBytes(bytes);

    // Verify everything matches
    expect(restored.participants.length).toBe(2);
    expect(restored.participants[0].name).toBe("alice");
    expect(restored.participants[1].name).toBe("bob");

    const msgs = restored.entries.filter((e) => e.kind === "message");
    expect(msgs).toHaveLength(4);
    expect(msgs[0]).toEqual({ kind: "message", speaker: 1, text: "hey alice!" });
    expect(msgs[1]).toEqual({ kind: "message", speaker: 0, text: "hi bob, what's up?" });
    expect(msgs[2]).toEqual({
      kind: "message",
      speaker: 1,
      text: "not much, just testing qr codes",
    });
    expect(msgs[3]).toEqual({ kind: "message", speaker: 0, text: "cool, me too!" });
  });

  it("round-trips with participant leaving and rejoining", () => {
    const conv = create("alice");
    const bobIdx = join(conv, "bob");

    addMessage(conv, bobIdx, "brb");
    leave(conv, bobIdx);

    addMessage(conv, 0, "ok");

    // Bob rejoins
    const bobIdx2 = join(conv, "bob");
    addMessage(conv, bobIdx2, "back!");

    const bytes = toBytes(conv);
    const restored = fromBytes(bytes);

    const msgs = restored.entries.filter((e) => e.kind === "message");
    expect(msgs).toHaveLength(3);
    expect(msgs[2]).toEqual({ kind: "message", speaker: 1, text: "back!" });
    expect(restored.participants[1].active).toBe(true);
  });

  it("round-trips a group conversation", () => {
    const conv = create("alice");
    const bob = join(conv, "bob");
    const charlie = join(conv, "charlie");

    addMessage(conv, 0, "welcome everyone");
    addMessage(conv, bob, "thanks");
    addMessage(conv, charlie, "hey!");

    const bytes = toBytes(conv);
    const restored = fromBytes(bytes);

    expect(restored.mode).toBe(Mode.Group);
    expect(restored.participants.length).toBe(3);
    const msgs = restored.entries.filter((e) => e.kind === "message");
    expect(msgs[2]).toEqual({ kind: "message", speaker: 2, text: "hey!" });
  });

  it("auto-selects 6-bit encoding for lowercase conversations", () => {
    const conv = create("alice");
    join(conv, "bob");

    addMessage(conv, 0, "hey, how are you?");
    addMessage(conv, 1, "good, you?");
    addMessage(conv, 0, "not bad. what are you up to?");
    addMessage(conv, 1, "just coding some stuff");

    const bytes = toBytes(conv);
    const restored = fromBytes(bytes);

    expect(restored.textEncoding).toBe(TextEncoding.SixBit);
    const msgs = restored.entries.filter((e) => e.kind === "message");
    expect(msgs[0]).toEqual({ kind: "message", speaker: 0, text: "hey, how are you?" });
  });
});

// ---------------------------------------------------------------------------
// summarize()
// ---------------------------------------------------------------------------

describe("summarize", () => {
  it("produces a readable summary", () => {
    const conv = create("alice");
    join(conv, "bob");
    addMessage(conv, 1, "hello");
    addMessage(conv, 0, "hi!");

    const summary = summarize(conv);
    expect(summary).toContain("alice");
    expect(summary).toContain("bob");
    expect(summary).toContain("hello");
    expect(summary).toContain("hi!");
    expect(summary).toContain("entered");
    expect(summary).toContain("2 messages");
  });
});

// ---------------------------------------------------------------------------
// remainingCapacity()
// ---------------------------------------------------------------------------

describe("remainingCapacity", () => {
  it("returns a positive number for a near-empty conversation", () => {
    const conv = create("alice");
    join(conv, "bob");
    addMessage(conv, 0, "hi");

    const remaining = remainingCapacity(conv);
    expect(remaining).toBeGreaterThan(50);
  });

  it("returns 0 when conversation is full", () => {
    const conv = create("alice");
    join(conv, "bob");

    // Fill it up
    for (let i = 0; i < 200; i++) {
      addMessage(conv, i % 2, `message ${i} with some extra text to fill space quickly`);
    }

    // With a tiny max, should be 0
    const remaining = remainingCapacity(conv, 40, 100);
    expect(remaining).toBe(0);
  });
});
