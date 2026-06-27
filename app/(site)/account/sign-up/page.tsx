"use client";

import { useSearchParams } from "next/navigation";

import { AccountAuthFrame } from "@/components/account/account-auth-frame";
import { OtpAuthPanel } from "@/components/account/otp-auth-panel";

export default function SignUpPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");

  return (
    <AccountAuthFrame
      mode="sign-up"
      eyebrow="Create account"
      title="Join the trunk."
      body="Create your account to save favourites, track orders, and checkout faster."
      alternateHref={
        callbackUrl
          ? `/account/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`
          : "/account/sign-in"
      }
    >
      <OtpAuthPanel
        mode="sign-up"
        context="account"
        callbackUrl={callbackUrl ?? undefined}
        requireAddress
      />
    </AccountAuthFrame>
  );
}
