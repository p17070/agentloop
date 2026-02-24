/**
 * QR-Native Conversation Protocol — Type Definitions
 *
 * A stateless, serverless chat protocol where the QR code IS the database.
 * No URLs, no IDs, no server — just scan, read, reply, regenerate.
 */

// ---------------------------------------------------------------------------
// Header / Mode
// ---------------------------------------------------------------------------

/** Conversation mode encoded in 2 bits of the header byte. */
export const enum Mode {
  /** Exactly 2 participants — uses turn bitmap for speaker encoding. */
  Duo = 0b00,
  /** 3–15 participants — uses varint speaker index per message. */
  Group = 0b01,
  /** Single author, anyone can read (bulletin board). */
  Solo = 0b10,
  /** Reserved — extended header follows. */
  Extended = 0b11,
}

/** Text encoding strategy, encoded in 2 bits of the header byte. */
export const enum TextEncoding {
  /** Raw UTF-8, no compression. */
  Utf8 = 0b00,
  /** 6-bit packed alphabet (a-z, 0-9, space, punctuation). */
  SixBit = 0b01,
  /** Static Huffman table tuned for English chat. */
  Huffman = 0b10,
  /** Deflate (zlib raw) on the entire message block. */
  Deflate = 0b11,
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export interface Participant {
  /** Display name (1–32 UTF-8 bytes). */
  name: string;
  /** Whether this participant is still active in the conversation. */
  active: boolean;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const enum EventType {
  /** A participant entered the conversation. */
  Enter = 0x0,
  /** A participant left the conversation. */
  Exit = 0x1,
}

/** A regular chat message. */
export interface ChatMessage {
  kind: "message";
  /** Index into the participants array. */
  speaker: number;
  /** Message body (UTF-8 string). */
  text: string;
}

/** A system event (enter / exit). */
export interface SystemEvent {
  kind: "event";
  event: EventType;
  /** Index into the participants array. */
  participant: number;
}

export type ConversationEntry = ChatMessage | SystemEvent;

// ---------------------------------------------------------------------------
// Conversation (the full state that lives inside one QR code)
// ---------------------------------------------------------------------------

export interface Conversation {
  /** Protocol version (0–3). */
  version: number;
  /** Conversation mode. */
  mode: Mode;
  /** Text encoding used for the message block. */
  textEncoding: TextEncoding;
  /** Ordered list of participants (index = their speaker ID). */
  participants: Participant[];
  /** Ordered message/event stream. */
  entries: ConversationEntry[];
}

// ---------------------------------------------------------------------------
// Codec options
// ---------------------------------------------------------------------------

export interface EncodeOptions {
  /** Force a specific text encoding. Auto-selected if omitted. */
  textEncoding?: TextEncoding;
  /** Max output bytes (default: 2953, QR v40 binary L). */
  maxBytes?: number;
}

/** QR Version 40 binary mode capacity at each error-correction level. */
export const QR_CAPACITY = {
  L: 2953,
  M: 2331,
  Q: 1663,
  H: 1273,
} as const;
