import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import SessionTimer from "./SessionTimer";

// Skedulo brand type: Manrope (display/headings) + Inter (body/UI).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const manrope = Manrope({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });

export const metadata = {
  title: "AI Ideas Hub",
  description: "One home for the team's AI ideas — submit, follow, and ship them.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${manrope.variable}`}>
        {children}
        <SessionTimer />
      </body>
    </html>
  );
}
