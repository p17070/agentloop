import { describe, it, expect } from "vitest";
import {
  encodeVarint,
  decodeVarint,
  varintSize,
  encodeSixBit,
  decodeSixBit,
  encodeTurnBitmap,
  decodeTurnBitmap,
} from "../../src/qr-conversation/encoding.js";

// ---------------------------------------------------------------------------
// Varint
// ---------------------------------------------------------------------------

describe("varint", () => {
  it("encodes 0 as a single byte", () => {
    const buf = new Uint8Array(4);
    const written = encodeVarint(buf, 0, 0);
    expect(written).toBe(1);
    expect(buf[0]).toBe(0);
  });

  it("encodes 127 as a single byte", () => {
    const buf = new Uint8Array(4);
    encodeVarint(buf, 0, 127);
    expect(buf[0]).toBe(127);
  });

  it("encodes 128 as two bytes", () => {
    const buf = new Uint8Array(4);
    const written = encodeVarint(buf, 0, 128);
    expect(written).toBe(2);
    expect(buf[0]).toBe(0x80); // low 7 bits = 0, continuation bit set
    expect(buf[1]).toBe(0x01); // high bits = 1
  });

  it("round-trips small values", () => {
    for (const val of [0, 1, 42, 100, 127]) {
      const buf = new Uint8Array(4);
      encodeVarint(buf, 0, val);
      const [decoded] = decodeVarint(buf, 0);
      expect(decoded).toBe(val);
    }
  });

  it("round-trips medium values", () => {
    for (const val of [128, 255, 1000, 16383]) {
      const buf = new Uint8Array(4);
      encodeVarint(buf, 0, val);
      const [decoded] = decodeVarint(buf, 0);
      expect(decoded).toBe(val);
    }
  });

  it("round-trips large values", () => {
    for (const val of [16384, 65535, 100000, 2097151]) {
      const buf = new Uint8Array(4);
      encodeVarint(buf, 0, val);
      const [decoded] = decodeVarint(buf, 0);
      expect(decoded).toBe(val);
    }
  });

  it("encodes at a non-zero offset", () => {
    const buf = new Uint8Array(8);
    buf[0] = 0xff; // garbage before
    const written = encodeVarint(buf, 2, 300);
    expect(written).toBe(2);
    const [decoded, bytesRead] = decodeVarint(buf, 2);
    expect(decoded).toBe(300);
    expect(bytesRead).toBe(2);
  });

  it("varintSize returns correct byte count", () => {
    expect(varintSize(0)).toBe(1);
    expect(varintSize(127)).toBe(1);
    expect(varintSize(128)).toBe(2);
    expect(varintSize(16383)).toBe(2);
    expect(varintSize(16384)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 6-bit Text Encoding
// ---------------------------------------------------------------------------

describe("6-bit text encoding", () => {
  it("encodes and decodes simple lowercase text", () => {
    const text = "hello world";
    const encoded = encodeSixBit(text);
    const decoded = decodeSixBit(encoded, text.length);
    expect(decoded).toBe(text);
  });

  it("encodes and decodes digits", () => {
    const text = "test 123";
    const encoded = encodeSixBit(text);
    const decoded = decodeSixBit(encoded, text.length);
    expect(decoded).toBe(text);
  });

  it("encodes and decodes punctuation", () => {
    const text = "hey! what's up? good.";
    const encoded = encodeSixBit(text);
    const decoded = decodeSixBit(encoded, text.length);
    expect(decoded).toBe(text);
  });

  it("is more compact than UTF-8 for lowercase text", () => {
    const text = "this is a typical chat message with lowercase text";
    const encoded = encodeSixBit(text);
    const utf8 = new TextEncoder().encode(text);
    // 6-bit should be ~75% of UTF-8 size
    expect(encoded.length).toBeLessThan(utf8.length);
  });

  it("handles empty string", () => {
    const encoded = encodeSixBit("");
    const decoded = decodeSixBit(encoded, 0);
    expect(decoded).toBe("");
  });

  it("handles single character", () => {
    const text = "a";
    const encoded = encodeSixBit(text);
    const decoded = decodeSixBit(encoded, 1);
    expect(decoded).toBe("a");
  });

  it("handles newlines", () => {
    const text = "line one\nline two";
    const encoded = encodeSixBit(text);
    const decoded = decodeSixBit(encoded, text.length);
    expect(decoded).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// Turn Bitmap
// ---------------------------------------------------------------------------

describe("turn bitmap", () => {
  it("encodes alternating speakers as all zeros", () => {
    const speakers = [0, 1, 0, 1, 0, 1];
    const bitmap = encodeTurnBitmap(speakers);
    // All bits should be 0 (speaker always switches)
    for (const byte of bitmap) {
      expect(byte).toBe(0);
    }
  });

  it("encodes same-speaker continuation as set bits", () => {
    // Speaker 0 sends 3 messages, then speaker 1 sends 1
    const speakers = [0, 0, 0, 1];
    const bitmap = encodeTurnBitmap(speakers);
    // bit 1 = 1 (same as prev), bit 2 = 1 (same), bit 3 = 0 (switch)
    const decoded = decodeTurnBitmap(bitmap, 4);
    expect(decoded).toEqual([0, 0, 0, 1]);
  });

  it("round-trips various speaker patterns", () => {
    const patterns = [
      [0, 1],
      [0, 0, 1, 1],
      [0, 1, 0, 1, 0, 1, 0, 1],
      [0, 0, 0, 0, 1],
      [0, 1, 1, 0, 0, 1, 0],
    ];

    for (const speakers of patterns) {
      const bitmap = encodeTurnBitmap(speakers);
      const decoded = decodeTurnBitmap(bitmap, speakers.length);
      expect(decoded).toEqual(speakers);
    }
  });

  it("handles single message", () => {
    const speakers = [0];
    const bitmap = encodeTurnBitmap(speakers);
    const decoded = decodeTurnBitmap(bitmap, 1);
    expect(decoded).toEqual([0]);
  });

  it("handles empty array", () => {
    const bitmap = encodeTurnBitmap([]);
    const decoded = decodeTurnBitmap(bitmap, 0);
    expect(decoded).toEqual([]);
  });

  it("handles more than 8 messages (multi-byte bitmap)", () => {
    const speakers = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]; // 11 alternating
    const bitmap = encodeTurnBitmap(speakers);
    expect(bitmap.length).toBe(2); // ceil(11/8) = 2 bytes
    const decoded = decodeTurnBitmap(bitmap, 11);
    expect(decoded).toEqual(speakers);
  });
});
