import type { MetadataRoute } from "next";

/**
 * Makes Payeer installable: added to a phone's home screen it opens without browser chrome,
 * which is how a payments app is actually used. The shortcuts are the two things people open
 * the app to do.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Payeer — money between friends on Arc",
    short_name: "Payeer",
    description: "Request USDC with a link, spin for who pays the bill, and lock stakes with friends in escrow.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0f17",
    theme_color: "#0f0f17",
    categories: ["finance", "social", "utilities"],
    icons: [
      { src: "/payeer.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/payeer-192.png", sizes: "192x192", type: "image/png" },
      { src: "/payeer-512.png", sizes: "512x512", type: "image/png" },
      // Lets Android crop the icon to whatever shape the launcher uses, instead of boxing it.
      { src: "/payeer-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Request money", short_name: "Request", url: "/request" },
      { name: "Spin for the bill", short_name: "Spin", url: "/spin" },
    ],
  };
}
