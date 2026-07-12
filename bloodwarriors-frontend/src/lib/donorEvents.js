/* ============================================================
   donorEvents — lightweight pub/sub for donor-registry mutations
   ============================================================
   The app has no global store (no Redux/React Query). The NGO
   dashboards (Overview, Analytics) fetch once on mount, so a donor
   registered from Register.jsx / DonorChat.jsx never reflects until
   a manual refresh.

   This tiny bus closes that gap with zero dependencies:
     · same-tab delivery  → window CustomEvent
     · cross-tab delivery → BroadcastChannel (same browser, other tabs)

   Producers call emitDonorCreated() after a *successful* POST /donors.
   Consumers subscribe with onDonorCreated() (returns an unsubscribe
   cleanup suitable for a useEffect return) and re-fetch their data.

   Note: BroadcastChannel intentionally does NOT echo a message back to
   the sending context, so same-tab consumers hear only the window event
   and cross-tab consumers hear only the channel — no double refetch.
   ============================================================ */

const EVENT = 'donor:created';
const CHANNEL_NAME = 'raktasetu:donor-events';

const channel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel(CHANNEL_NAME)
    : null;

/**
 * Announce that a donor was successfully created.
 * @param {object} detail — optional metadata (e.g. { bloodGroup, source }).
 */
export function emitDonorCreated(detail = {}) {
  const payload = { type: EVENT, detail, ts: Date.now() };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: payload }));
  }
  if (channel) {
    try {
      channel.postMessage(payload);
    } catch {
      /* channel closed — same-tab listeners still fired above */
    }
  }
}

/**
 * Subscribe to donor-created events.
 * @param {(payload: {type, detail, ts}) => void} handler
 * @returns {() => void} unsubscribe cleanup (call in useEffect return).
 */
export function onDonorCreated(handler) {
  const winHandler = (e) => handler(e.detail);
  const chanHandler = (e) => handler(e.data);

  if (typeof window !== 'undefined') {
    window.addEventListener(EVENT, winHandler);
  }
  if (channel) {
    channel.addEventListener('message', chanHandler);
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(EVENT, winHandler);
    }
    if (channel) {
      channel.removeEventListener('message', chanHandler);
    }
  };
}
