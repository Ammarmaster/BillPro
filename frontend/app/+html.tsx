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
        <title>EzBill - #1 Restaurant POS & ERP Billing Software</title>
        <meta name="title" content="EzBill - #1 Restaurant POS & ERP Billing Software" />
        <meta name="description" content="EzBill is India's leading restaurant POS and ERP software. Manage live tables, print thermal KOT and bills via Bluetooth/LAN, compute GST invoices, and bill 100% offline. Plans from ₹299/mo." />
        <meta name="keywords" content="ezbill, ezbill pos, ezbill erp, ezbill pos erp, ezbill software, ezbill restaurant pos, ezbill billing software, ezbill app, ezbill login, restaurant pos, restaurant erp, table management software, gst billing software, thermal printer billing, kot management, cafe pos, bar pos, food billing system, best pos for restaurant, offline billing pos" />
        <meta name="author" content="EzBill Solutions" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <link rel="canonical" href="https://ezbill.jobsio.in/" />

        {/* Open Graph / Facebook / WhatsApp */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="EzBill" />
        <meta property="og:url" content="https://ezbill.jobsio.in/" />
        <meta property="og:title" content="EzBill - #1 Restaurant POS, ERP & Billing Software" />
        <meta property="og:description" content="Lightning-fast 0ms restaurant billing, table management, thermal receipt printing, and automated GST calculations with EzBill POS & ERP. Start at ₹299/mo." />
        <meta property="og:image" content="https://ezbill.jobsio.in/icon-512.png" />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        <meta property="og:image:alt" content="EzBill Restaurant POS & ERP" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@ezbill" />
        <meta name="twitter:url" content="https://ezbill.jobsio.in/" />
        <meta name="twitter:title" content="EzBill - Restaurant POS & GST Billing Software" />
        <meta name="twitter:description" content="India's #1 Restaurant ERP with live Table Management, KOT thermal printing, and GST calculation. Works 100% offline." />
        <meta name="twitter:image" content="https://ezbill.jobsio.in/icon-512.png" />

        <meta name="google-site-verification" content="google1360c11d4597b537" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0F172A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="EzBill" />

        {/* Favicons & App Icons */}
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />

        {/* Google Fonts: Plus Jakarta Sans (Modern Clean UI), Caveat (Authentic Cursive), Playfair Display (Luxury Editorial), JetBrains Mono (Thermal Bill & Math) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;0,800;0,900;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap"
          rel="stylesheet"
        />

        {/* Structured Data (JSON-LD) for High Ranking on "EzBill", "EzBill POS", "EzBill ERP" */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": "https://ezbill.jobsio.in/#website",
                  "url": "https://ezbill.jobsio.in/",
                  "name": "EzBill",
                  "alternateName": [
                    "EZBill",
                    "EzBill POS",
                    "EzBill ERP",
                    "EzBill POS ERP",
                    "EzBill Restaurant POS",
                    "EzBill Billing Software"
                  ],
                  "description": "EzBill - Smart Restaurant POS, Table Management, KOT Thermal Printing & GST Billing Software.",
                  "publisher": {
                    "@id": "https://ezbill.jobsio.in/#organization"
                  },
                  "inLanguage": "en"
                },
                {
                  "@type": "Organization",
                  "@id": "https://ezbill.jobsio.in/#organization",
                  "name": "EzBill",
                  "alternateName": ["EZBill", "EzBill POS", "EzBill ERP"],
                  "url": "https://ezbill.jobsio.in/",
                  "logo": "https://ezbill.jobsio.in/icon-512.png",
                  "sameAs": ["https://ezbill.jobsio.in/"],
                  "description": "EzBill is India's leading restaurant POS and ERP management system with live table management, thermal KOT printing, and offline billing."
                },
                {
                  "@type": "SoftwareApplication",
                  "@id": "https://ezbill.jobsio.in/#software",
                  "name": "EzBill - Restaurant POS & ERP",
                  "operatingSystem": "Web, Android, iOS, Windows, macOS, Linux",
                  "applicationCategory": "BusinessApplication",
                  "applicationSubCategory": "Restaurant Management Software",
                  "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": "4.9",
                    "ratingCount": "1280",
                    "reviewCount": "1280"
                  },
                  "offers": {
                    "@type": "Offer",
                    "price": "299",
                    "priceCurrency": "INR",
                    "priceValidUntil": "2028-12-31"
                  },
                  "description": "EzBill provides instant 0ms restaurant billing, live table grid management, thermal receipt printing, float-safe GST calculations, and kitchen order ticket (KOT) workflows."
                },
                {
                  "@type": "FAQPage",
                  "@id": "https://ezbill.jobsio.in/#faq",
                  "mainEntity": [
                    {
                      "@type": "Question",
                      "name": "What is EzBill?",
                      "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "EzBill is India's premier restaurant POS and ERP billing platform designed for dine-in restaurants, cafes, cloud kitchens, and bars. It offers 0ms offline speed, live table status grids, thermal receipt printing, and automated GST tax calculations."
                      }
                    },
                    {
                      "@type": "Question",
                      "name": "What features are included in EzBill POS and ERP?",
                      "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "EzBill includes Table Management, Kitchen Order Tickets (KOT), Customer Bill Generation, 58mm/80mm Thermal Printer Support (Bluetooth, LAN, USB, Web), GST Invoices (CGST/SGST), QR Code Digital Menus, Menu Photo Importer, and Daily Sales Reports."
                      }
                    },
                    {
                      "@type": "Question",
                      "name": "Does EzBill work offline without internet?",
                      "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "Yes, EzBill runs 100% offline with local-first processing. All orders, table states, and billing operate without lag and synchronize securely with the cloud once an internet connection is available."
                      }
                    },
                    {
                      "@type": "Question",
                      "name": "How much does EzBill cost?",
                      "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "EzBill pricing starts at just ₹299/month (or ₹2,999/year) for the Starter plan, featuring unlimited orders, table management, KOT printing, and GST billing."
                      }
                    }
                  ]
                }
              ]
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
