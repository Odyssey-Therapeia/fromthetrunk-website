import type { PendingCommerceIntent } from "@/lib/commerce/auth-intent";

export type AddToBagIntent = Extract<
  PendingCommerceIntent,
  { type: "add-to-cart" }
>;

const ADD_TO_BAG_REPLAY_EVENT = "ftt:add-to-bag-replay";

type ReplayRequest = {
  completion: null | Promise<void>;
  handled: boolean;
  intent: AddToBagIntent;
};

/**
 * Ask the surface that raised sign-in to resume its own add flow.
 *
 * This keeps the direct click and the post-OTP click on the same code path: the
 * same POST, animation, pulse, toast, and drawer-open signal. The request is
 * synchronously claimed by at most one mounted origin.
 */
export async function replayAddToBagAtOrigin(
  intent: AddToBagIntent,
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const request: ReplayRequest = {
    completion: null,
    handled: false,
    intent,
  };
  window.dispatchEvent(
    new CustomEvent<ReplayRequest>(ADD_TO_BAG_REPLAY_EVENT, {
      detail: request,
    }),
  );

  if (!request.handled || !request.completion) return false;
  await request.completion;
  return true;
}

/** Register one mounted commerce surface as a possible replay origin. */
export function subscribeToAddToBagReplay(
  runner: (intent: AddToBagIntent) => false | Promise<void> | void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    const request = (event as CustomEvent<ReplayRequest>).detail;
    if (!request || request.handled) return;

    const result = runner(request.intent);
    if (result === false) return;

    request.handled = true;
    request.completion = Promise.resolve(result);
  };

  window.addEventListener(ADD_TO_BAG_REPLAY_EVENT, listener);
  return () => window.removeEventListener(ADD_TO_BAG_REPLAY_EVENT, listener);
}
