import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  OFFERED_BLOUSE_SIZES,
  getBlouseSizeChartRows,
  type BlouseSize,
  type MeasurementUnit,
} from "@/lib/catalog/blouse-size-chart";
import { cn } from "@/lib/utils";

type BlouseSizeChartTableProps = {
  selectedSize?: BlouseSize | null;
  unit: MeasurementUnit;
};

export function BlouseSizeChartTable({
  selectedSize,
  unit,
}: BlouseSizeChartTableProps) {
  const rows = getBlouseSizeChartRows(unit);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E7DDD4] bg-[#FFFCF8]">
      <div className="overflow-x-auto">
        <Table className="w-full min-w-[420px]">
          <TableHeader>
            <TableRow className="border-[#E7DDD4] hover:bg-transparent">
              <TableHead className="sticky left-0 z-10 min-w-44 bg-[#FFFCF8] text-[10px] font-semibold uppercase tracking-[0.18em] text-[#141D46]">
                Measurement
              </TableHead>
              {OFFERED_BLOUSE_SIZES.map((size) => (
                <TableHead
                  key={size}
                  className={cn(
                    "text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#141D46]",
                    selectedSize === size && "bg-[#141D46] text-[#FDF7F1]",
                  )}
                >
                  {size}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label} className="border-[#E7DDD4]">
                <TableCell className="sticky left-0 z-10 bg-[#FFFCF8] text-xs font-semibold text-[#601D1C]">
                  {row.label}
                </TableCell>
                {OFFERED_BLOUSE_SIZES.map((size) => (
                  <TableCell
                    key={`${row.label}-${size}`}
                    className={cn(
                      "text-center text-xs font-medium text-[#141D46]/75",
                      selectedSize === size &&
                        "bg-[#141D46]/8 font-semibold text-[#141D46]",
                    )}
                  >
                    {row.values[size]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
