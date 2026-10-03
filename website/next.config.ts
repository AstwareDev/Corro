import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Map cards embed https://www.google.com; existing YouTube clip chips
    // embed youtube-nocookie. Only frame-src is constrained here so no other
    // resource policy changes.
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-src 'self' https://www.google.com https://www.youtube-nocookie.com https://www.youtube.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
