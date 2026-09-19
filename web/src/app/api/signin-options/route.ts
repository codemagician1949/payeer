const CONFIG_URL = "https://api.web3modal.org/appkit/v1/config";

/**
 * Reown decides server-side which sign-in methods a project offers (email and socials are a
 * dashboard toggle). The UI asks here so it never advertises a method that isn't switched on.
 */
export async function GET() {
  const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
  if (!projectId) return Response.json({ email: false, socials: false });

  try {
    const res = await fetch(`${CONFIG_URL}?projectId=${projectId}&st=appkit&sv=html-wagmi-1.8.24`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return Response.json({ email: false, socials: false });
    const { features = [] } = (await res.json()) as { features?: string[] };
    return Response.json({
      email: features.includes("email"),
      socials: features.some((f) => f.startsWith("social")),
    });
  } catch {
    return Response.json({ email: false, socials: false });
  }
}
