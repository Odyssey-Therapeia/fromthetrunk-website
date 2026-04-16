import type {
  BatchImportPort,
  FieldMapping,
  ImportPreviewRow,
  ImportResult,
} from "@/lib/ports/batch-import";

class BatchImportRestAdapter implements BatchImportPort {
  async parseFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/v2/admin/import/parse", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to parse file");
    return res.json();
  }

  async suggestMappings(headers: string[]): Promise<FieldMapping[]> {
    const res = await fetch("/api/v2/admin/import/map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headers }),
    });
    if (!res.ok) throw new Error("Failed to suggest mappings");
    const data = await res.json();
    return data.mappings;
  }

  async validateRows(params: {
    fileId: string;
    mappings: FieldMapping[];
  }): Promise<ImportPreviewRow[]> {
    const res = await fetch("/api/v2/admin/import/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error("Failed to validate rows");
    const data = await res.json();
    return data.rows;
  }

  async executeImport(params: {
    fileId: string;
    mappings: FieldMapping[];
  }): Promise<ImportResult> {
    const res = await fetch("/api/v2/admin/import/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error("Failed to execute import");
    return res.json();
  }
}

export const batchImportAdapter = new BatchImportRestAdapter();
