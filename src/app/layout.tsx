import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Job Hunt Agent",
  description: "AI-powered personal job search assistant",
};

const viewportScript = `
(function(){
  function setHeight(){
    document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
  }
  setHeight();
  window.addEventListener('resize', setHeight);
  window.addEventListener('orientationchange', function(){ setTimeout(setHeight, 100); });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: viewportScript }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
