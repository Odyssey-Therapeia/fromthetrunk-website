"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function DrapeRoomConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  isBusy = false,
  destructive = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  isBusy?: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <DialogContent className="z-[110] w-[calc(100%-2rem)] max-w-md rounded-[1.5rem] border-ftt-border bg-ftt-ivory p-5 text-ftt-navy motion-reduce:animate-none motion-reduce:transition-none @container @sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="font-serif text-3xl leading-tight">
            {title}
          </DialogTitle>
          <DialogDescription className="pt-2 leading-6 text-ftt-navy/65">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 @sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="min-h-11 rounded-full border-ftt-border bg-ftt-card text-ftt-burgundy"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isBusy}
            onClick={onConfirm}
            className={cn(
              "min-h-11 rounded-full text-ftt-ivory",
              destructive
                ? "bg-destructive hover:bg-destructive/90"
                : "bg-ftt-burgundy hover:bg-ftt-navy",
            )}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
