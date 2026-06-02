import { bankBrand } from "@/lib/bank-brand";
import { cn } from "@/lib/utils";

/**
 * Coloured monogram badge for a bank account (CBA = yellow, ANZ = blue, …).
 * Optionally renders the account name beside it.
 */
export function AccountBadge({
  name,
  institution,
  showName = false,
  size = "md",
  className,
}: {
  name: string;
  institution?: string | null;
  showName?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const brand = bankBrand(name, institution);
  const dims = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md font-bold leading-none",
          dims,
        )}
        style={{ backgroundColor: brand.bg, color: brand.fg }}
        title={name}
      >
        {brand.label}
      </span>
      {showName ? <span className="truncate">{name}</span> : null}
    </span>
  );
}
