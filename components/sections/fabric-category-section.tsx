import { existsSync } from "fs";
import { join } from "path";
import Link from "next/link";

import {
  FabricCategoryMotionGrid,
  type FabricMotionCategory,
} from "@/components/sections/fabric-category-motion-grid";

type FabricCategory = {
  bestFor: string;
  description: string;
  fallbackImage: string;
  href: string;
  image: string;
  name: string;
};

const fabricCategories: FabricCategory[] = [
  {
    name: "Georgette",
    bestFor: "Best for fluid movement and evening ease",
    description:
      "Choose georgette when you want a graceful fall, soft pleats, and a saree that feels dressed without feeling heavy.",
    href: "/collection?fabric=georgette",
    image: "/category/georgette.jpg",
    fallbackImage: "/hero/timeless.JPG",
  },
  {
    name: "Cotton",
    bestFor: "Best for warm days and everyday elegance",
    description:
      "Cotton is breathable, grounded, and easy to wear for daytime gatherings, workwear, and relaxed heritage styling.",
    href: "/collection?fabric=cotton",
    image: "/category/cotton.JPG",
    fallbackImage: "/media/hero-bg.png",
  },
  {
    name: "Kanjeevaram",
    bestFor: "Best for weddings and ceremonial presence",
    description:
      "Pick Kanjeevaram for structure, rich silk weight, zari detail, and a saree that holds a formal silhouette beautifully.",
    href: "/collection?fabric=kanjeevaram",
    image: "/category/kanjiverram.jpg",
    fallbackImage: "/hero/banner.png",
  },
  {
    name: "Silk",
    bestFor: "Best for timeless polish and soft sheen",
    description:
      "Silk brings luminosity and refinement, making it a dependable choice for festive dinners, family events, and heirloom dressing.",
    href: "/collection?fabric=silk",
    image: "/category/silk.JPG",
    fallbackImage: "/hero/banner1.png",
  },
  {
    name: "Kota Cotton",
    bestFor: "Best for feather-light summer drapes",
    description:
      "Kota cotton feels airy and crisp, with a light grid texture that suits warm weather and understated occasion wear.",
    href: "/collection?fabric=kota-cotton",
    image: "/category/Kota_Cotton.jpg",
    fallbackImage: "/hero/you.png",
  },
  {
    name: "Chiffon",
    bestFor: "Best for soft flow and delicate styling",
    description:
      "Chiffon is sheer, light, and feminine, ideal when you want a saree that moves gently and keeps the look minimal.",
    href: "/collection?fabric=chiffon",
    image: "/category/Chiffon.JPG",
    fallbackImage: "/media/home-cover.png",
  },
  {
    name: "Kanjeevaram Mix",
    bestFor: "Best for festive richness with easier wear",
    description:
      "A Kanjeevaram mix keeps the celebratory mood but can feel lighter and more flexible for long events.",
    href: "/collection?fabric=kanjeevaram-mix",
    image: "/category/kanji_mix.JPG",
    fallbackImage: "/hero/banner.png",
  },
  {
    name: "Organza",
    bestFor: "Best for sculpted volume and modern occasion looks",
    description:
      "Organza has a crisp, sheer body that creates shape and drama while still feeling light on the shoulder.",
    href: "/collection?fabric=organza",
    image: "/category/Organza.JPG",
    fallbackImage: "/hero/timeless.JPG",
  },
  {
    name: "Cotton Silk",
    bestFor: "Best for comfort with a refined finish",
    description:
      "Cotton silk balances breathable ease with a soft sheen, making it versatile for day-to-evening dressing.",
    href: "/collection?fabric=cotton-silk",
    image: "/category/Cotton_Silk.JPG",
    fallbackImage: "/hero/banner1.png",
  },
];

const fabricQuickLinks = [
  {
    label: "Light & airy",
    href: "/collection?fabric=kota-cotton",
    note: "Kota, chiffon, organza",
  },
  {
    label: "Everyday ease",
    href: "/collection?fabric=cotton",
    note: "Cotton, cotton silk",
  },
  {
    label: "Ceremonial",
    href: "/collection?fabric=kanjeevaram",
    note: "Kanjeevaram, silk",
  },
  {
    label: "Soft flow",
    href: "/collection?fabric=georgette",
    note: "Georgette, chiffon",
  },
  {
    label: "Modern volume",
    href: "/collection?fabric=organza",
    note: "Organza",
  },
] as const;

function publicImageExists(src: string) {
  return existsSync(join(process.cwd(), "public", src.replace(/^\//, "")));
}

export function FabricCategorySection() {
  const categories: FabricMotionCategory[] = fabricCategories.map((fabric) => ({
    ...fabric,
    imageSrc: publicImageExists(fabric.image)
      ? fabric.image
      : fabric.fallbackImage,
  }));

  return (
    <section className="bg-[#FDF7F1] px-5 py-16 sm:px-6 md:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 border-b border-[#601D1C]/10 pb-8">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#74531B]">
              Shop By Fabric
            </p>

            <h2 className="mt-4 max-w-3xl font-serif text-[clamp(2.45rem,4.6vw,5rem)] leading-[0.95] text-[#601D1C]">
              Choose by feel, drape, and occasion.
            </h2>

            <p className="mt-5 max-w-2xl text-base leading-7 text-[#601D1C]/70">
              Fabric changes how a saree sits, moves, and carries memory. Start
              with the texture that suits your moment.
            </p>
          </div>
        </div>

        <div className="mb-8 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {fabricQuickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group shrink-0 rounded-full border border-[#601D1C]/16 bg-[#FFFCF8]/70 px-4 py-2 text-left shadow-[0_8px_22px_rgba(96,29,28,0.05)] transition hover:-translate-y-0.5 hover:border-[#B39152]/70 hover:bg-[#B39152]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1]"
            >
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#601D1C] transition group-hover:text-[#74531B]">
                {item.label}
              </span>
              <span className="mt-0.5 block text-[11px] text-[#601D1C]/72">
                {item.note}
              </span>
            </Link>
          ))}
        </div>

        <FabricCategoryMotionGrid categories={categories} />
      </div>
    </section>
  );
}
