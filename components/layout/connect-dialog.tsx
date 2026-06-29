"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Instagram, Loader2, Mail, MessageCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CONTACT_LINKS = [
  {
    label: "Instagram",
    value: "@from.thetrunk",
    href: "https://www.instagram.com/from.thetrunk/",
    Icon: Instagram,
  },
  {
    label: "WhatsApp",
    value: "Chat with us",
    href: "https://wa.me/919731910202",
    Icon: MessageCircle,
  },
  {
    label: "Email",
    value: "hello@fromthetrunk.shop",
    href: "mailto:hello@fromthetrunk.shop",
    Icon: Mail,
  },
] as const;

const fieldClass =
  "h-12 w-full rounded-2xl border border-[#601D1C]/15 bg-[#FFFCF8] px-4 text-sm text-[#141D46] outline-none transition placeholder:text-[#601D1C]/35 focus:border-[#B39152] focus:ring-2 focus:ring-[#B39152]/20";

const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.22em] text-[#601D1C]/65";

export function ConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"error" | "idle" | "success">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const startedAtRef = useRef(0);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (nextOpen) {
      startedAtRef.current = Date.now();
      setStatus("idle");
      setWebsite("");
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setStatus("idle");

    try {
      const response = await fetch("/api/v2/contact/submit", {
        body: JSON.stringify({
          clientSubmissionId:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : undefined,
          email,
          message,
          name,
          pagePath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
          phone: phone || undefined,
          startedAt: startedAtRef.current || undefined,
          topic: topic || undefined,
          website,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Contact submission failed.");
      }

      setName("");
      setEmail("");
      setPhone("");
      setTopic("");
      setMessage("");
      setStatus("success");
      closeTimerRef.current = window.setTimeout(() => {
        handleOpenChange(false);
      }, 900);
    } catch {
      setStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border-[#601D1C]/10 bg-[#FDF7F1]">
        <DialogHeader className="text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#B39152]">
            Connect with us
          </p>
          <DialogTitle className="font-serif text-3xl leading-tight text-[#141D46]">
            Looking for a saree with a story?
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-[#601D1C]/70">
            Tell us what you are dressing for. We will help you discover a
            restored piece that feels personal, considered, and entirely yours.
          </DialogDescription>
        </DialogHeader>

        <form
          onFocusCapture={() => {
            if (!startedAtRef.current) startedAtRef.current = Date.now();
          }}
          onSubmit={handleSubmit}
          className="mt-1 grid gap-4"
        >
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            name="website"
            className="hidden"
            aria-hidden="true"
          />
          <label className="grid gap-1.5">
            <span className={labelClass}>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              required
              className={fieldClass}
            />
          </label>

          <label className="grid gap-1.5">
            <span className={labelClass}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              className={fieldClass}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className={labelClass}>Phone</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+91 ..."
                className={fieldClass}
              />
            </label>

            <label className="grid gap-1.5">
              <span className={labelClass}>Topic</span>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Styling, sourcing, order..."
                className={fieldClass}
              />
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className={labelClass}>Message</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell us what you are looking for…"
              rows={4}
              required
              className={`${fieldClass} h-auto resize-none py-3`}
            />
          </label>

          <div aria-live="polite" className="min-h-5">
            {status === "success" ? (
              <p className="text-sm leading-6 text-[#141D46]">
                Thanks for reaching out. We’ve received your request. Our team
                will contact you shortly.
              </p>
            ) : null}
            {status === "error" ? (
              <p className="text-sm leading-6 text-[#601D1C]">
                We couldn’t send this right now. Please try again.
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#141D46] px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#FDF7F1] transition hover:bg-[#0E0D0E] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {isSubmitting ? "Sending..." : "Send Message"}
          </button>
        </form>

        <div className="mt-1 grid gap-2 sm:grid-cols-3">
          {CONTACT_LINKS.map(({ label, value, href, Icon }) => (
            <a
              key={label}
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel={href.startsWith("http") ? "noreferrer noopener" : undefined}
              className="group rounded-2xl border border-[#601D1C]/10 bg-[#141D46] p-3 text-[#FDF7F1] transition hover:bg-[#601D1C]"
            >
              <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#B39152]">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
              <span className="mt-1 block truncate text-sm text-[#FDF7F1]">
                {value}
              </span>
            </a>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
