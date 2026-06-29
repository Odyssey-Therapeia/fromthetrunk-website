"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Heart,
  LogOut,
  MapPin,
  Package,
  ShieldCheck,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildClientCallbackUrl } from "@/lib/auth/client-callback-url";
import { useUiHaptics } from "@/lib/haptics/use-ui-haptics";
import { cn } from "@/lib/utils";

const navLinks = [
  {
    href: "/account/profile",
    label: "Profile",
    icon: User,
    description: "Contact details",
  },
  {
    href: "/account/addresses",
    label: "Addresses",
    icon: MapPin,
    description: "Saved delivery",
  },
  {
    href: "/account/orders",
    label: "Orders",
    icon: Package,
    description: "Trunk history",
  },
  {
    href: "/account/wishlist",
    label: "Wishlist",
    icon: Heart,
    description: "Saved pieces",
  },
] as const;

const authRoutes = ["/account/sign-in", "/account/sign-up"];

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { nudge } = useUiHaptics();

  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));
  const firstName = session?.user?.name?.split(" ")?.[0] ?? "there";

  if (isAuthRoute) {
    return (
      <div className="min-h-[calc(100vh-8rem)] bg-ftt-ivory">{children}</div>
    );
  }

  return (
    <section className="bg-ftt-ivory px-3 py-6 sm:px-6 sm:py-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-5 sm:gap-6">
        <Card className="ftt-account-reveal max-w-full overflow-hidden rounded-[1.5rem] border-ftt-border bg-ftt-navy text-ftt-ivory shadow-[0_22px_70px_rgba(20,29,70,0.16)] sm:rounded-[2rem] lg:grid lg:grid-cols-[minmax(0,1fr)_420px] [&>*]:min-w-0">
          <CardContent className="relative flex flex-col gap-6 overflow-hidden p-5 sm:gap-8 sm:p-8 lg:p-10">
            <div className="absolute right-8 top-8 hidden size-28 rounded-full border border-ftt-gold/20 lg:block" />
            <div className="absolute right-14 top-14 hidden size-12 rounded-full bg-ftt-gold/10 lg:block" />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,#141D46_0%,#10183B_62%,#601D1C_155%)]" />

            <div className="relative z-10">
              <Badge className="rounded-full border border-ftt-gold/35 bg-ftt-gold/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.28em] text-ftt-gold">
                My Trunk
              </Badge>

              <h1 className="mt-5 max-w-3xl break-words font-serif text-[clamp(2.35rem,13vw,6.4rem)] font-medium leading-[0.92] text-ftt-ivory sm:text-[clamp(2.7rem,6vw,6.4rem)]">
                Welcome, {firstName}.
              </h1>

              <p className="mt-5 max-w-xl text-sm leading-7 text-ftt-ivory/72 sm:text-base">
                Manage the details that make checkout faster: saved addresses,
                wishlist pieces, contact information, and your trunk history.
              </p>
            </div>

            <div className="relative z-10 flex flex-wrap gap-3">
              <Button
                asChild
                className="rounded-full bg-ftt-gold px-6 text-ftt-midnight hover:bg-[#C7A45F]"
              >
                <Link href="/collection">Explore the collection</Link>
              </Button>

              {session ? (
                <Button
                  variant="outline"
                  className="rounded-full border-ftt-ivory/35 bg-transparent px-6 text-ftt-ivory hover:bg-ftt-ivory/10 hover:text-ftt-ivory"
                  onClick={async () => {
                    nudge();
                    const result = await signOut({
                      callbackUrl: buildClientCallbackUrl("/", "/"),
                      redirect: false,
                    });
                    router.push(buildClientCallbackUrl(result?.url, "/"));
                    router.refresh();
                  }}
                >
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </Button>
              ) : null}
            </div>
          </CardContent>

          <div className="border-t border-white/10 bg-ftt-card p-5 lg:border-l lg:border-t-0">
            <div className="grid h-full gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <AccountPromise
                icon={<ShieldCheck className="size-4" />}
                title="Verified details"
                body="Keep contact and delivery information ready for checkout."
              />
              <AccountPromise
                icon={<Heart className="size-4" />}
                title="Saved pieces"
                body="Return to the sarees you are thinking about before they are gone."
              />
              <AccountPromise
                icon={<Package className="size-4" />}
                title="Trunk history"
                body="Track orders and revisit past purchases."
              />
            </div>
          </div>
        </Card>

        <div className="grid max-w-full gap-6 lg:grid-cols-[290px_minmax(0,1fr)] lg:items-start [&>*]:min-w-0">
          <aside className="min-w-0 lg:sticky lg:top-28">
            <nav
              aria-label="Account navigation"
              className="flex max-w-full gap-2 overflow-x-auto rounded-[1.35rem] border border-ftt-border bg-ftt-card/90 p-2 shadow-[0_14px_38px_rgba(20,29,70,0.08)] backdrop-blur sm:rounded-[1.5rem] lg:flex-col"
            >
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive =
                  pathname === link.href || pathname.startsWith(`${link.href}/`);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex min-h-12 min-w-fit items-center gap-3 rounded-full border px-4 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ftt-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ftt-ivory lg:min-w-0 lg:rounded-[1.1rem]",
                      isActive
                        ? "border-ftt-gold/60 bg-ftt-navy text-ftt-ivory shadow-[0_12px_28px_rgba(20,29,70,0.16)]"
                        : "border-transparent bg-transparent text-ftt-burgundy/70 hover:border-ftt-gold/40 hover:bg-ftt-gold/10 hover:text-ftt-navy",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full",
                        isActive
                          ? "bg-ftt-gold/18 text-ftt-gold"
                          : "bg-ftt-ivory text-ftt-burgundy",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>

                    <span className="min-w-0">
                      <span className="block">{link.label}</span>
                      <span
                        className={cn(
                          "hidden text-xs font-normal lg:block",
                          isActive ? "text-ftt-ivory/58" : "text-ftt-burgundy/45",
                        )}
                      >
                        {link.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </section>
  );
}

function AccountPromise({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="ftt-account-glow-card rounded-[1.25rem] border border-ftt-border bg-ftt-ivory p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-ftt-gold/12 text-ftt-gold">
          {icon}
        </div>
        <div>
          <p className="font-serif text-xl leading-tight text-ftt-navy">
            {title}
          </p>
          <p className="mt-1 text-xs leading-5 text-ftt-burgundy/62">{body}</p>
        </div>
      </div>
    </div>
  );
}
