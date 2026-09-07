"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, ImagePlus, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { PhotoGuidanceWarning } from "@/lib/drape-room/client/photo-processing";
import { drapeRoomStorage, type StoredUserPhoto } from "@/lib/drape-room/client/storage";
import { useDrapeRoomOperationalStore } from "@/lib/drape-room/client/store";
import { cn } from "@/lib/utils";
import {
  DrapeRoomCachedGallery,
  type DrapeRoomCachedPreview,
} from "./drape-room-cached-gallery";
import { DRAPE_ROOM_PHOTO_TIP } from "./drape-room-copy";

export interface DrapeRoomPhotoMenuProps {
  className?: string;
}

export function DrapeRoomPhotoMenu({ className }: DrapeRoomPhotoMenuProps) {
  const router = useRouter();
  const selectedSaree = useDrapeRoomOperationalStore((state) => state.selectedSaree);
  const drapeUiAvailable = useDrapeRoomOperationalStore(
    (state) => state.drapeUiAvailable,
  );
  const open = useDrapeRoomOperationalStore((state) => state.open);
  const activeRequestId = useDrapeRoomOperationalStore(
    (state) => state.activeRequestId,
  );
  const photoRevision = useDrapeRoomOperationalStore((state) => state.photoRevision);
  const notifyPhotoChanged = useDrapeRoomOperationalStore((state) => state.notifyPhotoChanged);
  const [photo, setPhoto] = React.useState<StoredUserPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [viewOpen, setViewOpen] = React.useState(false);
  const [replaceOpen, setReplaceOpen] = React.useState(false);
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [cachedOpen, setCachedOpen] = React.useState(false);
  const [cachedPreviews, setCachedPreviews] = React.useState<
    DrapeRoomCachedPreview[]
  >([]);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const menuTriggerRef = React.useRef<HTMLButtonElement>(null);
  const preparation = React.useRef<AbortController | null>(null);
  const previewUrlRef = React.useRef<string | null>(null);
  const cachedPreviewUrls = React.useRef<string[]>([]);

  const revokeCachedPreviewUrls = React.useCallback(() => {
    cachedPreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    cachedPreviewUrls.current = [];
  }, []);

  const closeCachedGallery = React.useCallback(() => {
    setCachedOpen(false);
    setCachedPreviews([]);
    revokeCachedPreviewUrls();
    window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
  }, [revokeCachedPreviewUrls]);

  const installPhoto = React.useCallback((record: StoredUserPhoto | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextUrl = record ? URL.createObjectURL(record.blob) : null;
    previewUrlRef.current = nextUrl;
    setPhoto(record);
    setPreviewUrl(nextUrl);
  }, []);

  React.useEffect(() => {
    let active = true;
    void drapeRoomStorage.getUserPhoto().then((record) => {
      if (active) installPhoto(record);
    });
    return () => {
      active = false;
    };
  }, [installPhoto, photoRevision]);

  React.useEffect(
    () => () => {
      preparation.current?.abort();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      revokeCachedPreviewUrls();
    },
    [revokeCachedPreviewUrls],
  );

  const openDrapeRoom = async (opener: HTMLButtonElement) => {
    if (selectedSaree && drapeUiAvailable) {
      open(selectedSaree, menuTriggerRef.current ?? opener);
      return;
    }

    setBusy(true);
    try {
      const records = await drapeRoomStorage.listRendersForPhoto(photo?.digest ?? "");
      if (records.length === 0) {
        toast("Tap Drape Room on a saree to choose what you want to try.");
        router.push("/collection");
        return;
      }
      revokeCachedPreviewUrls();
      const previews = records.map((render) => {
        const previewUrl = URL.createObjectURL(render.blob);
        cachedPreviewUrls.current.push(previewUrl);
        return { render, previewUrl };
      });
      setCachedPreviews(previews);
      setCachedOpen(true);
    } catch {
      toast.error("Your saved Drape Room previews could not be opened.");
    } finally {
      setBusy(false);
    }
  };

  const replacePhoto = async (file: File) => {
    if (useDrapeRoomOperationalStore.getState().activeRequestId) {
      toast("Wait for the current Drape Room preview to finish before replacing your photo.");
      return;
    }
    preparation.current?.abort();
    const controller = new AbortController();
    preparation.current = controller;
    setBusy(true);
    try {
      const { processUserPhoto } = await import(
        "@/lib/drape-room/client/photo-processing"
      );
      const processed = await processUserPhoto(file, { signal: controller.signal });
      const saved = await drapeRoomStorage.replaceUserPhoto({
        blob: processed.blob,
        width: processed.width,
        height: processed.height,
        digest: processed.digest,
        readiness: processed.readiness,
      });
      installPhoto(saved);
      notifyPhotoChanged();
      toast.success(
        photoWarningCopy(processed.warnings) ??
          "Your new photo is ready. Saved previews from the previous photo were removed.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That photo could not be prepared.");
    } finally {
      if (preparation.current === controller) {
        preparation.current = null;
        setBusy(false);
      }
    }
  };

  const removePhoto = async () => {
    if (useDrapeRoomOperationalStore.getState().activeRequestId) {
      toast("Wait for the current Drape Room preview to finish before removing your photo.");
      return;
    }
    setBusy(true);
    try {
      await drapeRoomStorage.clearAllData();
      closeCachedGallery();
      installPhoto(null);
      setViewOpen(false);
      notifyPhotoChanged();
      toast.success("Your photo and local Drape Room previews were removed.");
    } catch {
      toast.error("Your local Drape Room data could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  if (!photo || !previewUrl) return null;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        disabled={busy || Boolean(activeRequestId)}
        aria-label="Choose a replacement Drape Room photo"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void replacePhoto(file);
        }}
      />

      <Popover>
        <PopoverTrigger asChild>
          <button
            ref={menuTriggerRef}
            type="button"
            aria-label="Open Drape Room photo menu"
            className={cn(
              "relative grid min-h-11 min-w-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ftt-gold focus-visible:ring-offset-2",
              className,
            )}
          >
            <Avatar className="size-9 border border-ftt-gold/55 bg-ftt-ivory shadow-sm">
              <AvatarImage src={previewUrl} alt="Your Drape Room photo" className="object-cover" />
              <AvatarFallback><ImagePlus className="size-4" aria-hidden="true" /></AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 grid size-4 place-items-center rounded-full border border-ftt-ivory bg-ftt-navy text-ftt-gold"><Sparkles className="size-2.5" aria-hidden="true" /></span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="z-[85] w-[min(20rem,calc(100vw-1.5rem))] rounded-[1.25rem] border-ftt-border bg-ftt-ivory p-3 text-ftt-navy shadow-[0_18px_54px_rgba(20,29,70,0.18)]">
          <div className="flex items-center gap-3 rounded-xl bg-ftt-card p-3">
            <Avatar className="size-12 border border-ftt-gold/45"><AvatarImage src={previewUrl} alt="Your current Drape Room photo" className="object-cover" /><AvatarFallback>DR</AvatarFallback></Avatar>
            <div><p className="font-serif text-lg leading-tight">Your Drape Room</p><p className="mt-1 text-[11px] text-ftt-burgundy/60">Stored only in this browser</p></div>
          </div>
          <div className="mt-3 grid gap-1">
            <MenuButton icon={Eye} label="View current photo" disabled={busy} onClick={() => setViewOpen(true)} />
            <MenuButton icon={Upload} label="Replace photo" disabled={busy || Boolean(activeRequestId)} onClick={() => setReplaceOpen(true)} />
            <MenuButton icon={Trash2} label="Remove photo" destructive disabled={busy || Boolean(activeRequestId)} onClick={() => setRemoveOpen(true)} />
            <MenuButton
              icon={Sparkles}
              label="Open Drape Room"
              disabled={busy}
              onClick={(event) => {
                void openDrapeRoom(event.currentTarget);
              }}
            />
          </div>
          <p
            className="mt-3 border-t border-ftt-border pt-3 text-[10px] leading-4 text-ftt-burgundy/60"
            role={activeRequestId ? "status" : undefined}
            aria-live={activeRequestId ? "polite" : undefined}
          >
            {activeRequestId
              ? "A Drape Room preview is being created. View and Open remain available; Replace and Remove will unlock when it finishes."
              : "These controls manage browser-local data only and never start image generation."}
          </p>
        </PopoverContent>
      </Popover>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="z-[100] w-[calc(100%-2rem)] max-w-md rounded-[1.5rem] border-ftt-border bg-ftt-ivory p-5 motion-reduce:animate-none motion-reduce:transition-none">
          <DialogHeader className="pr-8 text-left"><DialogTitle className="font-serif text-3xl text-ftt-navy">Your current photo</DialogTitle><DialogDescription>This photo is stored locally in this browser for Drape Room previews.</DialogDescription></DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Your current locally stored Drape Room photo" className="mx-auto max-h-[65dvh] w-auto rounded-2xl object-contain" />
        </DialogContent>
      </Dialog>

      <DrapeRoomCachedGallery
        open={cachedOpen}
        previews={cachedPreviews}
        currentPhotoDigest={photo.digest}
        onClose={closeCachedGallery}
        onSave={({ render, previewUrl: cachedPreviewUrl }) => {
          const anchor = document.createElement("a");
          anchor.href = cachedPreviewUrl;
          anchor.download = `from-the-trunk-${render.productSlug}-nivi-drape.jpg`;
          anchor.rel = "noopener";
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          toast.success("Your image download has started.");
        }}
        onVisit={(productSlug) => {
          closeCachedGallery();
          router.push(`/collection/${productSlug}`);
        }}
      />

      <ConfirmMenuAction
        open={replaceOpen}
        title="Replace your photo?"
        description={`Changing your photo will remove the AI previews saved in this browser for the current photo. Nothing will be generated automatically, and your daily generation limit will not reset. After the new photo passes the local check, choose Create preview with new photo to use 1 generation. ${DRAPE_ROOM_PHOTO_TIP}`}
        confirmLabel="Choose new photo"
        onClose={() => setReplaceOpen(false)}
        onConfirm={() => { setReplaceOpen(false); inputRef.current?.click(); }}
      />
      <ConfirmMenuAction
        open={removeOpen}
        title="Remove photo?"
        description="Remove your photo and locally saved drape previews from this browser? This will not affect your account, authentication, wishlist, cart, reservations, order history, addresses, or products."
        confirmLabel="Remove photo"
        destructive
        onClose={() => setRemoveOpen(false)}
        onConfirm={() => { setRemoveOpen(false); void removePhoto(); }}
      />
    </>
  );
}

function MenuButton({
  icon: Icon,
  label,
  disabled,
  destructive = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  disabled: boolean;
  destructive?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Button type="button" variant="ghost" disabled={disabled} onClick={onClick} className={cn("min-h-11 justify-start rounded-xl", destructive ? "text-destructive hover:bg-destructive/8 hover:text-destructive" : "text-ftt-burgundy hover:bg-ftt-burgundy/8 hover:text-ftt-burgundy")}>
      <Icon aria-hidden={true} /> {label}
    </Button>
  );
}

function ConfirmMenuAction({ open, title, description, confirmLabel, destructive = false, onClose, onConfirm }: { open: boolean; title: string; description: string; confirmLabel: string; destructive?: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="z-[105] w-[calc(100%-2rem)] max-w-md rounded-[1.5rem] border-ftt-border bg-ftt-ivory p-5 text-ftt-navy motion-reduce:animate-none motion-reduce:transition-none @container">
        <DialogHeader className="pr-8 text-left"><DialogTitle className="font-serif text-3xl">{title}</DialogTitle><DialogDescription className="leading-6">{description}</DialogDescription></DialogHeader>
        <DialogFooter className="gap-2 @sm:space-x-0"><Button type="button" variant="outline" onClick={onClose} className="min-h-11 rounded-full">Cancel</Button><Button type="button" onClick={onConfirm} className={cn("min-h-11 rounded-full text-ftt-ivory", destructive ? "bg-destructive" : "bg-ftt-burgundy")}>{confirmLabel}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function photoWarningCopy(warnings: readonly PhotoGuidanceWarning[]): string | null {
  if (warnings.includes("very-small")) return "Photo saved. A larger photo may give a clearer preview.";
  if (warnings.includes("extreme-aspect")) return "Photo saved. A less heavily cropped photo may give a better preview.";
  if (warnings.includes("landscape")) return "Photo saved. Portrait framing may give a more natural preview.";
  return null;
}
