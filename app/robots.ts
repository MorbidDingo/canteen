import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/operator/", "/kiosk/", "/library/", "/attendance/"],
      },
    ],
    sitemap: "https://cafe-venus.onrender.com/sitemap.xml",
  };
}
