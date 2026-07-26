import { Inter, Sora } from "next/font/google";
import "./globals.css";
import SessionTimer from "./SessionTimer";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const sora = Sora({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-sora" });

export const metadata = {
  title: "AI Ideas Hub",
  description: "One home for the team's AI ideas — submit, follow, and ship them.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${sora.variable}`}>
        {children}
        <SessionTimer />
      </body>
    </html>
  );
}
