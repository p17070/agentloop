/**
 * QR-Native Conversation Protocol
 *
 * A stateless, serverless chat protocol where the QR code IS the database.
 * No URLs, no IDs, no server — scan, read, reply, regenerate.
 *
 * @example
 * ```ts
 * import { create, join, addMessage, toBytes, fromBytes, summarize } from "./qr-conversation";
 *
 * // Alice starts a conversation
 * const conv = create("alice");
 *
 * // Bob scans the QR and joins
 * const bobIdx = join(conv, "bob");
 *
 * // Bob says hello
 * addMessage(conv, bobIdx, "hey alice!");
 *
 * // Encode to bytes → put in QR code
 * const bytes = toBytes(conv);
 * console.log(`${bytes.length} bytes → QR code`);
 *
 * // Alice scans the QR code
 * const restored = fromBytes(bytes);
 * console.log(summarize(restored));
 * ```
 */

export {
  type Conversation,
  type Participant,
  type ChatMessage,
  type SystemEvent,
  type ConversationEntry,
  type EncodeOptions,
  Mode,
  TextEncoding,
  EventType,
  QR_CAPACITY,
} from "./types.js";

export { encode, decode } from "./codec.js";

export {
  create,
  join,
  addMessage,
  leave,
  toBytes,
  fromBytes,
  summarize,
  remainingCapacity,
} from "./conversation.js";

export {
  encodeVarint,
  decodeVarint,
  varintSize,
  encodeSixBit,
  decodeSixBit,
  encodeTurnBitmap,
  decodeTurnBitmap,
} from "./encoding.js";
