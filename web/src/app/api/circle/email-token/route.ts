import { circleAvailable, circleFetch } from "@/lib/circle-server";

type EmailToken = { deviceToken: string; deviceEncryptionKey: string; otpToken: string };

/** Step one of email sign-in: Circle emails a one-time code and hands back device credentials. */
export async function POST(request: Request) {
  if (!circleAvailable()) return Response.json({ error: "Email sign-in isn't available here." }, { status: 503 });

  const { email, deviceId } = (await request.json().catch(() => ({}))) as { email?: string; deviceId?: string };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "That email address doesn't look right." }, { status: 400 });
  }
  if (!deviceId) return Response.json({ error: "Missing device id." }, { status: 400 });

  try {
    const data = await circleFetch<EmailToken>({
      path: "/users/email/token",
      method: "POST",
      body: { deviceId, email },
    });
    return Response.json(data);
  } catch (err) {
    console.error("circle email token", err);
    return Response.json({ error: "Couldn't start email sign-in. Try again shortly." }, { status: 502 });
  }
}
