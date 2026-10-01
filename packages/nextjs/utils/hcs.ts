import { notification } from "~~/utils/scaffold-hbar";

/**
 * Fire-and-forget audit-record submit. The client sends ONLY the tx hash; the
 * server re-fetches the receipt and rebuilds the record (app/api/hcs/route.ts).
 * Failures never affect on-chain state - the chain stays the source of truth.
 */
export async function postHcsRecord(txHash: string | undefined, chainId: number): Promise<void> {
  if (!txHash) return;
  // HCS mirrors Hedera deployments; local dev receipts do not exist on the Hedera RPC.
  if (chainId !== 295 && chainId !== 296) return;

  try {
    const response = await fetch("/api/hcs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHash }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn("HCS audit record not written:", (error as Error).message);
    notification.warning("Transaction confirmed, but the HCS audit record failed (chain unaffected)");
  }
}
