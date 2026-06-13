import { useState } from "react";

import type {
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  ReactFormExtendedApi,
} from "@tanstack/react-form";

import { Button } from "@/components/ui/button";
import { SchemaFormField } from "@/components/admin/schema-form/schema-form-field";

import type { ProductStepperValues } from "./types";

// ---------------------------------------------------------------------------
// Typed form handle (mirrors step-pricing.tsx pattern)
// ---------------------------------------------------------------------------

type ProductStepperSyncValidator =
  | FormValidateOrFn<ProductStepperValues>
  | undefined;
type ProductStepperAsyncValidator =
  | FormAsyncValidateOrFn<ProductStepperValues>
  | undefined;

type ProductStepperForm = ReactFormExtendedApi<
  ProductStepperValues,
  ProductStepperSyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperAsyncValidator,
  unknown
>;

type StepDetailsProps = {
  form: ProductStepperForm;
};

// ---------------------------------------------------------------------------
// Field key type — all details-step fields that appear in ProductStepperValues
// ---------------------------------------------------------------------------

type DetailsFieldKey =
  | "name"
  | "slug"
  | "collectionId"
  | "detailsFabric"
  | "detailsDesigner"
  | "detailsLength"
  | "detailsWidth"
  | "detailsCondition"
  | "tagsCsv";

// ---------------------------------------------------------------------------
// Metadata for each field (label + placeholder; no Zod needed here —
// validation is TanStack's concern at submit time via buildZodSchema)
// ---------------------------------------------------------------------------

type FieldConfig = {
  label: string;
  placeholder?: string;
  description?: string;
  /** When true, the field spans both grid columns on md+ screens. */
  fullWidth?: boolean;
};

const fieldConfigs: Record<DetailsFieldKey, FieldConfig> = {
  name: {
    label: "Internal name",
    placeholder: "Kanjeevaram Silk - Gold Border",
    fullWidth: true,
  },
  slug: {
    label: "Slug",
    placeholder: "kanjeevaram-silk-gold-border",
    description: "URL-safe identifier. Auto-generated from story title if blank.",
  },
  collectionId: {
    label: "Collection ID",
    placeholder: "UUID (optional)",
  },
  detailsFabric: {
    label: "Fabric",
    placeholder: "Pure Silk",
  },
  detailsDesigner: {
    label: "Designer",
    placeholder: "Nalli / Heritage House",
  },
  detailsLength: {
    label: "Length",
    placeholder: 'e.g. 5.5"',
  },
  detailsWidth: {
    label: "Width",
    placeholder: 'e.g. 44"',
  },
  detailsCondition: {
    label: "Condition",
    placeholder: "Excellent / Restored",
  },
  tagsCsv: {
    label: "Tag IDs (comma separated)",
    placeholder: "1, 2, 7",
    description: "Enter numeric tag IDs separated by commas.",
    fullWidth: true,
  },
};

// Plain text fields rendered via SchemaFormField (no special UI)
const textFieldKeys: DetailsFieldKey[] = [
  "name",
  "slug",
  "collectionId",
  "detailsFabric",
  "detailsDesigner",
  "detailsLength",
  "detailsWidth",
  "detailsCondition",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepDetails({ form }: StepDetailsProps) {
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<
    Array<{ category: string; id: number; name: string }>
  >([]);

  const handleSuggestTags = async () => {
    setIsSuggesting(true);
    try {
      const values = form.state.values;
      const response = await fetch("/api/v2/products/tag-suggestions", {
        body: JSON.stringify({
          detailsDesigner: values.detailsDesigner,
          detailsFabric: values.detailsFabric,
          storyEra: values.storyEra,
          storyNarrative: values.storyNarrative,
          storyProvenance: values.storyProvenance,
          storyTitle: values.storyTitle,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        setSuggestedTags([]);
        return;
      }

      const data = (await response.json()) as {
        suggestions?: Array<{ category: string; id: number; name: string }>;
      };
      setSuggestedTags(data.suggestions ?? []);
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {textFieldKeys.map((key) => {
        const config = fieldConfigs[key];
        return (
          <form.Field key={key} name={key}>
            {(field) => (
              <div className={config.fullWidth ? "md:col-span-2" : undefined}>
                <SchemaFormField
                  fieldKey={key}
                  meta={{
                    type: "text",
                    label: config.label,
                    placeholder: config.placeholder,
                    description: config.description,
                  }}
                  value={field.state.value}
                  error={
                    field.state.meta.errors[0] !== undefined
                      ? String(field.state.meta.errors[0])
                      : undefined
                  }
                  formValues={form.state.values as Record<string, unknown>}
                  onBlur={field.handleBlur}
                  onChange={(v) => field.handleChange(v as string)}
                />
              </div>
            )}
          </form.Field>
        );
      })}

      {/* tagsCsv — text field with custom "Suggest Tags" UI */}
      <form.Field name="tagsCsv">
        {(field) => {
          const tagError =
            field.state.meta.errors[0] !== undefined
              ? String(field.state.meta.errors[0])
              : undefined;

          return (
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <SchemaFormField
                  fieldKey="tagsCsv"
                  meta={{
                    type: "text",
                    label: "Tag IDs (comma separated)",
                    placeholder: "1, 2, 7",
                    description: "Enter numeric tag IDs separated by commas.",
                  }}
                  value={field.state.value}
                  error={tagError}
                  formValues={form.state.values as Record<string, unknown>}
                  onBlur={field.handleBlur}
                  onChange={(v) => field.handleChange(v as string)}
                />
                <Button
                  className="mt-6 shrink-0"
                  onClick={handleSuggestTags}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isSuggesting ? "Suggesting..." : "Suggest Tags"}
                </Button>
              </div>
              {suggestedTags.length > 0 ? (
                <div className="space-y-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  <p>Suggested tags:</p>
                  <p>
                    {suggestedTags
                      .map((tag) => `${tag.name} (#${tag.id})`)
                      .join(", ")}
                  </p>
                  <Button
                    onClick={() =>
                      field.handleChange(
                        suggestedTags.map((tag) => tag.id).join(", ")
                      )
                    }
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Apply suggested IDs
                  </Button>
                </div>
              ) : null}
            </div>
          );
        }}
      </form.Field>
    </div>
  );
}
