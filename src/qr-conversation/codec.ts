/**
 * QR Conversation Binary Codec
 *
 * Encodes/decodes a Conversation to/from a compact Uint8Array
 * suitable for embedding in a QR code (≤ 2953 bytes at QR v40-L).
 *
 * Wire format (v1 Ultralight):
 *
 *   BYTE 0: [VV MM TT PP]
 *     VV = version       (2 bits)
 *     MM = mode           (2 bits: duo/group/solo/ext)
 *     TT = text encoding  (2 bits: utf8/6bit/huffman/deflate)
 *     PP = participant count hint (2 bits, 0-3 inline, overflow → varint)
 *
 *   BYTE 1+: participant count (varint, only if PP == 3 meaning "4+")
 *   NEXT:    message count (varint)
 *
 *   PARTICIPANTS:
 *     for each: varint(name_len) | name_bytes (UTF-8)
 *
 *   MESSAGES (duo mode):
 *     turn_bitmap: ⌈msg_count/8⌉ bytes
 *     for each entry:
 *       if ChatMessage: varint(text_byte_len) | encoded_text
 *       if SystemEvent: varint(0) | event_byte [EEEE PPPP]
 *
 *   MESSAGES (group mode):
 *     for each entry:
 *       if ChatMessage: varint(speaker+1) | varint(text_byte_len) | encoded_text
 *       if SystemEvent: varint(0) | event_byte [EEEE PPPP]
 *
 * No footer. No timestamps. No CRC. Every byte is content.
 */

import {
  type Conversation,
  type ConversationEntry,
  type Participant,
  type EncodeOptions,
  Mode,
  TextEncoding,
  EventType,
  QR_CAPACITY,
} from "./types.js";

import {
  encodeVarint,
  decodeVarint,
  encodeTurnBitmap,
  decodeTurnBitmap,
  encodeSixBit,
  decodeSixBit,
  toUtf8,
  fromUtf8,
} from "./encoding.js";

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/** Encode a Conversation to a compact binary Uint8Array. */
export function encode(conv: Conversation, opts: EncodeOptions = {}): Uint8Array {
  const maxBytes = opts.maxBytes ?? QR_CAPACITY.L;
  const textEnc = opts.textEncoding ?? conv.textEncoding;

  const msgCount = conv.entries.length;
  const pCount = conv.participants.length;

  // --- Pre-calculate size for the buffer ---
  // Dynamic buffer: generous estimate based on entry count
  const estimatedSize = Math.max(maxBytes + 1024, 256 + conv.entries.length * 80);
  const buf = new Uint8Array(estimatedSize);
  let pos = 0;

  // --- BYTE 0: header ---
  const version = conv.version & 0x03;
  const mode = conv.mode & 0x03;
  const te = textEnc & 0x03;
  const ppHint = pCount <= 3 ? pCount : 3; // 3 means "varint follows"
  buf[pos++] = (version << 6) | (mode << 4) | (te << 2) | ppHint;

  // --- Participant count (varint, only if ppHint == 3 and actual count > 3) ---
  if (ppHint === 3) {
    pos += encodeVarint(buf, pos, pCount);
  }

  // --- Message count (varint) ---
  pos += encodeVarint(buf, pos, msgCount);

  // --- Participants ---
  for (const p of conv.participants) {
    const nameBytes = toUtf8(p.name);
    pos += encodeVarint(buf, pos, nameBytes.length);
    buf.set(nameBytes, pos);
    pos += nameBytes.length;
  }

  // --- Messages ---
  if (conv.mode === Mode.Duo) {
    pos = encodeDuoMessages(buf, pos, conv.entries, textEnc);
  } else {
    pos = encodeGroupMessages(buf, pos, conv.entries, textEnc);
  }

  // Trim to actual size
  const result = buf.slice(0, pos);

  // Check overflow — if too large, truncate oldest messages and re-encode
  if (result.length > maxBytes) {
    return encodeWithTruncation(conv, maxBytes, textEnc);
  }

  return result;
}

/** Encode with oldest-message truncation to fit within maxBytes. */
function encodeWithTruncation(
  conv: Conversation,
  maxBytes: number,
  textEnc: TextEncoding,
): Uint8Array {
  const truncated: Conversation = { ...conv, entries: [...conv.entries] };

  // Binary search for the max entries that fit
  let lo = 0;
  let hi = truncated.entries.length;

  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    const slice: Conversation = {
      ...conv,
      entries: conv.entries.slice(conv.entries.length - mid),
    };
    const trial = encodeRaw(slice, textEnc);
    if (trial.length <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const finalConv: Conversation = {
    ...conv,
    entries: conv.entries.slice(conv.entries.length - lo),
  };
  return encodeRaw(finalConv, textEnc);
}

/** Encode without overflow checking (used by truncation loop). */
function encodeRaw(conv: Conversation, textEnc: TextEncoding): Uint8Array {
  // Dynamic buffer: estimate ~60 bytes per entry + participant overhead
  const estimatedSize = 256 + conv.entries.length * 80;
  const buf = new Uint8Array(estimatedSize);
  let pos = 0;
  const pCount = conv.participants.length;
  const msgCount = conv.entries.length;

  const version = conv.version & 0x03;
  const mode = conv.mode & 0x03;
  const te = textEnc & 0x03;
  const ppHint = pCount <= 3 ? pCount : 3;
  buf[pos++] = (version << 6) | (mode << 4) | (te << 2) | ppHint;

  if (ppHint === 3) {
    pos += encodeVarint(buf, pos, pCount);
  }
  pos += encodeVarint(buf, pos, msgCount);

  for (const p of conv.participants) {
    const nameBytes = toUtf8(p.name);
    pos += encodeVarint(buf, pos, nameBytes.length);
    buf.set(nameBytes, pos);
    pos += nameBytes.length;
  }

  if (conv.mode === Mode.Duo) {
    pos = encodeDuoMessages(buf, pos, conv.entries, textEnc);
  } else {
    pos = encodeGroupMessages(buf, pos, conv.entries, textEnc);
  }

  return buf.slice(0, pos);
}

// ---------------------------------------------------------------------------
// Duo mode encoding
// ---------------------------------------------------------------------------

function encodeDuoMessages(
  buf: Uint8Array,
  pos: number,
  entries: ConversationEntry[],
  textEnc: TextEncoding,
): number {
  // Build speaker indices for chat messages (skip events for bitmap)
  // But the bitmap needs to track position in the full stream so the
  // decoder knows which entries are messages vs events.
  // Approach: encode a "type bitmap" first — 1 bit per entry:
  //   0 = chat message, 1 = system event
  // Then the turn bitmap only for chat messages.

  const entryTypeBitmap = new Uint8Array(Math.ceil(entries.length / 8));
  const chatSpeakers: number[] = [];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.kind === "event") {
      const byteIdx = i >>> 3;
      const bitIdx = 7 - (i & 7);
      entryTypeBitmap[byteIdx] |= 1 << bitIdx;
    } else {
      chatSpeakers.push(e.speaker);
    }
  }

  // Write entry-type bitmap
  buf.set(entryTypeBitmap, pos);
  pos += entryTypeBitmap.length;

  // Write first speaker index (1 byte) — needed to reconstruct speakers from bitmap
  buf[pos++] = chatSpeakers.length > 0 ? chatSpeakers[0] : 0;

  // Write turn bitmap for chat messages
  const turnBitmap = encodeTurnBitmap(chatSpeakers);
  buf.set(turnBitmap, pos);
  pos += turnBitmap.length;

  // Write each entry's payload
  for (const entry of entries) {
    if (entry.kind === "event") {
      // System event: 1 byte [EEEE PPPP]
      const eventByte = ((entry.event & 0x0f) << 4) | (entry.participant & 0x0f);
      buf[pos++] = eventByte;
    } else {
      // Chat message: varint(len) + encoded text
      pos = writeEncodedText(buf, pos, entry.text, textEnc);
    }
  }

  return pos;
}

// ---------------------------------------------------------------------------
// Group mode encoding
// ---------------------------------------------------------------------------

function encodeGroupMessages(
  buf: Uint8Array,
  pos: number,
  entries: ConversationEntry[],
  textEnc: TextEncoding,
): number {
  for (const entry of entries) {
    if (entry.kind === "event") {
      // speaker=0 signals system event
      pos += encodeVarint(buf, pos, 0);
      const eventByte = ((entry.event & 0x0f) << 4) | (entry.participant & 0x0f);
      buf[pos++] = eventByte;
    } else {
      // speaker+1 (so 0 is reserved for events)
      pos += encodeVarint(buf, pos, entry.speaker + 1);
      pos = writeEncodedText(buf, pos, entry.text, textEnc);
    }
  }

  return pos;
}

// ---------------------------------------------------------------------------
// Text encoding helpers
// ---------------------------------------------------------------------------

function writeEncodedText(
  buf: Uint8Array,
  pos: number,
  text: string,
  textEnc: TextEncoding,
): number {
  let textBytes: Uint8Array;

  if (textEnc === TextEncoding.SixBit) {
    textBytes = encodeSixBit(text);
    // Write char count first (needed for decoding 6-bit), then byte length, then data
    pos += encodeVarint(buf, pos, text.length); // char count
    pos += encodeVarint(buf, pos, textBytes.length);
  } else {
    // UTF-8 (or Huffman/Deflate — for now, fall back to UTF-8)
    textBytes = toUtf8(text);
    pos += encodeVarint(buf, pos, textBytes.length);
  }

  buf.set(textBytes, pos);
  pos += textBytes.length;
  return pos;
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/** Decode a binary Uint8Array back to a Conversation. */
export function decode(data: Uint8Array): Conversation {
  let pos = 0;

  // --- BYTE 0: header ---
  const header = data[pos++];
  const version = (header >>> 6) & 0x03;
  const mode: Mode = ((header >>> 4) & 0x03) as Mode;
  const textEncoding: TextEncoding = ((header >>> 2) & 0x03) as TextEncoding;
  const ppHint = header & 0x03;

  // --- Participant count ---
  let pCount: number;
  if (ppHint < 3) {
    pCount = ppHint;
  } else {
    const [v, n] = decodeVarint(data, pos);
    pCount = v;
    pos += n;
  }

  // --- Message count ---
  const [msgCount, msgCountBytes] = decodeVarint(data, pos);
  pos += msgCountBytes;

  // --- Participants ---
  const participants: Participant[] = [];
  for (let i = 0; i < pCount; i++) {
    const [nameLen, nlBytes] = decodeVarint(data, pos);
    pos += nlBytes;
    const name = fromUtf8(data.slice(pos, pos + nameLen));
    pos += nameLen;
    participants.push({ name, active: true }); // active status inferred from events
  }

  // --- Messages ---
  let entries: ConversationEntry[];
  if (mode === Mode.Duo) {
    [entries, pos] = decodeDuoMessages(data, pos, msgCount, textEncoding);
  } else {
    [entries, pos] = decodeGroupMessages(data, pos, msgCount, textEncoding);
  }

  // Replay events to set participant active status
  replayActiveStatus(participants, entries);

  return { version, mode, textEncoding, participants, entries };
}

// ---------------------------------------------------------------------------
// Duo mode decoding
// ---------------------------------------------------------------------------

function decodeDuoMessages(
  data: Uint8Array,
  pos: number,
  entryCount: number,
  textEnc: TextEncoding,
): [ConversationEntry[], number] {
  // Read entry-type bitmap
  const typeBitmapLen = Math.ceil(entryCount / 8);
  const typeBitmap = data.slice(pos, pos + typeBitmapLen);
  pos += typeBitmapLen;

  // Count chat messages to know turn bitmap size
  let chatCount = 0;
  for (let i = 0; i < entryCount; i++) {
    const byteIdx = i >>> 3;
    const bitIdx = 7 - (i & 7);
    const isEvent = (typeBitmap[byteIdx] >>> bitIdx) & 1;
    if (!isEvent) chatCount++;
  }

  // Read first speaker index
  const firstSpeaker = data[pos++];

  // Read turn bitmap
  const turnBitmapLen = Math.ceil(chatCount / 8);
  const turnBitmap = data.slice(pos, pos + turnBitmapLen);
  pos += turnBitmapLen;

  // Decode speakers from turn bitmap
  const speakers = decodeTurnBitmap(turnBitmap, chatCount, firstSpeaker);

  // Read entries
  const entries: ConversationEntry[] = [];
  let chatIdx = 0;

  for (let i = 0; i < entryCount; i++) {
    const byteIdx = i >>> 3;
    const bitIdx = 7 - (i & 7);
    const isEvent = (typeBitmap[byteIdx] >>> bitIdx) & 1;

    if (isEvent) {
      const eventByte = data[pos++];
      const event: EventType = ((eventByte >>> 4) & 0x0f) as EventType;
      const participant = eventByte & 0x0f;
      entries.push({ kind: "event", event, participant });
    } else {
      const speaker = speakers[chatIdx++];
      let text: string;
      [text, pos] = readEncodedText(data, pos, textEnc);
      entries.push({ kind: "message", speaker, text });
    }
  }

  return [entries, pos];
}

// ---------------------------------------------------------------------------
// Group mode decoding
// ---------------------------------------------------------------------------

function decodeGroupMessages(
  data: Uint8Array,
  pos: number,
  entryCount: number,
  textEnc: TextEncoding,
): [ConversationEntry[], number] {
  const entries: ConversationEntry[] = [];

  for (let i = 0; i < entryCount; i++) {
    const [speakerPlus1, spBytes] = decodeVarint(data, pos);
    pos += spBytes;

    if (speakerPlus1 === 0) {
      // System event
      const eventByte = data[pos++];
      const event: EventType = ((eventByte >>> 4) & 0x0f) as EventType;
      const participant = eventByte & 0x0f;
      entries.push({ kind: "event", event, participant });
    } else {
      const speaker = speakerPlus1 - 1;
      let text: string;
      [text, pos] = readEncodedText(data, pos, textEnc);
      entries.push({ kind: "message", speaker, text });
    }
  }

  return [entries, pos];
}

// ---------------------------------------------------------------------------
// Text decoding helpers
// ---------------------------------------------------------------------------

function readEncodedText(
  data: Uint8Array,
  pos: number,
  textEnc: TextEncoding,
): [string, number] {
  if (textEnc === TextEncoding.SixBit) {
    // Char count + byte length + data
    const [charCount, ccBytes] = decodeVarint(data, pos);
    pos += ccBytes;
    const [byteLen, blBytes] = decodeVarint(data, pos);
    pos += blBytes;
    const text = decodeSixBit(data.slice(pos, pos + byteLen), charCount);
    return [text, pos + byteLen];
  } else {
    // UTF-8
    const [byteLen, blBytes] = decodeVarint(data, pos);
    pos += blBytes;
    const text = fromUtf8(data.slice(pos, pos + byteLen));
    return [text, pos + byteLen];
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Replay enter/exit events to determine final active status. */
function replayActiveStatus(participants: Participant[], entries: ConversationEntry[]): void {
  // Reset all to inactive, then replay
  for (const p of participants) p.active = false;

  // Anyone who sent a message or entered is active until they exit
  const seen = new Set<number>();
  for (const entry of entries) {
    if (entry.kind === "event") {
      if (entry.event === EventType.Enter) {
        participants[entry.participant].active = true;
        seen.add(entry.participant);
      } else if (entry.event === EventType.Exit) {
        participants[entry.participant].active = false;
      }
    } else {
      if (!seen.has(entry.speaker)) {
        participants[entry.speaker].active = true;
        seen.add(entry.speaker);
      }
    }
  }
}
