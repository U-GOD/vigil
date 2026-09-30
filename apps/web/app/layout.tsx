import type { ReactNode } from "react";
import { Providers } from "./providers";
import { Shell } from "./shell";
import "./globals.css";

export const metadata = {
  title: "Vigil",
  description: "Closure note terminal",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
