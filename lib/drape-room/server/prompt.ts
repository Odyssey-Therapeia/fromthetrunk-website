export const CLASSIC_NIVI_PROMPT_VERSION = "nivi-v4" as const;

export const DRAPE_BACKGROUNDS = [
  "studio",
  "festival",
  "wedding",
  "party",
  "birthday",
] as const;

export type DrapeBackground = (typeof DRAPE_BACKGROUNDS)[number];
export type DrapeProductReferenceMode = "single" | "dual";

const BACKGROUND_INSTRUCTIONS: Record<DrapeBackground, string> = {
  studio:
    "Place her against a clean warm-ivory studio backdrop with soft, even fashion lighting and a natural contact shadow.",
  festival:
    "Place her in an elegant Indian festival setting with softly blurred marigold garlands and warm diya lights, without adding text or religious symbols.",
  wedding:
    "Place her in a refined Indian wedding venue with softly blurred floral decor and warm ambient lights; keep the scene secondary to the saree and do not automatically portray the customer as the bride.",
  party:
    "Place her in a tasteful evening party setting with softly blurred warm lights and a polished interior, without other visible people.",
  birthday:
    "Place her in an elegant birthday celebration setting with softly blurred warm lights and subtle decorations, without readable banners, names, numbers, ages, text, or logos.",
};

const IDENTITY_RULES = [
  "Preserve the subject's face exactly: facial structure, eyes, nose, mouth, eyebrows, expression, and age must remain unmistakably the same person.",
  "Preserve her exact facial skin tone and undertone. Match every generated area of exposed body skin continuously to the face and any other visible skin from IMAGE 1; never lighten, darken, beautify, smooth, or reinterpret her complexion.",
  "Preserve the full-body pose, camera perspective, identity, height, body proportions, build, and stance visible in IMAGE 1.",
  "Make only minimal arm adjustments when necessary to reveal the saree. Do not change the customer's build, limb proportions, stance, or body shape.",
  "Keep existing visible jewellery, bindi, glasses, and footwear when present unless the saree naturally occludes them. Do not invent accessories.",
];

const FABRIC_RULES = [
  "Reproduce the product saree's exact hue, saturation, tonal depth, weave, print, motifs, motif scale, and placement.",
  "Reproduce the border exactly: width, colour, zari or embroidery detail, and continuous placement along the correct drape edges.",
  "Reproduce the pallu's distinct design and preserve its difference from the body of the saree.",
  "Match the fabric's real physics: its weight, sheen, translucency, stiffness, fold structure, and response to gravity.",
  "Create a restrained, well-fitted blouse derived only from colours already present in the product saree; do not invent an unrelated design or competing print.",
];

const REALISM_RULES = [
  "Render believable pleat depth, fabric tension, gravity, occlusion, and contact shadows where fabric meets the body and floor.",
  "Render natural hands, fingers, arms, and feet with anatomically correct placement and proportions.",
  "Preserve IMAGE 1's full-body framing and camera perspective while integrating the person naturally into the requested background lighting.",
  "Produce a single photorealistic, sharp, high-end fashion e-commerce photograph.",
];

const NEGATIVE_RULES = [
  "Do not change the person, face, skin tone, hair, or any body, pose, hands, fingers, arms, or feet that are visible in IMAGE 1. Never create a face-to-body skin-tone mismatch.",
  "Do not recolour, redesign, simplify, invent, resize, rearrange, or repeat the saree motifs, border, or pallu.",
  "Do not leave any original top, dress, trousers, or other clothing visible beneath the saree and blouse.",
  "Do not add another person, collage, split screen, watermark, label, caption, logo, or any text.",
  "Do not let background decor, props, or lighting obstruct the person or any important saree detail.",
];

function bullets(lines: readonly string[]): string {
  return lines.map((line) => `- ${line}`).join("\n");
}

export function isDrapeBackground(value: unknown): value is DrapeBackground {
  return (
    typeof value === "string" &&
    DRAPE_BACKGROUNDS.some((background) => background === value)
  );
}

/** Fixed prompt: only the allowlisted background and trusted reference shape vary. */
export function buildClassicNiviPrompt(
  background: DrapeBackground,
  referenceMode: DrapeProductReferenceMode,
): string {
  if (!isDrapeBackground(background)) {
    throw new Error("invalid_drape_background");
  }
  if (referenceMode !== "single" && referenceMode !== "dual") {
    throw new Error("invalid_product_reference_mode");
  }

  const referenceContract =
    referenceMode === "single"
      ? [
          "You are given exactly two reference images in this order:",
          "- IMAGE 1 is the only human identity, face, skin tone, age, hair, body, height, proportion, and pose source.",
          "- IMAGE 2 is the sole authoritative textile reference selected from the exact product's gallery. Use only its visible textile, colour, weave, motifs, border, and pallu evidence. Keep any necessary continuation consistent with what is visible; do not invent a conflicting hidden pattern or design.",
          "- IMAGE 2 is a textile source only. Never copy or blend any model, mannequin, face, skin, body, hair, age, hands, pose, blouse, jewellery, background, accessory, or anatomy from it into the result.",
          "",
          "Generate exactly one photorealistic, full-length image of the camera-facing person from IMAGE 1 wearing the exact saree represented by IMAGE 2 in a Classic Nivi drape.",
        ]
      : [
          "You are given exactly three reference images in this order:",
          "- IMAGE 1 is the only human identity, face, skin tone, age, hair, body, height, proportion, and pose source.",
          "- IMAGE 2 is the strongest full-look or drape reference selected from the exact product's complete gallery. Use only its textile, colour, weave, motifs, border, and pallu.",
          "- IMAGE 3 is a complementary detail reference selected from that same exact product gallery. Use it to recover border, pallu, motif, weave, texture, and design details that are clearer there.",
          "- IMAGE 2 and IMAGE 3 are textile sources only. Never copy or blend any model, mannequin, face, skin, body, hair, age, hands, pose, blouse, jewellery, background, accessory, or anatomy from either product image into the result.",
          "",
          "Generate exactly one photorealistic, full-length image of the camera-facing person from IMAGE 1 wearing the exact saree represented jointly by IMAGE 2 and IMAGE 3 in a Classic Nivi drape.",
        ];

  return [
    "You are a virtual try-on engine for an Indian saree label.",
    "",
    ...referenceContract,
    "",
    "CLASSIC NIVI DRAPE",
    "- Wrap and tuck the saree securely at the waist, form five to seven crisp front knife pleats centred directly below the navel, and let the pleats fall vertically to the floor.",
    "- Carry the remaining fabric from the right hip diagonally across the front torso, under the right arm, and lay the pallu over the LEFT shoulder.",
    "- Let the recognisable decorative pallu end fall naturally behind the LEFT shoulder to about mid-thigh.",
    "- Keep the saree border continuous, correctly oriented, and faithful along the waist, front pleats, hem, torso, and pallu.",
    "",
    "PRESERVE THE PERSON",
    bullets(IDENTITY_RULES),
    "",
    "PRESERVE THE PRODUCT",
    bullets(FABRIC_RULES),
    "",
    "REALISM",
    bullets(REALISM_RULES),
    "",
    "BACKGROUND",
    `- ${BACKGROUND_INSTRUCTIONS[background]}`,
    "",
    "DO NOT",
    bullets(NEGATIVE_RULES),
    "",
    "Return only the final image. Do not return an explanation.",
  ].join("\n");
}
