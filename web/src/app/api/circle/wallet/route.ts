import { circleAvailable, circleBlockchain, circleFetch } from "@/lib/circle-server";

type Wallet = { id: string; address: string; blockchain: string; state: string };

/** The signed-in person's Arc wallet, once Circle has created it. */
export async function GET(request: Request) {
  if (!circleAvailable()) return Response.json({ error: "Email sign-in isn't available here." }, { status: 503 });

  const userToken = request.headers.get("x-user-token");
  if (!userToken) return Response.json({ error: "Not signed in." }, { status: 401 });

  try {
    const data = await circleFetch<{ wallets: Wallet[] }>({ path: "/wallets", userToken });
    const wallet = data.wallets.find((w) => w.blockchain === circleBlockchain()) ?? data.wallets[0];
    return Response.json({ wallet: wallet ?? null });
  } catch (err) {
    console.error("circle wallet", err);
    return Response.json({ error: "Couldn't read your wallet." }, { status: 502 });
  }
}
