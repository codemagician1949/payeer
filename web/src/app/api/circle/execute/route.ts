import { circleAvailable, circleFetch, idempotencyKey } from "@/lib/circle-server";
import { PACTS, PAYEER, USDC } from "@/lib/config";

/**
 * Turns a contract call into a Circle challenge the person approves with their PIN.
 *
 * Only Payeer's own contracts (and USDC approvals for them) are allowed: this endpoint holds
 * no keys, but it shouldn't be usable to sign arbitrary calls on someone's behalf either.
 */
const ALLOWED = new Set([PAYEER.toLowerCase(), PACTS.toLowerCase(), USDC.toLowerCase()]);

type Body = {
  walletId?: string;
  contractAddress?: string;
  abiFunctionSignature?: string;
  abiParameters?: (string | number | boolean | string[])[];
};

export async function POST(request: Request) {
  if (!circleAvailable()) return Response.json({ error: "Email sign-in isn't available here." }, { status: 503 });

  const userToken = request.headers.get("x-user-token");
  if (!userToken) return Response.json({ error: "Not signed in." }, { status: 401 });

  const { walletId, contractAddress, abiFunctionSignature, abiParameters = [] } = (await request
    .json()
    .catch(() => ({}))) as Body;

  if (!walletId || !contractAddress || !abiFunctionSignature) {
    return Response.json({ error: "Missing transaction details." }, { status: 400 });
  }
  if (!ALLOWED.has(contractAddress.toLowerCase())) {
    return Response.json({ error: "That contract isn't part of Payeer." }, { status: 400 });
  }
  if (contractAddress.toLowerCase() === USDC.toLowerCase() && !abiFunctionSignature.startsWith("approve(")) {
    return Response.json({ error: "Only approvals are allowed on USDC." }, { status: 400 });
  }

  try {
    const data = await circleFetch<{ challengeId: string }>({
      path: "/user/transactions/contractExecution",
      method: "POST",
      userToken,
      body: {
        idempotencyKey: idempotencyKey(),
        walletId,
        contractAddress,
        abiFunctionSignature,
        abiParameters,
        feeLevel: "MEDIUM",
      },
    });
    return Response.json({ challengeId: data.challengeId });
  } catch (err) {
    console.error("circle execute", err);
    const message = err instanceof Error ? err.message : "Couldn't prepare that transaction.";
    return Response.json({ error: message }, { status: 502 });
  }
}
