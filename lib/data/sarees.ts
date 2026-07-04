export interface Saree {
  id: string;
  name: string;
  slug: string;
  price: number;
  originalPrice?: number;
  images: string[];
  story: {
    title: string;
    narrative: string;
    provenance?: string;
    era?: string;
  };
  details: {
    fabric: string;
    length: string;
    width: string;
    condition: string;
    designer?: string;
    occasion: string[];
  };
  featured: boolean;
}

export const sarees: Saree[] = [
  {
    id: "ftt-01",
    name: "Midnight Gulmohar Silk Saree",
    slug: "midnight-gulmohar-silk-saree",
    price: 28500,
    originalPrice: 46000,
    images: [
      "/category/silk.JPG",
      "/hero/timeless.JPG",
    ],
    story: {
      title: "A midnight garden in Banaras",
      narrative:
        "Handwoven in Banaras in the late 1990s, this silk saree features gulmohar blooms scattered across a blackened gold base.",
      provenance: "Curated from a Mumbai collector's wedding trousseau.",
      era: "1998",
    },
    details: {
      fabric: "Pure Katan Silk",
      length: "5.5 meters",
      width: "1.1 meters",
      condition: "Excellent, professionally preserved",
      designer: "Heritage Banarasi",
      occasion: ["Evening", "Reception", "Festive"],
    },
    featured: true,
  },
  {
    id: "ftt-02",
    name: "Amber Dawn Tissue Saree",
    slug: "amber-dawn-tissue-saree",
    price: 22400,
    originalPrice: 39000,
    images: [
      "/hero/banner1.png",
      "/category/Cotton_Silk.JPG",
    ],
    story: {
      title: "The saree worn at sunrise",
      narrative:
        "A tissue silk with copper zari woven to capture the first light of dawn. The pallu shimmers with a soft metallic glow.",
      provenance: "From a private Ahmedabad atelier archive.",
      era: "2004",
    },
    details: {
      fabric: "Tissue Silk with Zari",
      length: "5.5 meters",
      width: "1.1 meters",
      condition: "Very good, minor patina",
      designer: "Ahmedabad Atelier",
      occasion: ["Day wedding", "Engagement", "Festive"],
    },
    featured: true,
  },
  {
    id: "ftt-03",
    name: "Ivory Lotus Organza Saree",
    slug: "ivory-lotus-organza-saree",
    price: 19800,
    originalPrice: 34000,
    images: [
      "/category/Organza.JPG",
      "/media/home-cover.png",
    ],
    story: {
      title: "Lotus petals in morning fog",
      narrative:
        "An ethereal organza with hand-embroidered lotus motifs and a pearl-like sheen. Light as a whisper.",
      provenance: "Sourced from a Delhi bridal couture house.",
      era: "2001",
    },
    details: {
      fabric: "Organza Silk",
      length: "5.5 meters",
      width: "1.1 meters",
      condition: "Excellent",
      designer: "Delhi Couture",
      occasion: ["Bridal", "Cocktail", "Evening"],
    },
    featured: true,
  },
  {
    id: "ftt-04",
    name: "Crimson Heirloom Kanjeevaram",
    slug: "crimson-heirloom-kanjeevaram",
    price: 32000,
    originalPrice: 52000,
    images: [
      "/category/kanjiverram.jpg",
      "/category/kanji_mix.JPG",
    ],
    story: {
      title: "Temple bells & silk borders",
      narrative:
        "Classic crimson Kanjeevaram with antique gold borders and temple motifs. A timeless South Indian heirloom.",
      provenance: "Handed down through three generations in Chennai.",
      era: "1992",
    },
    details: {
      fabric: "Kanjeevaram Silk",
      length: "5.5 meters",
      width: "1.2 meters",
      condition: "Excellent, lightly worn",
      designer: "Traditional Kanchipuram",
      occasion: ["Wedding", "Temple", "Festive"],
    },
    featured: false,
  },
  {
    id: "ftt-05",
    name: "Teal Zari Chanderi",
    slug: "teal-zari-chanderi",
    price: 15600,
    originalPrice: 26000,
    images: [
      "/category/Chiffon.JPG",
      "/hero/banner.png",
    ],
    story: {
      title: "A river of teal",
      narrative:
        "Lightweight chanderi with zari vines embroidered along the border, designed for warm summer evenings.",
      provenance: "Commissioned for a Jaipur art patron.",
      era: "2007",
    },
    details: {
      fabric: "Chanderi Silk",
      length: "5.5 meters",
      width: "1.1 meters",
      condition: "Very good",
      designer: "Jaipur Studio",
      occasion: ["Festive", "Soirée", "Day wedding"],
    },
    featured: false,
  },
  {
    id: "ftt-06",
    name: "Saffron Patola Revival",
    slug: "saffron-patola-revival",
    price: 29200,
    originalPrice: 48000,
    images: [
      "/hero/you.png",
      "/category/silk.JPG",
    ],
    story: {
      title: "Double ikat in saffron glow",
      narrative:
        "Traditional Patola motifs revived with a saffron base and indigo geometrics. Rare and striking.",
      provenance: "From a Surat textile museum de-accession.",
      era: "1989",
    },
    details: {
      fabric: "Patola Silk",
      length: "5.2 meters",
      width: "1.1 meters",
      condition: "Good, gentle patina",
      designer: "Patan Weavers",
      occasion: ["Festive", "Heritage", "Collectible"],
    },
    featured: false,
  },
  {
    id: "ftt-07",
    name: "Rose Dust Tussar Saree",
    slug: "rose-dust-tussar-saree",
    price: 17500,
    originalPrice: 30000,
    images: [
      "/category/C0010T01.JPG",
      "/category/Kota_Cotton.jpg",
    ],
    story: {
      title: "Rose petals & raw silk",
      narrative:
        "Soft rose tussar with hand-painted floral motifs and a matte sheen. Quiet luxury for intimate celebrations.",
      provenance: "Curated from a Kolkata art collector.",
      era: "2009",
    },
    details: {
      fabric: "Tussar Silk",
      length: "5.5 meters",
      width: "1.1 meters",
      condition: "Excellent",
      designer: "Bengal Atelier",
      occasion: ["Mehendi", "Brunch", "Festive"],
    },
    featured: true,
  },
  {
    id: "ftt-08",
    name: "Noor Zardozi Velvet Saree",
    slug: "noor-zardozi-velvet-saree",
    price: 34800,
    originalPrice: 56000,
    images: [
      "/hero/3.png",
      "/hero/4.png",
    ],
    story: {
      title: "Velvet nights in Old Delhi",
      narrative:
        "Velvet base with hand-cut zardozi motifs that catch candlelight. A regal piece from the early 90s.",
      provenance: "Restored from an Old Delhi couture trunk.",
      era: "1991",
    },
    details: {
      fabric: "Velvet with Zardozi",
      length: "5.3 meters",
      width: "1.1 meters",
      condition: "Excellent, restored",
      designer: "Old Delhi Couture",
      occasion: ["Reception", "Evening", "Gala"],
    },
    featured: false,
  },
  {
    id: "ftt-09",
    name: "Bengal Tiger Silk Saree",
    slug: "bengal-tiger-silk-saree",
    price: 85000,
    originalPrice: 112000,
    images: [
      "/hero/5.png",
      "/hero/6.png",
    ],
    story: {
      title: "A midnight motif in antique gold",
      narrative:
        "A Banarasi silk woven with tiger-inspired motifs and antique zari, finished with a couture edge.",
      provenance: "From a Kolkata bridal trousseau archive.",
      era: "2016",
    },
    details: {
      fabric: "Banarasi Silk",
      length: "5.5 meters",
      width: "1.1 meters",
      condition: "Excellent, lightly worn",
      designer: "Sabyasachi",
      occasion: ["Bridal", "Reception", "Festive"],
    },
    featured: false,
  },
  {
    id: "ftt-10",
    name: "Chandni Chowk Tissue Saree",
    slug: "chandni-chowk-tissue-saree",
    price: 72000,
    originalPrice: 98000,
    images: [
      "/hero/banner1.png",
      "/hero/timeless.JPG",
    ],
    story: {
      title: "City lights in tissue silk",
      narrative:
        "A luminous tissue silk saree with soft metallic sheen and delicate drape, inspired by old Delhi evenings.",
      provenance: "Curated from a couture client wardrobe.",
      era: "2014",
    },
    details: {
      fabric: "Tissue Silk",
      length: "5.5 meters",
      width: "1.1 meters",
      condition: "Excellent",
      designer: "Tarun Tahiliani",
      occasion: ["Cocktail", "Evening", "Festive"],
    },
    featured: false,
  },
  {
    id: "ftt-11",
    name: "Jaipur Garden Silk Saree",
    slug: "jaipur-garden-silk-saree",
    price: 58000,
    originalPrice: 84000,
    images: [
      "/hero/1.png",
      "/hero/2.png",
    ],
    story: {
      title: "Gota blooms in soft light",
      narrative:
        "A garden of gota patti motifs blooms across silk, finished with a gentle pastel palette.",
      provenance: "From a Jaipur atelier showcase.",
      era: "2018",
    },
    details: {
      fabric: "Gota Patti Silk",
      length: "5.5 meters",
      width: "1.1 meters",
      condition: "Excellent",
      designer: "Anita Dongre",
      occasion: ["Mehendi", "Day wedding", "Festive"],
    },
    featured: false,
  },
  {
    id: "ftt-12",
    name: "Mughal Sequin Georgette Saree",
    slug: "mughal-sequin-georgette-saree",
    price: 95000,
    originalPrice: 125000,
    images: [
      "/category/georgette.jpg",
      "/banner/newbanner3.png",
    ],
    story: {
      title: "Sequin work with a regal glow",
      narrative:
        "A feather-light georgette saree with Mughal-inspired sequin trails and ornate edging.",
      provenance: "Restored from a Mumbai red-carpet collection.",
      era: "2017",
    },
    details: {
      fabric: "Georgette",
      length: "5.6 meters",
      width: "1.1 meters",
      condition: "Very good, minor patina",
      designer: "Manish Malhotra",
      occasion: ["Reception", "Cocktail", "Gala"],
    },
    featured: false,
  },
  {
    id: "ftt-13",
    name: "Chanderi Heritage Weave",
    slug: "chanderi-heritage-weave",
    price: 45000,
    originalPrice: 68000,
    images: [
      "/category/cotton.JPG",
      "/footer/ftt-trunk-saree.webp",
    ],
    story: {
      title: "A handwoven Chanderi glow",
      narrative:
        "A minimalist Chanderi weave with a clean border and a quiet, luminous sheen.",
      provenance: "From a Raw Mango studio capsule.",
      era: "2019",
    },
    details: {
      fabric: "Chanderi Silk",
      length: "5.5 meters",
      width: "1.1 meters",
      condition: "Excellent",
      designer: "Raw Mango",
      occasion: ["Heritage", "Festive", "Soirée"],
    },
    featured: false,
  },
];

export const featuredSarees = sarees.filter((saree) => saree.featured);

export function getSareeBySlug(slug: string) {
  return sarees.find((saree) => saree.slug === slug);
}
