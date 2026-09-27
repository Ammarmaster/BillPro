// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <title>EzBill - #1 Restaurant POS, ERP, Table Management & GST Billing Software</title>
        <meta name="title" content="EzBill - #1 Restaurant POS, ERP, Table Management & GST Billing Software" />
        <meta name="description" content="EzBill is India's leading Restaurant POS & ERP billing system. Real-time table management, thermal bill printing (58mm/80mm), float-safe GST invoice calculations, KOT printing, and offline billing at ₹299/month." />
        <meta name="keywords" content="restaurant pos, restaurant erp, table management, bill printing, gst invoice calculation, thermal printer pos, restaurant billing software, kot management, cafe pos software, cloud kitchen pos, bar pos, food billing app, offline billing software, best pos for restaurants india, restaurant inventory management, qr code menu pos, bluetooth bill printer, ezbill, billpro" />
        <meta name="author" content="ProDevOpz Solutions" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <link rel="canonical" href="https://ezbill.jobsio.in/" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://ezbill.jobsio.in/" />
        <meta property="og:title" content="EzBill - Smart Restaurant POS & Table Management ERP" />
        <meta property="og:description" content="Lightning-fast 0ms restaurant billing, table management, thermal receipt printing, and automated GST calculations. Start today from ₹299/mo." />
        <meta property="og:image" content="https://ezbill.jobsio.in/icon-512.png" />

        {/* Twitter Card */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://ezbill.jobsio.in/" />
        <meta property="twitter:title" content="EzBill - Restaurant POS & GST Billing Software" />
        <meta property="twitter:description" content="Modern Restaurant ERP with real-time Table Management, KOT thermal printing, and GST calculation. 0ms offline speed." />
        <meta property="twitter:image" content="https://ezbill.jobsio.in/icon-512.png" />

        <meta name="google-site-verification" content="google1360c11d4597b537" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0A0A0E" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="EzBill" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" href="/icon-192.png" />

        {/* Google Fonts: Plus Jakarta Sans (Modern Clean UI), Caveat (Authentic Cursive), Playfair Display (Luxury Editorial), JetBrains Mono (Thermal Bill & Math) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;0,800;0,900;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap"
          rel="stylesheet"
        />

        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "EzBill Restaurant POS & ERP",
              "operatingSystem": "Web, Android, iOS, Windows, macOS",
              "applicationCategory": "BusinessApplication",
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.9",
                "ratingCount": "1280",
                "reviewCount": "1280"
              },
              "offers": {
                "@type": "Offer",
                "price": "299",
                "priceCurrency": "INR"
              },
              "description": "Smart Restaurant POS, Table Management, Thermal Bill Printing, Float-Safe GST Invoice Calculation, and Kitchen Order Ticket (KOT) Management Software."
            }),
          }}
        />
        {/* Register PWA Service Worker on Web */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(reg) { console.log('[PWA] ServiceWorker registered with scope:', reg.scope); },
                    function(err) { console.warn('[PWA] ServiceWorker registration failed:', err); }
                  );
                });
              }
            `,
          }}
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }

              /* Windows Desktop Smooth Scrollbars */
              ::-webkit-scrollbar {
                width: 8px;
                height: 8px;
              }
              ::-webkit-scrollbar-track {
                background: transparent;
              }
              ::-webkit-scrollbar-thumb {
                background: rgba(148, 163, 184, 0.35);
                border-radius: 4px;
              }
              ::-webkit-scrollbar-thumb:hover {
                background: rgba(148, 163, 184, 0.65);
              }
              * {
                font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                scrollbar-width: thin;
                scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
              }

              /* Interactive cursor pointer for Desktop Web */
              [role="button"], button, a, [data-pressable="true"] {
                cursor: pointer;
              }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
