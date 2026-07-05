"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { OtpAuthPanel } from "@/components/account/otp-auth-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface WishlistButtonProps {
  productId: string;
  productName: string;
  className?: string;
}

const fetchWishlist = async (): Promise<string[]> => {
  const res = await fetch("/api/v2/wishlist");
  if (!res.ok) return [];
  return (await res.json()) as string[];
};

// Signals the header heart badge (which lives outside React Query) to refresh.
const notifyWishlistChanged = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ftt:wishlist-updated"));
  }
};

export function WishlistButton({
  productId,
  productName,
  className,
}: WishlistButtonProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [optimisticWished, setOptimisticWished] = useState<boolean | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);

  // Account-backed wishlist (only when logged in).
  // Key ["wishlist","ids"] — returns string[].
  // Distinct from ["wishlist","products"] used by the wishlist page (returns Product[]).
  // Invalidating ["wishlist"] (prefix) refreshes both.
  const { data: wishlist } = useQuery({
    queryKey: ["wishlist", "ids"],
    queryFn: fetchWishlist,
    enabled: Boolean(session?.user?.id),
    staleTime: 30_000,
  });

  // Determine current saved state: optimistic override → account list → guest list.
  const isInWishlist =
    optimisticWished ??
    (session?.user?.id
      ? (wishlist ?? []).some((item) => item === productId)
      : false);

  // ── Account mutations ──────────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: async (targetProductId: string) => {
      const res = await fetch("/api/v2/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: targetProductId }),
      });
      if (!res.ok) throw new Error("Failed to add");
      return res.json();
    },
    onMutate: () => setOptimisticWished(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      notifyWishlistChanged();
      toast.success("Saved to your trunk");
    },
    onError: () => {
      setOptimisticWished(null);
      toast.error("Unable to save to wishlist");
    },
    onSettled: () => setOptimisticWished(null),
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v2/wishlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) throw new Error("Failed to remove");
      return res.json();
    },
    onMutate: () => setOptimisticWished(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      notifyWishlistChanged();
      toast(`${productName} removed from wishlist`);
    },
    onError: () => {
      setOptimisticWished(null);
      toast.error("Unable to remove from wishlist");
    },
    onSettled: () => setOptimisticWished(null),
  });

  const isPending = addMutation.isPending || removeMutation.isPending;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (session?.user?.id) {
      // Logged-in path: persist to account.
      if (isInWishlist) {
        removeMutation.mutate();
      } else {
        addMutation.mutate(productId);
      }
    } else {
      setPendingProductId(productId);
      setAuthMode("sign-in");
      setAuthOpen(true);
    }
  };

  const handleAuthSuccess = async () => {
    if (!pendingProductId) return;

    try {
      await addMutation.mutateAsync(pendingProductId);
      await queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      setAuthOpen(false);
    } catch {
      setPendingProductId(null);
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    setAuthOpen(open);
    if (!open) {
      setPendingProductId(null);
      setAuthMode("sign-in");
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "rounded-full transition",
          isInWishlist ? "text-red-500 hover:text-red-600" : "text-muted-foreground hover:text-red-400",
          className
        )}
        disabled={isPending}
        onClick={handleClick}
        aria-label={isInWishlist ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
      >
        <Heart
          className={cn("h-5 w-5 transition", isInWishlist && "fill-current")}
        />
      </Button>

      <Dialog open={authOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] overflow-y-auto rounded-[1.75rem] border-ftt-border bg-ftt-ivory p-5 shadow-[0_24px_80px_rgba(20,29,70,0.18)] sm:max-w-xl sm:p-6">
          <DialogHeader className="pr-7 text-left">
            <DialogTitle className="font-serif text-3xl leading-tight text-ftt-navy">
              Save this piece to your trunk
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-ftt-burgundy/65">
              Log in or create an account to keep this one-of-one piece saved.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2 rounded-full border border-ftt-border bg-ftt-card p-1">
            {(["sign-in", "sign-up"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAuthMode(mode)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  authMode === mode
                    ? "bg-ftt-navy text-ftt-ivory shadow-[0_8px_18px_rgba(20,29,70,0.16)]"
                    : "text-ftt-burgundy/65 hover:bg-ftt-gold/10 hover:text-ftt-navy",
                )}
              >
                {mode === "sign-in" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <OtpAuthPanel
            key={authMode}
            mode={authMode}
            context="wishlist"
            compact
            onCancel={() => handleDialogOpenChange(false)}
            onSuccess={handleAuthSuccess}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
