import Anthropic from "@anthropic-ai/sdk";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pactsAbi } from "@/lib/abi";
import { chain, PACTS } from "@/lib/config";
import { stageOf } from "@/lib/pact-stage";
import { checkOutcome, provider } from "./check-outcome";

export const maxDuration = 300;

/** Lets the UI hide AI-settled pacts when this deployment has no result checker configured. */
export function GET() {
  return Response.json({ available: !!provider() && !!process.env.RESOLVER_PRIVATE_KEY, provider: provider() });
}

// Best-effort throttle per pact so repeated taps don't trigger repeated searches.
const COOLDOWN_MS = 10 * 60 * 1000;
const lastCheck = new Map<string, { at: number; body: unknown }>();

const publicClient = createPublicClient({ chain, transport: http() });

export async function POST(request: Request) {
  const { pactId } = (await request.json().catch(() => ({}))) as { pactId?: string };
  if (!pactId || !/^\d{1,18}$/.test(pactId)) return Response.json({ error: "Invalid pact id." }, { status: 400 });

  const key = process.env.RESOLVER_PRIVATE_KEY as Hex | undefined;
  if (!key || !provider()) {
    return Response.json({ error: "The result checker isn't configured on this server." }, { status: 503 });
  }

  const cached = lastCheck.get(pactId);
  if (cached && Date.now() - cached.at < COOLDOWN_MS) return Response.json(cached.body);

  const id = BigInt(pactId);
  const [pact, terms, options, resolver] = await Promise.all([
    publicClient.readContract({ address: PACTS, abi: pactsAbi, functionName: "getPact", args: [id] }),
    publicClient.readContract({ address: PACTS, abi: pactsAbi, functionName: "termsOf", args: [id] }),
    publicClient.readContract({ address: PACTS, abi: pactsAbi, functionName: "getOptions", args: [id] }),
    publicClient.readContract({ address: PACTS, abi: pactsAbi, functionName: "resolver" }),
  ]);

  const account = privateKeyToAccount(key);
  if (resolver.toLowerCase() !== account.address.toLowerCase()) {
    return Response.json({ error: "Server resolver key doesn't match the contract." }, { status: 503 });
  }
  if (!pact.aiResolved) return Response.json({ error: "This pact is settled by agreement." }, { status: 400 });
  const stage = stageOf(pact);
  if (stage !== "deciding") return Response.json({ error: `Nothing to check right now (${stage}).` }, { status: 409 });

  let outcome;
  try {
    outcome = await checkOutcome(terms, [...options]);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "The result checker is busy. Try again in a minute." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("resolve: Claude API error", err.status, err.message);
      return Response.json({ error: "The result checker is unavailable right now." }, { status: 502 });
    }
    throw err;
  }

  let txHash: Hex | undefined;
  if (outcome.status === "final") {
    const wallet = createWalletClient({ account, chain, transport: http() });
    const source = `${outcome.summary} ${outcome.source_url}`.trim().slice(0, 500);
    const { request: tx } = await publicClient.simulateContract({
      account,
      address: PACTS,
      abi: pactsAbi,
      functionName: "proposeOutcome",
      args: [id, outcome.option, source],
    });
    txHash = await wallet.writeContract(tx);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  const body = { ...outcome, txHash };
  lastCheck.set(pactId, { at: Date.now(), body });
  return Response.json(body);
}
