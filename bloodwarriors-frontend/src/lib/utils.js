/* ============================================================
   Shared frontend utilities
   ============================================================ */

/**
 * Deterministic encrypted user_id generator.
 * Strips whitespace, lowercases, converts each char to hex, then
 * slices/pads to a stable 16 hex chars prefixed with the `\x` token
 * to match the SQLite schema.
 *
 * DETERMINISTIC BY DESIGN — same name always yields the same id (no
 * timestamp). This is the single source of truth used by BOTH the form
 * (Register.jsx) and the chat flow (DonorChat.jsx), resolving the prior
 * divergence that created duplicate donor rows for the same person.
 */
export function generateEncryptedUserId(fullName) {
  const cleaned = fullName.replace(/\s+/g, '').toLowerCase();
  const hexChars = Array.from(cleaned)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
  const normalized = hexChars.slice(0, 16).padEnd(16, '0');
  return `\\x${normalized}`;
}
