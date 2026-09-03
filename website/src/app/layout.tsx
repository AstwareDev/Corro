import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["600", "700"],
  subsets: ["latin"],
});

const title = "Corro";
const description =
  "Corro is a self-hosted research agent. Ask a question, watch it search, read, and cite its way to an answer — on your own infrastructure.";

export const metadata: Metadata = {
  title: {
    default: title,
    template: "%s · Corro",
  },
  description,
  keywords: [
    "Corro",
    "research agent",
    "self-hosted AI",
    "AI research assistant",
    "open source agent",
    "LLM agent",
  ],
  applicationName: "Corro",
  openGraph: {
    title,
    description,
    siteName: "Corro",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-ink">
        {children}
      </body>
    </html>
  );
}
