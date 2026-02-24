/**
 * High-level Conversation API
 *
 * Provides the user-facing workflow:
 *   create() → join() → addMessage() → leave() → toBytes() / fromBytes()
 *
 * This is the "scan → read → reply → regenerate" loop.
 */

import {
  type Conversation,
  type ConversationEntry,
  type EncodeOptions,
  Mode,
  TextEncoding,
  EventType,
  QR_CAPACITY,
} from "./types.js";

import { encode, decode } from "./codec.js";

// ---------------------------------------------------------------------------
// Create a new conversation
// ---------------------------------------------------------------------------

/** Start a brand-new conversation. */
export function create(creatorName: string): Conversation {
  return {
    version: 1,
    mode: Mode.Duo, // starts as duo, upgrades to group if 3+ join
    textEncoding: TextEncoding.Utf8,
    participants: [{ name: creatorName, active: true }],
    entries: [{ kind: "event", event: EventType.Enter, participant: 0 }],
  };
}

// ---------------------------------------------------------------------------
// Join an existing conversation
// ---------------------------------------------------------------------------

/** Join a conversation. Returns the participant index. */
export function join(conv: Conversation, name: string): number {
  // Check if this name already exists (rejoin)
  const existing = conv.participants.findIndex(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  );

  if (existing >= 0) {
    conv.participants[existing].active = true;
    conv.entries.push({ kind: "event", event: EventType.Enter, participant: existing });
    return existing;
  }

  // New participant
  const idx = conv.participants.length;
  conv.participants.push({ name, active: true });
  conv.entries.push({ kind: "event", event: EventType.Enter, participant: idx });

  // Upgrade to group mode if more than 2 participants
  if (conv.participants.length > 2) {
    conv.mode = Mode.Group;
  }

  return idx;
}

// ---------------------------------------------------------------------------
// Add a message
// ---------------------------------------------------------------------------

/** Add a chat message from a participant. */
export function addMessage(conv: Conversation, speaker: number, text: string): void {
  if (speaker < 0 || speaker >= conv.participants.length) {
    throw new RangeError(`Speaker index ${speaker} out of range`);
  }
  if (!conv.participants[speaker].active) {
    throw new Error(`Participant "${conv.participants[speaker].name}" has exited`);
  }
  if (text.length === 0) {
    throw new Error("Message text cannot be empty");
  }
  conv.entries.push({ kind: "message", speaker, text });
}

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

/** Mark a participant as having left the conversation. */
export function leave(conv: Conversation, participantIdx: number): void {
  if (participantIdx < 0 || participantIdx >= conv.participants.length) {
    throw new RangeError(`Participant index ${participantIdx} out of range`);
  }
  conv.participants[participantIdx].active = false;
  conv.entries.push({ kind: "event", event: EventType.Exit, participant: participantIdx });
}

// ---------------------------------------------------------------------------
// Serialize / Deserialize
// ---------------------------------------------------------------------------

/** Pick the best text encoding for the current conversation content. */
function autoSelectEncoding(conv: Conversation): TextEncoding {
  // Collect all message text
  const allText = conv.entries
    .filter((e): e is Extract<ConversationEntry, { kind: "message" }> => e.kind === "message")
    .map((m) => m.text)
    .join("");

  if (allText.length === 0) return TextEncoding.Utf8;

  // Check if text is mostly 6-bit compatible (lowercase ascii + basic punctuation)
  const sixBitChars = "abcdefghijklmnopqrstuvwxyz0123456789 .,!?'-:\n@#();\"/";
  let compatible = 0;
  for (const ch of allText) {
    if (sixBitChars.includes(ch)) compatible++;
  }

  const ratio = compatible / allText.length;

  // If >90% of chars fit 6-bit alphabet, use 6-bit encoding
  if (ratio > 0.9) return TextEncoding.SixBit;

  // Otherwise raw UTF-8
  return TextEncoding.Utf8;
}

/** Encode conversation to bytes, ready for QR code. */
export function toBytes(conv: Conversation, opts: EncodeOptions = {}): Uint8Array {
  // Auto-select encoding if not forced
  if (opts.textEncoding === undefined) {
    conv.textEncoding = autoSelectEncoding(conv);
  } else {
    conv.textEncoding = opts.textEncoding;
  }
  return encode(conv, opts);
}

/** Decode bytes (from QR scan) back to a Conversation. */
export function fromBytes(data: Uint8Array): Conversation {
  return decode(data);
}

// ---------------------------------------------------------------------------
// Conversation info / display helpers
// ---------------------------------------------------------------------------

/** Get a human-readable summary of the conversation. */
export function summarize(conv: Conversation): string {
  const lines: string[] = [];
  const activeNames = conv.participants.filter((p) => p.active).map((p) => p.name);
  const msgCount = conv.entries.filter((e) => e.kind === "message").length;

  lines.push(`[${activeNames.join(", ")}] — ${msgCount} messages`);
  lines.push("");

  for (const entry of conv.entries) {
    if (entry.kind === "event") {
      const name = conv.participants[entry.participant].name;
      const arrow = entry.event === EventType.Enter ? "→" : "←";
      lines.push(`  ${arrow} ${name} ${entry.event === EventType.Enter ? "entered" : "left"}`);
    } else {
      const name = conv.participants[entry.speaker].name;
      lines.push(`  ${name}: ${entry.text}`);
    }
  }

  return lines.join("\n");
}

/** Estimate how many more messages can fit in the QR code. */
export function remainingCapacity(
  conv: Conversation,
  avgMsgLength = 40,
  maxBytes = QR_CAPACITY.L,
): number {
  const currentSize = toBytes(conv).length;
  const remaining = maxBytes - currentSize;

  if (remaining <= 0) return 0;

  // Estimate bytes per message based on encoding
  const overhead = conv.mode === Mode.Duo ? 1.5 : 3; // varint + bitmap overhead
  const textBytes =
    conv.textEncoding === TextEncoding.SixBit
      ? Math.ceil(avgMsgLength * 0.75)
      : avgMsgLength;

  return Math.floor(remaining / (overhead + textBytes));
}
