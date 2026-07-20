import type { Metadata } from "next";
import Link from "next/link";

import { publicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = publicPageMetadata({
  title: "Saree Authentication & Provenance | From The Trunk",
  description:
    "How From The Trunk verifies fibre, zari and provenance, so every pre-loved saree you buy is exactly what we say it is.",
  path: "/authentication",
});

export default function AuthenticationPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-4 py-10 sm:px-6 sm:py-14 lg:py-20">
      <header className="space-y-4">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          Trust &amp; Provenance
        </p>
        <h1 className="font-serif text-4xl leading-tight text-foreground sm:text-5xl">
          How We Authenticate Every Pre-Loved Saree
        </h1>
        <p className="text-base leading-8 text-muted-foreground">
          Every saree at From The Trunk is one-of-a-kind and pre-loved, so
          &ldquo;authentic&rdquo; has to mean something specific. Before a piece is
          ever listed, it passes through a hands-on check of fibre, weave, zari and
          condition — and we write down what we find, honestly. Here is exactly what
          that looks like, so you always know that the saree you buy is the saree we
          described.
        </p>
      </header>

      <div className="space-y-8 text-muted-foreground">
        <section className="space-y-3">
          <h2 className="font-serif text-2xl text-foreground">
            The fibre &amp; weave check
          </h2>
          <p className="text-sm leading-7">
            We start with the cloth itself. Each saree is examined in daylight and
            by hand to read the fibre and weave — the drape and weight of silk, the
            transparency of a chiffon or georgette, the grain of a cotton, the
            structure of a Banarasi or Kanjeevaram. Where a claim can&rsquo;t be
            supported, we describe the fabric in plain terms rather than overstating
            it.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-2xl text-foreground">Reading the zari</h2>
          <p className="text-sm leading-7">
            Zari is where a lot of a saree&rsquo;s value and character lives, so we
            look closely at the border, pallu and buti work — the tone of the metal
            thread, how it has aged, and whether it is intact. We note real
            distinctions between fine older zari and modern tested zari, and we flag
            tarnish, pulls or repairs instead of hiding them.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-2xl text-foreground">
            Condition, graded honestly
          </h2>
          <p className="text-sm leading-7">
            A pre-loved saree has a past, and we think that is part of its beauty —
            but only when it is disclosed. Every piece is inspected for fabric
            strength, stains, tears, thinning, and border and pallu integrity. The
            condition and any visible signs of wear are recorded and shown on the
            product page, so there are no surprises when it arrives.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-2xl text-foreground">
            Provenance &amp; the story we can tell
          </h2>
          <p className="text-sm leading-7">
            Wherever a saree&rsquo;s history is known — the era it is from, the region
            of its weave, how it came to us — we pass that story on with the piece.
            When provenance can&rsquo;t be fully verified, we say so plainly rather
            than inventing a narrative. Authenticity, to us, is as much about honesty
            as it is about the cloth.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-2xl text-foreground">
            What authentication means for you
          </h2>
          <p className="text-sm leading-7">
            Because each saree is one-of-one, this process is your assurance: the
            fabric, the zari, the condition and the story on the listing are the ones
            you receive. Every order is packed with its verification record and
            shipped with provenance — so a piece with a past can begin its next
            chapter with you, with nothing hidden.
          </p>
        </section>
      </div>

      <div className="rounded-2xl border border-ftt-gold/25 bg-ftt-gold/8 p-6">
        <p className="text-sm leading-7 text-ftt-burgundy/80">
          Curious how a saree travels from a family trunk to your wardrobe? See{" "}
          <Link
            href="/how-it-works"
            className="font-semibold text-ftt-burgundy underline underline-offset-4 hover:text-ftt-navy"
          >
            how From The Trunk works
          </Link>
          , or read the full{" "}
          <Link
            href="/policies/authentication-condition-policy"
            className="font-semibold text-ftt-burgundy underline underline-offset-4 hover:text-ftt-navy"
          >
            authentication &amp; condition policy
          </Link>
          .
        </p>
        <Link
          href="/collection"
          className="mt-5 inline-flex rounded-full bg-ftt-navy px-5 py-3 text-sm font-semibold text-ftt-ivory transition hover:bg-ftt-burgundy"
        >
          Explore the collection
        </Link>
      </div>
    </div>
  );
}
