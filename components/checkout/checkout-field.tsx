import { cn } from "@/lib/utils";

type CheckoutFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  autoComplete?: string;
  className?: string;
};

/**
 * A single labelled checkout input. UI-font label in gold-tinted burgundy,
 * ivory field on the FTT border, gold focus ring. Used by every address form.
 */
export function CheckoutField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
  error,
  autoComplete,
  className,
}: CheckoutFieldProps) {
  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        className={cn(
          "h-12 w-full rounded-xl border bg-ftt-ivory px-4 text-sm text-ftt-navy outline-none transition",
          "placeholder:text-ftt-burgundy/30 focus:ring-2 disabled:opacity-60",
          error
            ? "border-destructive focus:border-destructive focus:ring-destructive/20"
            : "border-ftt-border focus:border-ftt-gold focus:ring-ftt-gold/20",
        )}
      />
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}
