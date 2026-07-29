import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { APP_NAME } from "@/lib/brand";
import SessionProvider from "./SessionProvider";
import SessionTimer from "./SessionTimer";
import FeedbackWidget from "./FeedbackWidget";

// Skedulo brand type: Manrope (display/headings) + Inter (body/UI).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const manrope = Manrope({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });

export const metadata = {
  title: APP_NAME,
  description: "One home for the team's AI ideas — submit, follow, and ship them.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${manrope.variable}`}>
        <SessionProvider>
          {children}
          <SessionTimer />
          <FeedbackWidget />
        </SessionProvider>
      </body>
    </html>
  );
}
