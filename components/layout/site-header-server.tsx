import Image from "next/image";
import Link from "next/link";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { SiteHeaderDesktopNav } from "@/components/layout/site-header-nav";
import { SiteHeaderControls } from "@/components/layout/site-header-controls";

export async function SiteHeaderServer() {
  return (
    <header className="sticky top-0 z-50 bg-[#FDF7F1]/95 backdrop-blur">
      <AnnouncementBar />
      <div className="border-b border-[#601D1C]/10">
        <div className="flex h-16 w-full items-stretch justify-between gap-2 px-3 sm:px-5 md:px-8 lg:px-10 xl:h-18 xl:px-14">
          <div className="flex min-w-0 flex-1 items-center gap-4 xl:gap-10">
            <Link href="/" className="flex h-full shrink-0 items-center">
              <Image
                src="/logo.png"
                alt="From the Trunk"
                width={180}
                height={100}
                className="h-14 w-auto object-contain xl:h-[4.25rem]"
                sizes="180px"
              />
              <span className="sr-only">From the Trunk</span>
            </Link>
            <SiteHeaderDesktopNav />
          </div>

          <SiteHeaderControls />
        </div>
      </div>
    </header>
  );
}
