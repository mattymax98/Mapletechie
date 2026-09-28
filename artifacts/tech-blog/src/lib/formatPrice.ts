export function formatPrice(amount: number, currency?: string | null): string {
  const code = (currency || "CAD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}
