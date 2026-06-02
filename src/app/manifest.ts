import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Finance",
    short_name: "Finance",
    description:
      "Track transactions, net worth, bills and allocations — your personal finances in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f0f17",
    theme_color: "#5b46e0",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
