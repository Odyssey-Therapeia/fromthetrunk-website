"use client";

/**
 * One sign-in surface for every commerce action.
 *
 * A shopper's first "Add to bag", heart or "Notify me" needs an account. If
 * each button raised its own dialog for that, one raised from inside the Drape
 * Room would stack a second aria-modal over the first, leaving the room inert
 * behind a dark screen — which is exactly what happened. So no component owns
 * an auth dialog. They ask here, this provider owns the single dialog, and the
 * action they clicked replays itself once they are signed in.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";

import { useDrapeRoomOperationalStore } from "@/lib/drape-room/client/store";

import {
  forgetIntent,
  readIntent,
  rememberIntent,
  type PendingCommerceIntent,
} from "@/lib/commerce/auth-intent";

export type CommerceIntentInput = Omit<PendingCommerceIntent, "id">;

/** Runs a pending action once its shopper is signed in. */
export type CommerceIntentRunner = (
  intent: PendingCommerceIntent,
) => Promise<void> | void;

type CommerceAuthValue = {
  /**
   * Run now if signed in; otherwise remember it, open the popup, and run it
   * after sign-in. Resolves true when the action ran immediately.
   */
  requireAuth: (intent: CommerceIntentInput) => boolean;
  /** Register the handler for one intent type. Returns an unsubscribe. */
  registerRunner: (
    type: PendingCommerceIntent["type"],
    runner: CommerceIntentRunner,
  ) => () => void;
  isDialogOpen: boolean;
  closeDialog: () => void;
  /** The action waiting on sign-in, for the dialog's own copy. */
  pendingIntent: PendingCommerceIntent | null;
  /** Called by the dialog once a session exists. */
  onAuthenticated: () => void;
};

const CommerceAuthContext = createContext<CommerceAuthValue | null>(null);

/** Distinct per click without Math.random, which breaks replay determinism. */
let intentCounter = 0;
const nextIntentId = () => `intent-${(intentCounter += 1)}`;

export function CommerceAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const [pendingIntent, setPendingIntent] =
    useState<PendingCommerceIntent | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [runnerRevision, setRunnerRevision] = useState(0);

  const runners = useRef(
    new Map<PendingCommerceIntent["type"], CommerceIntentRunner>(),
  );
  // Replay is once per intent, ever. A double-fire would reserve twice.
  const replayed = useRef(new Set<string>());
  // Survives a storage-less browser; the state copy exists only for the
  // dialog's own wording.
  const pendingIntentRef = useRef<PendingCommerceIntent | null>(null);
  // Whether this popup displaced the Drape Room, so it can be put back.
  const suspendedDrapeRoom = useRef(false);

  const registerRunner = useCallback(
    (type: PendingCommerceIntent["type"], runner: CommerceIntentRunner) => {
      runners.current.set(type, runner);
      // A session can resolve before the runner subtree's effect registers.
      // Wake the replay effect once the handler actually exists so that race
      // cannot consume and silently lose the shopper's click.
      setRunnerRevision((revision) => revision + 1);
      return () => {
        if (runners.current.get(type) === runner) runners.current.delete(type);
      };
    },
    [],
  );

  const runIntent = useCallback((intent: PendingCommerceIntent) => {
    const runner = runners.current.get(intent.type);
    if (!runner) return false;
    if (replayed.current.has(intent.id)) return true;

    replayed.current.add(intent.id);
    void runner(intent);
    return true;
  }, []);

  const openDialogForIntent = useCallback((intent: PendingCommerceIntent) => {
    pendingIntentRef.current = intent;
    setPendingIntent(intent);

    const drape = useDrapeRoomOperationalStore.getState();
    suspendedDrapeRoom.current = drape.isOpen;
    if (drape.isOpen) drape.close();

    setIsDialogOpen(true);
  }, []);

  const requireAuth = useCallback(
    (input: CommerceIntentInput) => {
      const intent = { ...input, id: nextIntentId() } as PendingCommerceIntent;

      if (status === "authenticated") {
        if (runIntent(intent)) return true;

        // The provider can paint before its runner effects register. Queue the
        // click for that very short window instead of reporting it as run.
        pendingIntentRef.current = intent;
        setPendingIntent(intent);
        rememberIntent(intent, Date.now());
        return false;
      }

      pendingIntentRef.current = intent;
      setPendingIntent(intent);
      rememberIntent(intent, Date.now());

      // A click during session loading is remembered, never dropped. Once the
      // session resolves the effect below either runs it or opens this dialog.
      if (status === "unauthenticated") openDialogForIntent(intent);
      return false;
    },
    [openDialogForIntent, runIntent, status],
  );

  /** Put the Drape Room back if this popup displaced it. */
  const restoreDrapeRoom = useCallback(() => {
    if (!suspendedDrapeRoom.current) return;
    suspendedDrapeRoom.current = false;
    useDrapeRoomOperationalStore.getState().reopen();
  }, []);

  const closeDialog = useCallback(() => {
    // Cancelling means cancelling: the action is dropped, not deferred.
    pendingIntentRef.current = null;
    setIsDialogOpen(false);
    setPendingIntent(null);
    forgetIntent();
    restoreDrapeRoom();
  }, [restoreDrapeRoom]);

  const onAuthenticated = useCallback(() => {
    setIsDialogOpen(false);
    restoreDrapeRoom();
  }, [restoreDrapeRoom]);

  /*
   * Replay after the session lands, not when the dialog closes.
   *
   * Sign-in can bounce the router, so the component that made the request may
   * be a fresh mount by now. The ref carries the intent when storage is
   * unavailable (private browsing), and storage carries it across a remount.
   */
  useEffect(() => {
    const intent = pendingIntentRef.current ?? readIntent(Date.now());
    if (!intent) return;

    if (status === "unauthenticated") {
      if (!isDialogOpen) openDialogForIntent(intent);
      return;
    }
    if (status !== "authenticated") return;

    // runIntent is idempotent per intent id, so a re-run of this effect
    // cannot reserve the same saree twice.
    setIsDialogOpen(false);
    restoreDrapeRoom();
    if (!runIntent(intent)) return;
    pendingIntentRef.current = null;
    forgetIntent();
  }, [
    isDialogOpen,
    openDialogForIntent,
    restoreDrapeRoom,
    runIntent,
    runnerRevision,
    status,
  ]);

  const value = useMemo(
    () => ({
      closeDialog,
      isDialogOpen,
      onAuthenticated,
      pendingIntent,
      registerRunner,
      requireAuth,
    }),
    [closeDialog, isDialogOpen, onAuthenticated, pendingIntent, registerRunner, requireAuth],
  );

  return (
    <CommerceAuthContext.Provider value={value}>
      {children}
    </CommerceAuthContext.Provider>
  );
}

/** Null outside the provider, so a button can fall back to its own behaviour. */
export function useCommerceAuth(): CommerceAuthValue | null {
  return useContext(CommerceAuthContext);
}

/**
 * Register the handler for one intent type for as long as this component is
 * mounted. Mount it once, high in the tree — not per card.
 */
export function useCommerceIntentRunner(
  type: PendingCommerceIntent["type"],
  runner: CommerceIntentRunner,
): void {
  const auth = useCommerceAuth();
  const latest = useRef(runner);

  // Kept current in an effect, not during render, so the registration below
  // never has to re-run just because the caller passed a new closure.
  useEffect(() => {
    latest.current = runner;
  }, [runner]);

  const register = auth?.registerRunner;
  useEffect(() => {
    if (!register) return;
    return register(type, (intent) => latest.current(intent));
  }, [register, type]);
}
