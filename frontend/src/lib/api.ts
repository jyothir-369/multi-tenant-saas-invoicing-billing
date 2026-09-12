const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set(
    "Authorization",
    `Bearer ${window.localStorage.getItem("ledgerly_token") || ""}`,
  );
  if (options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (!API_URL)
    throw new Error("API URL is not configured. Set NEXT_PUBLIC_API_URL.");
  const canRetry = !options.method || options.method.toUpperCase() === "GET";
  let response: Response | undefined;
  for (let attempt = 0; attempt < (canRetry ? 2 : 1); attempt += 1) {
    try {
      response = await fetch(`${API_URL}${path}`, { ...options, headers });
      break;
    } catch (error) {
      if (attempt === 0 && canRetry)
        await new Promise((resolve) => setTimeout(resolve, 300));
      else throw error;
    }
  }
  const body = await response!.json().catch(() => null);
  if (response!.status === 401) {
    window.localStorage.removeItem("ledgerly_token");
    window.localStorage.removeItem("ledgerly_email");
    window.location.replace("/");
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!response!.ok) {
    const message = Array.isArray(body?.message)
      ? body.message.join(" ")
      : body?.message;
    throw new Error(
      response!.status >= 500
        ? "The service is temporarily unavailable. Please try again."
        : message || "Request failed.",
    );
  }
  return body as T;
}
export const formatMoney = (minorUnits: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minorUnits / 100,
  );
export async function downloadInvoicePdf(invoiceId: string): Promise<void> {
  if (!API_URL) throw new Error("API URL is not configured.");
  const token = window.localStorage.getItem("ledgerly_token") || "";
  const response = await fetch(`${API_URL}/invoices/${invoiceId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) {
    window.localStorage.removeItem("ledgerly_token");
    window.localStorage.removeItem("ledgerly_email");
    window.location.replace("/");
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!response.ok) throw new Error("Unable to download the invoice PDF.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `invoice-${invoiceId}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
