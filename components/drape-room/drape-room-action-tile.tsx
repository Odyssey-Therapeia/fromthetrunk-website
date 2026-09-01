"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const drapeRoomActionTileVariants = cva(
  "h-full min-h-[5rem] w-full min-w-0 flex-col gap-1.5 overflow-hidden whitespace-normal rounded-2xl border-ftt-gold/30 bg-ftt-card px-2.5 py-2.5 text-center text-ftt-navy shadow-none hover:border-ftt-gold hover:bg-ftt-gold/10 focus-visible:ring-ftt-gold disabled:bg-ftt-card disabled:opacity-55 [&_svg]:size-[1.125rem]",
  {
    variants: {
      active: {
        true: "border-ftt-gold bg-ftt-gold/10",
        false: "",
      },
    },
    defaultVariants: { active: false },
  },
);

export interface DrapeRoomActionTileProps
  extends Omit<ButtonProps, "children" | "size" | "variant">,
    VariantProps<typeof drapeRoomActionTileVariants> {
  icon: React.ReactNode;
  label: React.ReactNode;
  status?: React.ReactNode;
}

export const DrapeRoomActionTile = React.forwardRef<
  HTMLButtonElement,
  DrapeRoomActionTileProps
>(({ active, className, icon, label, status, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant="outline"
    data-drape-action-tile
    className={cn(drapeRoomActionTileVariants({ active }), className)}
    {...props}
  >
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ftt-navy/7 text-ftt-burgundy">
      {icon}
    </span>
    <span className="w-full min-w-0 text-xs font-semibold leading-tight @sm:text-sm">
      {label}
    </span>
    {status ? (
      <span className="w-full min-w-0 text-[10px] font-medium leading-tight text-ftt-burgundy/65">
        {status}
      </span>
    ) : null}
  </Button>
));
DrapeRoomActionTile.displayName = "DrapeRoomActionTile";
