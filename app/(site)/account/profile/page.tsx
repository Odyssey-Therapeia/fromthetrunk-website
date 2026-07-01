"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type ProfileResponse = {
  email?: string | null;
  name?: string | null;
  phone?: string | null;
};

const fetchProfile = async () => {
  const response = await fetch("/api/v2/users/me");
  if (!response.ok) {
    throw new Error("Unable to load profile.");
  }
  return (await response.json()) as ProfileResponse;
};

const updateProfile = async (payload: { name: string; phone: string }) => {
  const response = await fetch("/api/v2/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Unable to update profile.");
  }
  return response.json();
};

const requestEmailChange = async (payload: { newEmail: string }) => {
  const response = await fetch("/api/v2/users/me/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(json?.message ?? "Unable to request email change.");
  }
  return response.json();
};

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{
    name: null | string;
    phone: null | string;
  }>({
    name: null,
    phone: null,
  });
  const [emailChangeForm, setEmailChangeForm] = useState<{ newEmail: string }>({
    newEmail: "",
  });
  const [emailChangeSent, setEmailChangeSent] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
    enabled: Boolean(session?.user?.id),
  });

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const emailChangeMutation = useMutation({
    mutationFn: requestEmailChange,
    onSuccess: () => {
      setEmailChangeSent(true);
      setEmailChangeForm({ newEmail: "" });
    },
  });

  // Nudge users whose account was created without a name/phone (e.g. a bare OTP
  // sign-in) to finish setting up. Fires once per visit, only when incomplete.
  const incompletePromptedRef = useRef(false);
  useEffect(() => {
    if (!data || incompletePromptedRef.current) return;
    const missingName = !data.name?.trim();
    const missingPhone = !data.phone?.trim();
    if (missingName || missingPhone) {
      incompletePromptedRef.current = true;
      toast("Complete your account", {
        description:
          "Please fill in your name and phone number below to finish setting up your account.",
      });
    }
  }, [data]);

  if (status === "loading") {
    return <AccountStateCard message="Loading your trunk profile..." />;
  }

  if (!session?.user?.id) {
    return (
      <AccountStateCard message="Please sign in to manage your profile.">
        <Button asChild className="mt-4 rounded-full bg-ftt-navy text-ftt-ivory">
          <Link href="/account/sign-in">Sign in</Link>
        </Button>
      </AccountStateCard>
    );
  }

  const resolvedName = form.name ?? data?.name ?? "";
  const resolvedPhone = form.phone ?? data?.phone ?? "";
  const currentEmail = data?.email ?? session.user.email ?? "";

  return (
    <div className="min-w-0 space-y-6">
      <div className="grid max-w-full gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)] lg:items-end [&>*]:min-w-0">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-ftt-gold">
            Profile
          </p>
          <h2 className="mt-2 font-serif text-[clamp(2.4rem,5vw,4.75rem)] leading-[0.94] text-ftt-navy">
            Your saved contact details.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-ftt-burgundy/60">
            Keep your name, phone, and verified email ready so every unique
            checkout stays quick and accurate.
          </p>
        </div>

        <Card className="min-w-0 rounded-[1.5rem] border-ftt-border bg-ftt-navy text-ftt-ivory shadow-[0_18px_50px_rgba(20,29,70,0.13)]">
          <CardContent className="space-y-4 p-5">
            <ProfileCue
              icon={<ShieldCheck className="size-4" />}
              label="Account"
              value="Private trunk access"
            />
            <ProfileCue
              icon={<Mail className="size-4" />}
              label="Email"
              value={currentEmail || "Not added"}
            />
            <ProfileCue
              icon={<Phone className="size-4" />}
              label="Phone"
              value={resolvedPhone || "Add for delivery updates"}
            />
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <AccountStateCard message="Loading profile details..." />
      ) : isError ? (
        <AccountStateCard message="Unable to load your profile right now." />
      ) : (
        <div className="grid max-w-full gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)] [&>*]:min-w-0">
          <form
            className="ftt-account-glow-card min-w-0 rounded-[1.75rem] border border-ftt-border bg-ftt-card p-5 shadow-[0_16px_42px_rgba(20,29,70,0.08)] sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate({
                name: resolvedName,
                phone: resolvedPhone,
              });
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-serif text-3xl leading-none text-ftt-navy">
                  Contact card
                </h3>
                <p className="mt-2 text-sm leading-6 text-ftt-burgundy/58">
                  These details are used for order and delivery communication.
                </p>
              </div>
              <Badge className="rounded-full border border-ftt-gold/35 bg-ftt-gold/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-ftt-gold">
                Verified flow
              </Badge>
            </div>

            <div className="mt-6 grid max-w-full gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <div className="min-w-0 space-y-2">
                <Label
                  htmlFor="name"
                  className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/60"
                >
                  Full name
                </Label>
                <Input
                  id="name"
                  value={resolvedName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="h-12 rounded-xl border-ftt-border bg-ftt-ivory text-ftt-navy focus-visible:ring-ftt-gold/35"
                />
              </div>

              <div className="min-w-0 space-y-2">
                <Label
                  htmlFor="phone"
                  className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/60"
                >
                  Phone number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={resolvedPhone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  className="h-12 rounded-xl border-ftt-border bg-ftt-ivory text-ftt-navy focus-visible:ring-ftt-gold/35"
                />
              </div>

              <div className="min-w-0 space-y-2 sm:col-span-2">
                <Label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/60">
                  Current email
                </Label>
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ftt-border bg-ftt-ivory px-3 py-2">
                  <Mail className="size-4 text-ftt-gold" />
                  <span className="min-w-0 flex-1 break-all text-sm font-medium text-ftt-navy">
                    {currentEmail}
                  </span>
                  <Badge className="rounded-full bg-ftt-navy px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-ftt-ivory">
                    Verified
                  </Badge>
                </div>
              </div>
            </div>

            <Separator className="my-6 bg-ftt-border" />

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                className="rounded-full bg-ftt-navy px-7 text-ftt-ivory hover:bg-ftt-midnight"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Saving..." : "Save changes"}
              </Button>
              {mutation.isSuccess ? (
                <span className="inline-flex items-center gap-2 text-sm font-medium text-ftt-navy">
                  <CheckCircle2 className="size-4 text-ftt-gold" />
                  Details saved
                </span>
              ) : null}
              {mutation.isError ? (
                <p className="text-sm text-ftt-burgundy">
                  Unable to save changes. Please try again.
                </p>
              ) : null}
            </div>
          </form>

          <div className="ftt-account-glow-card min-w-0 rounded-[1.75rem] border border-ftt-border bg-ftt-card p-5 shadow-[0_16px_42px_rgba(20,29,70,0.08)] sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-ftt-gold/12 text-ftt-gold">
                <Mail className="size-4" />
              </div>
              <div>
                <h3 className="font-serif text-3xl leading-none text-ftt-navy">
                  Change email
                </h3>
                <p className="mt-2 text-sm leading-6 text-ftt-burgundy/58">
                  A verification link is sent before your account email changes.
                </p>
              </div>
            </div>

            {emailChangeSent ? (
              <div className="mt-6 rounded-[1.25rem] border border-ftt-gold/30 bg-ftt-gold/10 p-4 text-sm leading-6 text-ftt-navy">
                Check your new inbox. Your email changes only after you confirm
                the verification link.
              </div>
            ) : (
              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (emailChangeForm.newEmail) {
                    emailChangeMutation.mutate({
                      newEmail: emailChangeForm.newEmail,
                    });
                  }
                }}
              >
                <div className="space-y-2">
                  <Label
                    htmlFor="newEmail"
                    className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/60"
                  >
                    New email address
                  </Label>
                  <Input
                    id="newEmail"
                    type="email"
                    value={emailChangeForm.newEmail}
                    onChange={(event) =>
                      setEmailChangeForm({ newEmail: event.target.value })
                    }
                    required
                    className="h-12 rounded-xl border-ftt-border bg-ftt-ivory text-ftt-navy focus-visible:ring-ftt-gold/35"
                  />
                </div>

                <Button
                  type="submit"
                  variant="outline"
                  className="rounded-full border-ftt-gold/45 bg-ftt-ivory px-6 text-ftt-burgundy hover:bg-ftt-gold/10"
                  disabled={emailChangeMutation.isPending}
                >
                  {emailChangeMutation.isPending
                    ? "Sending..."
                    : "Send verification link"}
                </Button>

                {emailChangeMutation.isError ? (
                  <p className="text-sm text-ftt-burgundy">
                    {emailChangeMutation.error instanceof Error
                      ? emailChangeMutation.error.message
                      : "Unable to request email change."}
                  </p>
                ) : null}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountStateCard({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-ftt-border bg-ftt-card p-6 text-sm leading-6 text-ftt-burgundy/60 shadow-sm">
      {message}
      {children}
    </div>
  );
}

function ProfileCue({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-ftt-gold/14 text-ftt-gold">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ftt-gold">
          {label}
        </p>
        <p className="truncate text-sm text-ftt-ivory/75">{value}</p>
      </div>
    </div>
  );
}
