export type AdminReleaseHighlight = {
  area: "Admin" | "Images" | "Storefront" | "Quality";
  description: string;
  title: string;
};

export type AdminReleaseNote = {
  demoHref: string;
  highlights: AdminReleaseHighlight[];
  name: string;
  releaseDate: string;
  showAnnouncement: boolean;
  summary: string;
  version: string;
};

export const adminReleases: AdminReleaseNote[] = [
  {
    version: "0.25.0",
    name: "The Showroom Release",
    releaseDate: "2026-04-24",
    showAnnouncement: true,
    demoHref: "/admin/products",
    summary:
      "A sharper catalog workspace for product operations, cleaner image management, and a more premium storefront presentation.",
    highlights: [
      {
        area: "Admin",
        title: "Products are easier to manage",
        description:
          "Cards, gallery, list, and compact views now support faster scanning, sorting, filtering, and bulk selection.",
      },
      {
        area: "Images",
        title: "Cover-image work is visible",
        description:
          "Product cards now make missing covers obvious and the editor gives clearer controls for choosing, reordering, and removing photos.",
      },
      {
        area: "Storefront",
        title: "Collection pages feel more curated",
        description:
          "The collection experience has a stronger editorial frame, responsive product shelves, and cleaner sort/filter behavior.",
      },
      {
        area: "Quality",
        title: "Release checks are part of the rhythm",
        description:
          "This update was packaged with desktop/mobile QA screenshots and demo flows so the team can review the launch quickly.",
      },
    ],
  },
];

export const currentAdminRelease = adminReleases[0];
