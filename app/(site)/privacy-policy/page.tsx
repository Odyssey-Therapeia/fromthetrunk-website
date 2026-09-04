import { permanentRedirect } from "next/navigation";

/** Keep the legacy public URL aligned with the canonical policy source. */
export default function PrivacyPolicyPage() {
  permanentRedirect("/policies/privacy-policy");
}
