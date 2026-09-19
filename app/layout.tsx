import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prop Hedge",
  description: "Dynamischer Prop-Firm Hedge-Rechner",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#090e19",
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="de"><body>{children}</body></html>;
}
