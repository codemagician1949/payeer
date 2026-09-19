import { ALREADY_INITIALIZED, CircleError, circleAvailable, circleBlockchain, circleFetch, idempotencyKey } from "@/lib/circle-server";

/** Creates the person's Arc wallet. Returns a challenge the Circle SDK walks them through (PIN). */
export async function POST(request: Request) {
  if (!circleAvailable()) return Response.json({ error: "Email sign-in isn't available here." }, { status: 503 });

  const userToken = request.headers.get("x-user-token");
  if (!userToken) return Response.json({ error: "Not signed in." }, { status: 401 });

  try {
    const data = await circleFetch<{ challengeId: string }>({
      path: "/user/initialize",
      method: "POST",
      userToken,
      body: { idempotencyKey: idempotencyKey(), blockchains: [circleBlockchain()], accountType: "SCA" },
    });
    return Response.json({ challengeId: data.challengeId });
  } catch (err) {
    // Already set up: nothing to do, the wallet exists.
    if (err instanceof CircleError && err.code === ALREADY_INITIALIZED) return Response.json({ challengeId: null });
    console.error("circle initialize", err);
    return Response.json({ error: "Couldn't set up your wallet." }, { status: 502 });
  }
}
