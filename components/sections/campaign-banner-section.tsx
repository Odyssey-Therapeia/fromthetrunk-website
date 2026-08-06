"use client";

import { useState } from "react";
import Image from "next/image";

type CampaignBanner = {
  alt: string;
  image: string;
};

const campaignBanners: CampaignBanner[] = [
  {
    image: "/banner/banner1.avif",
    alt: "Grand Launch Edit, The Trunk Opens campaign banner",
  },
  {
    image: "/banner/banner2.avif",
    alt: "New Arrivals, Newly Yours campaign banner",
  },
  {
    image: "/banner/banner3.avif",
    alt: "Provenance Promise, Every Weave Remembers campaign banner",
  },
];

export function CampaignBannerSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeBanner = campaignBanners[activeIndex];

  return (
    <section className="bg-[#FDF7F1] px-6 py-14 sm:px-10 md:py-20 lg:px-12 xl:px-16">
      <div className="mx-auto max-w-[100rem]">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[#0E0D0E] shadow-[0_28px_90px_rgba(96,29,28,0.2)]">
          <Image
            key={activeBanner.image}
            src={activeBanner.image}
            alt={activeBanner.alt}
            fill
            fetchPriority="low"
            sizes="(max-width: 1280px) 100vw, 1440px"
            className="object-cover"
          />
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
            {campaignBanners.map((banner, index) => (
              <button
                key={banner.image}
                type="button"
                aria-label={`Show campaign banner ${index + 1}`}
                aria-current={activeIndex === index ? "true" : undefined}
                onClick={() => setActiveIndex(index)}
                className={
                  activeIndex === index
                    ? "h-2 w-7 rounded-full bg-[#FDF7F1]"
                    : "h-2 w-2 rounded-full bg-[#FDF7F1]/45 hover:bg-[#FDF7F1]/75"
                }
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
