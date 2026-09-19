import { circleAvailable, circleBlockchain, circleMatchesApp, circleKey } from "@/lib/circle-server";

/** Lets the UI offer email sign-in only when Circle can actually sign on this network. */
export function GET() {
  return Response.json({
    available: circleAvailable(),
    blockchain: circleBlockchain(),
    matchesApp: circleMatchesApp(),
    configured: !!circleKey() && !!process.env.NEXT_PUBLIC_CIRCLE_APP_ID,
  });
}
