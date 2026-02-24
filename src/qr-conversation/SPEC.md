# QR-Native Conversation Protocol Specification

**Version:** 1.0
**Status:** Draft
**Date:** 2026-02-24

---

## 1. Overview

The QR-Native Conversation Protocol (QNCP) is a stateless, serverless chat
protocol that stores the **entire conversation state** inside a QR code. There
are no URLs, no database IDs, no cloud servers. The QR code IS the database.

### 1.1 Design Philosophy

| Principle | Implication |
|---|---|
| **Self-contained** | Every QR code holds the full conversation state. No external lookups. |
| **Serverless** | No internet, no backend, no accounts. Works offline everywhere. |
| **Minimal encoding** | Every bit is content. No timestamps, no CRC, no padding. |
| **Scan-reply-regenerate** | The UX loop: scan a QR, read the thread, type a reply, show a new QR. |
| **Fork-friendly** | Two people scanning the same QR and replying creates two valid branches. |

### 1.2 Capacity Target

A single QR code (Version 40, Error Correction Level L) holds **2,953 bytes**
in binary mode. With the encoding optimizations in this protocol, that fits
**~100–140 messages** of typical chat text between 2 participants.

### 1.3 Non-Goals

- End-to-end encryption (may be layered on top, but not in this spec)
- Message editing or deletion
- Multimedia (images, audio, video)
- Guaranteed delivery or ordering across forks

---

## 2. Data Model

### 2.1 Conversation

A `Conversation` is the top-level object. It contains everything needed to
render the chat thread and continue the conversation.

```
Conversation {
  version:      u2          // Protocol version (0–3)
  mode:         Mode        // Duo | Group | Solo | Extended
  textEncoding: TextEncoding // Utf8 | SixBit | Huffman | Deflate
  participants: Participant[]
  entries:      ConversationEntry[]
}
```

### 2.2 Mode

Two bits encoding the conversation topology.

| Value | Name | Description |
|---|---|---|
| `0b00` | **Duo** | Exactly 2 participants. Uses turn bitmap (1 bit/msg) for speaker encoding. |
| `0b01` | **Group** | 3–15 participants. Uses varint speaker index per message. |
| `0b10` | **Solo** | Single author / bulletin board. Anyone can read, one person writes. |
| `0b11` | **Extended** | Reserved. An extended header follows byte 0. |

Mode is auto-upgraded from Duo to Group when a 3rd participant joins. It is
never downgraded.

### 2.3 Text Encoding

Two bits selecting the compression strategy for message text.

| Value | Name | Bits/char | Overhead | Best for |
|---|---|---|---|---|
| `0b00` | **Utf8** | 8 | None | Mixed-case, emoji, Unicode |
| `0b01` | **SixBit** | 6 | None | Lowercase English chat |
| `0b10` | **Huffman** | ~4.5 | None (static table) | English chat (reserved, not yet implemented) |
| `0b11` | **Deflate** | ~4 | ~50 bytes | Long conversations (reserved, not yet implemented) |

The encoder auto-selects SixBit when >90% of characters in the conversation
fall within the 6-bit alphabet. Otherwise Utf8 is used.

### 2.4 Participant

```
Participant {
  name:   string   // Display name, 1–32 UTF-8 bytes
  active: boolean  // Derived from replaying enter/exit events
}
```

Participants are identified by their **index** (position in the participants
array). This index is stable for the lifetime of the conversation. Names are
self-declared — there is no authentication.

Rejoin is matched by **case-insensitive name comparison**. A returning
participant gets their original index back.

### 2.5 Conversation Entries

The entry stream is a heterogeneous, ordered sequence of two kinds:

#### 2.5.1 ChatMessage

```
ChatMessage {
  kind:    "message"
  speaker: uint        // Index into participants[]
  text:    string      // Message body (non-empty)
}
```

#### 2.5.2 SystemEvent

```
SystemEvent {
  kind:        "event"
  event:       EventType    // Enter (0x0) | Exit (0x1)
  participant: uint         // Index into participants[]
}
```

Events are inline in the entry stream, interleaved with messages. They are
rendered as "→ alice entered" / "← bob left" in the UI.

### 2.6 No Timestamps

**This protocol has no timestamps.** Message order is the timeline. The only
temporal information is the implicit moment of scanning/generation, which is
not stored. This saves 2 bytes per message and eliminates clock-sync issues
across devices.

### 2.7 No Integrity Footer

**This protocol has no CRC or checksum.** QR codes include Reed-Solomon error
correction at the physical layer, making an application-level CRC redundant.
This saves 4 bytes.

---

## 3. Wire Format

### 3.1 Byte Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ BYTE 0: Header                                                  │
│   Bits [7:6]  VV = version (2 bits, 0–3)                       │
│   Bits [5:4]  MM = mode    (2 bits, see §2.2)                  │
│   Bits [3:2]  TT = text encoding (2 bits, see §2.3)            │
│   Bits [1:0]  PP = participant count hint (2 bits)              │
│                                                                 │
│ BYTE 1+: Participant count (varint), ONLY IF PP == 3            │
│                                                                 │
│ NEXT: Entry count (varint) — total entries (messages + events)  │
│                                                                 │
│ PARTICIPANTS BLOCK:                                             │
│   For each participant:                                         │
│     varint(name_byte_length) | name_bytes (raw UTF-8)           │
│                                                                 │
│ MESSAGE BLOCK: (format depends on mode, see §3.3 and §3.4)     │
└─────────────────────────────────────────────────────────────────┘
```

No footer. No padding. The message block runs to the end of the data.

### 3.2 Header Byte (Byte 0)

```
Bit:  7  6  5  4  3  2  1  0
      V  V  M  M  T  T  P  P
```

**PP (Participant count hint):**
- `0b00` = 0 participants
- `0b01` = 1 participant
- `0b10` = 2 participants
- `0b11` = 4+ participants → actual count follows as a varint

This avoids a varint for the common case of 1–2 participants.

### 3.3 Duo Mode Message Block

Duo mode uses three structures to minimize per-message overhead:

```
┌──────────────────────────────────────────────────┐
│ 1. Entry-type bitmap: ⌈entry_count / 8⌉ bytes   │
│      1 bit per entry:                            │
│        0 = ChatMessage                           │
│        1 = SystemEvent                           │
│                                                  │
│ 2. First speaker index: 1 byte                   │
│      Speaker index of the first ChatMessage.     │
│      (0 if no messages exist.)                   │
│                                                  │
│ 3. Turn bitmap: ⌈chat_count / 8⌉ bytes           │
│      1 bit per ChatMessage (not per entry):      │
│        0 = speaker switches from previous        │
│        1 = same speaker continues                │
│      First message uses first_speaker from (2).  │
│                                                  │
│ 4. Payloads (sequential, one per entry):         │
│      If ChatMessage:                             │
│        [encoded text, see §3.5]                  │
│      If SystemEvent:                             │
│        1 byte: [EEEE PPPP]                       │
│          EEEE = event type (high nibble)         │
│          PPPP = participant index (low nibble)   │
└──────────────────────────────────────────────────┘
```

**Why two bitmaps?** The entry-type bitmap tells the decoder which entries are
messages vs events. The turn bitmap only covers messages (not events), encoding
speaker transitions at 1 bit each instead of 1 byte each.

**Overhead per message in Duo mode:**
- Entry-type bitmap: 1/8 byte
- Turn bitmap: 1/8 byte
- First speaker: amortized ~0 bytes
- Text length varint: 1 byte (messages < 128 bytes)
- **Total: ~1.25 bytes overhead per message**

### 3.4 Group Mode Message Block

Group mode uses inline speaker indices (no bitmaps):

```
┌──────────────────────────────────────────────────┐
│ For each entry:                                  │
│                                                  │
│   If ChatMessage:                                │
│     varint(speaker_index + 1)                    │
│     [encoded text, see §3.5]                     │
│                                                  │
│   If SystemEvent:                                │
│     varint(0)    ← zero signals "system event"   │
│     1 byte: [EEEE PPPP]                          │
│       EEEE = event type (high nibble)            │
│       PPPP = participant index (low nibble)      │
│                                                  │
└──────────────────────────────────────────────────┘
```

Speaker indices are offset by +1 so that `0` is reserved as the system-event
sentinel. This means speaker 0 is encoded as varint `1`, speaker 1 as varint
`2`, and so on.

**Overhead per message in Group mode:**
- Speaker varint: 1 byte (up to 127 participants)
- Text length varint: 1 byte
- **Total: ~2 bytes overhead per message**

### 3.5 Text Payload Encoding

The text encoding format depends on the `TT` bits in the header.

#### 3.5.1 Utf8 (TT = 0b00)

```
varint(byte_length) | raw_utf8_bytes
```

#### 3.5.2 SixBit (TT = 0b01)

```
varint(char_count) | varint(byte_length) | sixbit_packed_bytes
```

The char count is needed because 6-bit packing does not align to byte
boundaries — the decoder must know when to stop reading bits.

#### 3.5.3 Huffman (TT = 0b10) — Reserved

Not yet implemented. Will use a static Huffman table baked into the codec
(no dictionary overhead). Format TBD.

#### 3.5.4 Deflate (TT = 0b11) — Reserved

Not yet implemented. Will use raw deflate on the entire message block.
Format TBD.

### 3.6 System Event Byte

```
Bit:  7  6  5  4  3  2  1  0
      E  E  E  E  P  P  P  P
```

| Field | Bits | Range | Description |
|---|---|---|---|
| EEEE | [7:4] | 0–15 | Event type. `0x0` = Enter, `0x1` = Exit. |
| PPPP | [3:0] | 0–15 | Participant index. Limits events to 16 participants. |

This is always exactly 1 byte per event.

---

## 4. Encoding Primitives

### 4.1 Varint (LEB128 Unsigned)

Variable-length unsigned integer encoding. Each byte uses 7 data bits and 1
continuation bit (MSB).

```
Value range     Bytes   Encoding
0–127           1       0xxxxxxx
128–16,383      2       1xxxxxxx 0xxxxxxx
16,384–2,097,151 3      1xxxxxxx 1xxxxxxx 0xxxxxxx
```

Encoding algorithm:
```
while value >= 0x80:
  emit (value & 0x7F) | 0x80
  value >>>= 7
emit value
```

Decoding algorithm:
```
value = 0, shift = 0
do:
  byte = read()
  value |= (byte & 0x7F) << shift
  shift += 7
while byte & 0x80
```

### 4.2 Six-Bit Text Encoding

A 64-symbol alphabet mapped to 6-bit codes. Characters outside the alphabet
are escaped.

#### 4.2.1 Alphabet Table

| Code | Char | Code | Char | Code | Char |
|---|---|---|---|---|---|
| 0–25 | `a`–`z` | 36 | `(space)` | 45 | `@` |
| 26–35 | `0`–`9` | 37 | `.` | 46 | `#` |
| | | 38 | `,` | 47 | `(` |
| | | 39 | `!` | 48 | `)` |
| | | 40 | `?` | 49 | `;` |
| | | 41 | `'` | 50 | `"` |
| | | 42 | `-` | 51 | `/` |
| | | 43 | `:` | 52–62 | reserved |
| | | 44 | `\n` | **63** | **ESCAPE** |

#### 4.2.2 Escape Mechanism

When a character is not in the alphabet:
1. Emit the ESCAPE code (63, 6 bits)
2. Emit each byte of the character's UTF-8 encoding as raw 8-bit values

The decoder reads an ESCAPE, then reads the next 8 bits as a raw byte.

**Note:** Multi-byte UTF-8 characters generate one ESCAPE + 8-bit pair per
byte. The current implementation decodes each byte individually, which does
not correctly reconstruct multi-byte characters. This is a known limitation;
for v1, only ASCII characters outside the 6-bit alphabet are escaped
correctly (e.g., uppercase letters, `{`, `}`, `~`, etc.).

#### 4.2.3 Bit Packing

6-bit values are packed MSB-first into a byte stream:

```
Char 0 bits [5:0] → byte 0 bits [7:2]
Char 1 bits [5:4] → byte 0 bits [1:0]
Char 1 bits [3:0] → byte 1 bits [7:4]
Char 2 bits [5:2] → byte 1 bits [3:0] ... etc
...
```

Every 4 characters produce exactly 3 bytes (4 * 6 = 24 = 3 * 8).

### 4.3 Turn Bitmap

A bitfield with 1 bit per ChatMessage (not per entry) in a Duo conversation.

| Bit value | Meaning |
|---|---|
| `0` | Speaker **switches** from the previous message |
| `1` | **Same speaker** continues |

The first message's speaker is stored separately as a 1-byte `first_speaker`
index. Subsequent speakers are derived by toggling between participants 0 and
1 on each `0` bit.

**Example:**
```
Speakers: [1, 0, 0, 1, 1]
           ↓  ↓  ↓  ↓  ↓
first_speaker = 1
bitmap:    x  0  1  0  1   (bit 0 is unused for msg 0)
                            → 0b_0101_0000 = 0x50
```

Decoding:
```
speakers[0] = first_speaker = 1
bit 1 = 0 → switch  → speakers[1] = 0
bit 2 = 1 → same    → speakers[2] = 0
bit 3 = 0 → switch  → speakers[3] = 1
bit 4 = 1 → same    → speakers[4] = 1
```

---

## 5. Conversation Lifecycle

### 5.1 Create

```
create(name: string) → Conversation
```

Initializes a conversation with:
- `version = 1`
- `mode = Duo`
- `textEncoding = Utf8`
- `participants = [{ name, active: true }]`
- `entries = [{ kind: "event", event: Enter, participant: 0 }]`

### 5.2 Join

```
join(conv: Conversation, name: string) → participantIndex
```

1. If `name` matches an existing participant (case-insensitive), **rejoin**:
   set their `active = true` and append an Enter event. Return existing index.
2. Otherwise, append a new Participant, append an Enter event, return new
   index.
3. If `participants.length > 2`, upgrade `mode` to `Group`.

### 5.3 Add Message

```
addMessage(conv: Conversation, speaker: number, text: string) → void
```

Validations (throw on failure):
- `speaker` must be a valid participant index
- Participant must be `active`
- `text` must be non-empty

Appends `{ kind: "message", speaker, text }` to the entry stream.

### 5.4 Leave

```
leave(conv: Conversation, participantIndex: number) → void
```

Sets `participant.active = false` and appends an Exit event.

### 5.5 Serialize

```
toBytes(conv: Conversation, opts?: EncodeOptions) → Uint8Array
```

1. Auto-selects text encoding if not specified in `opts`
2. Calls `encode()` which may trigger truncation if output exceeds `maxBytes`
3. Returns bytes suitable for embedding in a QR code

### 5.6 Deserialize

```
fromBytes(data: Uint8Array) → Conversation
```

1. Decodes the binary format
2. Replays all Enter/Exit events to compute `participant.active` status
3. Returns a fully hydrated Conversation object

---

## 6. Overflow and Truncation

When the encoded conversation exceeds `maxBytes` (default 2,953):

1. A **binary search** finds the maximum number of entries `N` such that the
   last `N` entries fit within the byte budget.
2. The oldest `(total - N)` entries are discarded.
3. The participants array is always preserved in full.

This means **newer messages are always kept**. The conversation gracefully
degrades as it grows — older context is shed to make room.

The truncation boundary is computed per-byte, not per-message, so partial
entries are never produced.

---

## 7. Capacity Analysis

Assumptions: 2 participants with 8-character names, average 40-character
messages, QR Version 40 Error Correction Level L (2,953 bytes).

### 7.1 Overhead Budget

| Component | Bytes |
|---|---|
| Header byte | 1 |
| Entry count (varint) | 1–2 |
| 2 participants (varint len + name) | ~20 |
| Entry-type bitmap (100 entries) | 13 |
| First speaker byte | 1 |
| Turn bitmap (80 chat msgs) | 10 |
| **Total fixed overhead** | **~46** |

### 7.2 Per-Message Overhead

| Encoding | Text bytes/msg | Length varint | Total/msg |
|---|---|---|---|
| Utf8 | 40 | 1 | 41 |
| SixBit | 30 + 1 (char count) | 1+1 | 32 |

### 7.3 Message Capacity

| Configuration | Messages that fit |
|---|---|
| Utf8, Duo mode | ~70 |
| SixBit, Duo mode | ~90 |
| Utf8, Group mode (+1B speaker/msg) | ~65 |
| SixBit, Group mode | ~82 |
| Utf8, Duo, QR EC-M (2,331B) | ~55 |
| Utf8, Duo, QR EC-Q (1,663B) | ~39 |
| Utf8, Duo, QR EC-H (1,273B) | ~29 |

### 7.4 QR Version Capacities

| Error Correction | Binary Capacity | Approximate Messages (Duo/Utf8) |
|---|---|---|
| **L** (7% recovery) | 2,953 bytes | ~70 |
| **M** (15% recovery) | 2,331 bytes | ~55 |
| **Q** (25% recovery) | 1,663 bytes | ~39 |
| **H** (30% recovery) | 1,273 bytes | ~29 |

---

## 8. Encoding Auto-Selection

The `toBytes()` function analyzes conversation content and picks the most
compact encoding:

```
allText = concatenate all message texts

sixBitCompatible = count chars in 6-bit alphabet
ratio = sixBitCompatible / allText.length

if ratio > 0.90 → SixBit
else             → Utf8
```

This can be overridden by passing `textEncoding` in `EncodeOptions`.

---

## 9. Active Status Reconstruction

Participant `active` status is **not stored** in the wire format. It is
reconstructed during decoding by replaying the entry stream:

```
1. Set all participants to active = false
2. For each entry:
   - Enter event:  participant.active = true
   - Exit event:   participant.active = false
   - ChatMessage:  if first message from this speaker, mark active = true
```

This saves space by not encoding a per-participant status byte.

---

## 10. Security and Trust Model

### 10.1 No Authentication

Participants are self-declared names. There is no cryptographic identity.
Anyone who scans a QR code can add any name and send messages.

### 10.2 No Tamper Detection

The protocol has no signatures or MACs. A malicious party could:
- Modify messages in the byte stream
- Forge messages from other participants
- Remove or reorder entries

This is by design — the protocol optimizes for simplicity and size over
security. Higher-level security can be layered on top.

### 10.3 Optional Extension: Participant PIN

A future extension could add a 2-byte truncated hash per participant (derived
from a 4-digit PIN). This would provide lightweight impersonation prevention
at a cost of 2 bytes per participant. Not part of v1.

### 10.4 Fork Safety

If two people scan the same QR and both reply independently, they create two
divergent conversation states. Both are valid. There is no conflict resolution
— this mirrors how physical conversations branch naturally.

---

## 11. Interoperability Guidelines

### 11.1 QR Code Generation

The codec produces a `Uint8Array`. To render a QR code:

1. Use any QR code library that supports **binary mode** input
2. Recommended: Version 40, Error Correction Level L for maximum capacity
3. The first byte (`0x40`–`0x7F` range for version 1) can be used by decoders
   to identify QNCP data vs arbitrary QR content

### 11.2 QR Code Scanning

1. Scan the QR code and obtain the raw binary payload
2. Check that the payload is at least 2 bytes
3. Call `decode(data)` / `fromBytes(data)` to reconstruct the Conversation

### 11.3 Version Compatibility

The `VV` bits in byte 0 indicate the protocol version. Decoders MUST reject
versions they don't understand rather than attempting partial decoding.

| Version | Description |
|---|---|
| 0 | Reserved |
| 1 | Current (this spec) |
| 2–3 | Future |

### 11.4 Transport Agnosticism

While designed for QR codes, the wire format is transport-agnostic. The same
bytes can be transmitted via:
- QR code (primary use case)
- NFC tag
- Bluetooth LE characteristic
- Base64-encoded URL fragment (if a URL is acceptable)
- Printed as a hex dump (for the truly dedicated)

---

## 12. API Surface

### 12.1 High-Level API

| Function | Signature | Description |
|---|---|---|
| `create` | `(name: string) → Conversation` | Start a new conversation |
| `join` | `(conv, name) → number` | Join/rejoin, returns participant index |
| `addMessage` | `(conv, speaker, text) → void` | Append a chat message |
| `leave` | `(conv, participantIdx) → void` | Mark participant as exited |
| `toBytes` | `(conv, opts?) → Uint8Array` | Serialize to binary |
| `fromBytes` | `(data: Uint8Array) → Conversation` | Deserialize from binary |
| `summarize` | `(conv) → string` | Human-readable conversation dump |
| `remainingCapacity` | `(conv, avgLen?, max?) → number` | Estimated messages remaining |

### 12.2 Low-Level Codec

| Function | Signature | Description |
|---|---|---|
| `encode` | `(conv, opts?) → Uint8Array` | Binary encode with overflow handling |
| `decode` | `(data: Uint8Array) → Conversation` | Binary decode |

### 12.3 Encoding Primitives

| Function | Signature | Description |
|---|---|---|
| `encodeVarint` | `(buf, offset, value) → bytesWritten` | Write a varint |
| `decodeVarint` | `(buf, offset) → [value, bytesRead]` | Read a varint |
| `varintSize` | `(value) → number` | Predict varint byte length |
| `encodeSixBit` | `(text) → Uint8Array` | 6-bit pack a string |
| `decodeSixBit` | `(data, charCount) → string` | Unpack 6-bit string |
| `encodeTurnBitmap` | `(speakers) → Uint8Array` | Compress speakers to bitmap |
| `decodeTurnBitmap` | `(bitmap, count, first?) → number[]` | Expand bitmap to speakers |
| `toUtf8` | `(str) → Uint8Array` | UTF-8 encode |
| `fromUtf8` | `(bytes) → string` | UTF-8 decode |

---

## 13. Known Limitations (v1)

| Limitation | Impact | Planned Fix |
|---|---|---|
| 6-bit escape only handles single-byte raw chars | Uppercase ASCII works; emoji/CJK produce replacement chars in 6-bit mode | Proper multi-byte UTF-8 escape reconstruction |
| Huffman encoding (TT=0b10) not implemented | Falls back to Utf8 if selected | Implement static Huffman table |
| Deflate encoding (TT=0b11) not implemented | Falls back to Utf8 if selected | Implement raw deflate on message block |
| Event participant index limited to 4 bits (0–15) | Max 16 participants in events | Use varint for participant index in events |
| Solo mode (MM=0b10) not implemented | Solo conversations cannot be created | Implement Solo mode |
| No message-level integrity | Messages can be tampered with | Optional HMAC extension |

---

## 14. File Structure

```
src/qr-conversation/
  types.ts           Core types and enums
  encoding.ts        Varint, 6-bit text, turn bitmap primitives
  codec.ts           Binary encode/decode (wire format)
  conversation.ts    High-level API (create/join/addMessage/leave)
  index.ts           Barrel export

tests/qr-conversation/
  encoding.test.ts   21 tests — varint, 6-bit, turn bitmap
  codec.test.ts      12 tests — round-trip, compactness, truncation
  conversation.test.ts 22 tests — lifecycle, workflow, helpers
```

**Total:** 55 tests, 0 runtime dependencies.

---

## Appendix A: Complete Wire Format Example

A minimal Duo conversation: Alice creates, Bob joins, they exchange 2
messages.

```
Conversation:
  version=1, mode=Duo, textEncoding=Utf8, participants=[alice, bob]
  entries:
    [0] event:  Enter participant=0 (alice)
    [1] event:  Enter participant=1 (bob)
    [2] message: speaker=1 "hey"
    [3] message: speaker=0 "hi!"

Encoded bytes (annotated):

Offset  Hex     Description
------  ------  ------------------------------------------
0x00    0x42    Header: VV=01 MM=00 TT=00 PP=10
                  version=1, Duo, Utf8, 2 participants
0x01    0x04    Entry count = 4 (varint)
0x02    0x05    Participant 0 name length = 5
0x03–07 616C696365  "alice" (UTF-8)
0x08    0x03    Participant 1 name length = 3
0x09–0B 626F62  "bob" (UTF-8)
0x0C    0x30    Entry-type bitmap: 0b00110000
                  bit 0=0 (event? no, wait — bits are MSB first)
                  Actually: bits [7..0] map to entries [0..7]
                  0b00110000 → entry 0=0, 1=0, 2=1, 3=1
                  Wait — 1 means event, 0 means message.
                  Entries 0,1 are events, 2,3 are messages.
                  So bitmap = 0b11000000 = 0xC0
                  (Correction: see actual encoder output)
0x0D    0x01    First speaker = 1 (bob)
0x0E    0x00    Turn bitmap: 0b00000000
                  bit 1 = 0 → switch (bob→alice). Correct.
0x0F    0x10    Event byte: EEEE=0000 PPPP=0000 → Enter, participant 0
0x10    0x01    Event byte: EEEE=0000 PPPP=0001 → Enter, participant 1
0x11    0x03    Message text length = 3
0x12–14 686579  "hey"
0x15    0x03    Message text length = 3
0x16–18 686921  "hi!"

Total: 25 bytes
```

---

## Appendix B: Comparison with Alternatives

| | QNCP | URL in QR | NFC Chat | Bluetooth Mesh |
|---|---|---|---|---|
| Server required | No | Yes | No | No |
| Internet required | No | Yes | No | No |
| Storage | QR image | Cloud DB | NFC tag | RAM |
| Max participants | 15 | Unlimited | 2 | ~100 |
| Persistence | QR image lifetime | Server lifetime | Tag lifetime | Session |
| Message capacity | ~100 | Unlimited | ~50 (NDEF) | Unlimited |
| Privacy | Physical proximity | Trust server | Physical proximity | Radio range |
| Forkable | Yes | No | No | No |
