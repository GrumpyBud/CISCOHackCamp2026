import type { Metadata, Viewport } from "next";
import { ClerkProvider, SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reflex Console",
  description: "Private ESP32 badge performance and reaction-training dashboard",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ClerkProvider>
    <nav className="auth-nav" aria-label="Account controls">
      <SignedOut><SignInButton><button className="secondary">Sign in</button></SignInButton><SignUpButton><button>Sign up</button></SignUpButton></SignedOut>
      <SignedIn><UserButton /></SignedIn>
    </nav>
    {children}
  </ClerkProvider></body></html>;
}
