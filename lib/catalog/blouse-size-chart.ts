export const BLOUSE_SIZE_ORDER = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
  "7XL",
  "8XL",
] as const;

export type BlouseSize = (typeof BLOUSE_SIZE_ORDER)[number];

/** Sizes actually offered for purchase — drives the selector and order validation. */
export const OFFERED_BLOUSE_SIZES: BlouseSize[] = ["S", "M", "L"];

export type MeasurementUnit = "cm" | "in";

type SizeValues = Record<BlouseSize, string>;

export type BlouseSizeChartRow = {
  label: string;
  values: SizeValues;
};

export const BLOUSE_SIZE_CHART_ROWS_IN: BlouseSizeChartRow[] = [
  {
    label: "Bust / Over Bust",
    values: {
      XS: "32-33",
      S: "34-35",
      M: "36-37",
      L: "38-39",
      XL: "40-41",
      "2XL": "42-43",
      "3XL": "44-45",
      "4XL": "46-47",
      "5XL": "48-49",
      "6XL": "50-51",
      "7XL": "52-53",
      "8XL": "54-55",
    },
  },
  {
    label: "Under Bust",
    values: {
      XS: "25-26",
      S: "27-28",
      M: "29-30",
      L: "31-32",
      XL: "33-34",
      "2XL": "35-36",
      "3XL": "37",
      "4XL": "38",
      "5XL": "40",
      "6XL": "42.5",
      "7XL": "43.5",
      "8XL": "45",
    },
  },
  {
    label: "Shoulder",
    values: {
      XS: "14.25",
      S: "14.5",
      M: "15",
      L: "15.5",
      XL: "15.75",
      "2XL": "16.25",
      "3XL": "17.25",
      "4XL": "17.5",
      "5XL": "17.75",
      "6XL": "18.25",
      "7XL": "18.5",
      "8XL": "19",
    },
  },
  {
    label: "Armhole",
    values: {
      XS: "14.65",
      S: "15.5",
      M: "16.25",
      L: "16.75",
      XL: "17.5",
      "2XL": "18.75",
      "3XL": "19.75",
      "4XL": "20.5",
      "5XL": "21.5",
      "6XL": "22",
      "7XL": "23",
      "8XL": "24.5",
    },
  },
  {
    label: "Front Blouse Length",
    values: {
      XS: "15.5",
      S: "15.75",
      M: "17.25",
      L: "17.75",
      XL: "18.5",
      "2XL": "18.75",
      "3XL": "19.5",
      "4XL": "19.75",
      "5XL": "20",
      "6XL": "20.5",
      "7XL": "21",
      "8XL": "21.5",
    },
  },
  {
    label: "Short Sleeve Length",
    values: {
      XS: "4.5",
      S: "5",
      M: "5",
      L: "5",
      XL: "5.5",
      "2XL": "6",
      "3XL": "6.5",
      "4XL": "7",
      "5XL": "7.5",
      "6XL": "8",
      "7XL": "8",
      "8XL": "8",
    },
  },
  {
    label: "Short Sleeve Round",
    values: {
      XS: "11.5",
      S: "12.5",
      M: "13",
      L: "13.5",
      XL: "14",
      "2XL": "14.5",
      "3XL": "15",
      "4XL": "15.25",
      "5XL": "16",
      "6XL": "16.5",
      "7XL": "16.75",
      "8XL": "17.25",
    },
  },
  {
    label: "Elbow Sleeve Length",
    values: {
      XS: "10.5",
      S: "11.5",
      M: "11.5",
      L: "11.5",
      XL: "11.5",
      "2XL": "11.5",
      "3XL": "11.5",
      "4XL": "12",
      "5XL": "12",
      "6XL": "12",
      "7XL": "12",
      "8XL": "12",
    },
  },
  {
    label: "Elbow Sleeve Round",
    values: {
      XS: "8.5",
      S: "9",
      M: "10",
      L: "10.5",
      XL: "11",
      "2XL": "12",
      "3XL": "13",
      "4XL": "13.5",
      "5XL": "14",
      "6XL": "14.5",
      "7XL": "14.75",
      "8XL": "15",
    },
  },
];

const validSizeSet = new Set<string>(BLOUSE_SIZE_ORDER);

export const normalizeBlouseSize = (value: unknown): BlouseSize | null => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return validSizeSet.has(normalized) ? (normalized as BlouseSize) : null;
};

export const isValidBlouseSize = (value: unknown): value is BlouseSize =>
  normalizeBlouseSize(value) !== null;

const toCm = (value: string) => {
  const converted = Number(value) * 2.54;
  return Number.isInteger(converted)
    ? String(converted)
    : converted.toFixed(1).replace(/\.0$/, "");
};

export const convertInchesValueToCm = (value: string) =>
  value
    .split("-")
    .map((part) => toCm(part.trim()))
    .join("-");

export const getBlouseSizeChartRows = (
  unit: MeasurementUnit,
): BlouseSizeChartRow[] => {
  if (unit === "in") return BLOUSE_SIZE_CHART_ROWS_IN;

  return BLOUSE_SIZE_CHART_ROWS_IN.map((row) => ({
    label: row.label,
    values: Object.fromEntries(
      BLOUSE_SIZE_ORDER.map((size) => [
        size,
        convertInchesValueToCm(row.values[size]),
      ]),
    ) as SizeValues,
  }));
};

const parseAvailableSizes = (value: unknown): BlouseSize[] => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n|]+/)
      : [];

  return Array.from(
    new Set(rawValues.map(normalizeBlouseSize).filter(Boolean) as BlouseSize[]),
  ).sort(
    (a, b) => BLOUSE_SIZE_ORDER.indexOf(a) - BLOUSE_SIZE_ORDER.indexOf(b),
  );
};

export const getAvailableBlouseSizes = (product: {
  attributes?: null | Record<string, unknown>;
}): BlouseSize[] => {
  const sizes = parseAvailableSizes(product.attributes?.availableSizes).filter(
    (size) => OFFERED_BLOUSE_SIZES.includes(size),
  );
  return sizes.length > 0 ? sizes : [...OFFERED_BLOUSE_SIZES];
};

export type SelectedOptions = {
  size?: string;
};

export const getSelectedSizeLabel = (
  selectedOptions: null | SelectedOptions | undefined,
) => {
  const size = normalizeBlouseSize(selectedOptions?.size);
  return size ? `Size: ${size}` : null;
};
