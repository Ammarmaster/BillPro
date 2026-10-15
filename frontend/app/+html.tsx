// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: "100%", backgroundColor: "#08090C" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        
        {/* Primary Meta Tags */}
        <title>EzBill - #1 Restaurant POS, ERP &amp; Restaurant Management System</title>
        <meta name="title" content="EzBill - #1 Restaurant POS, ERP &amp; Restaurant Management System" />
        <meta
          name="description"
          content="EzBill is India's leading restaurant POS, ERP &amp; restaurant management system. 0ms offline table billing, live digital KOT printing, 58mm/80mm thermal printer auto-setup, and float-safe GST invoices from ₹299/mo."
        />
        <meta
          name="keywords"
          content="ezbill, ezbill pos, ezbill erp, ezbill pos erp, ezbill software, ezbill restaurant pos, ezbill billing software, ezbill app, ezbill login, erp restaurant management system, restaurant pos, restaurant erp, restaurant billing software, restaurant management system, cafe billing software, cloud kitchen pos, table management system, kot printing software, thermal printer billing app, gst restaurant invoice software, best pos for restaurants india, offline billing app, bar pos system, quick service restaurant pos, restaurant inventory software, billing machine for restaurant"
        />
        <meta name="author" content="EzBill Solutions" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <link rel="canonical" href="https://ezbill.jobsio.in/" />

        {/* Open Graph / Facebook / WhatsApp */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="EzBill" />
        <meta property="og:url" content="https://ezbill.jobsio.in/" />
        <meta property="og:title" content="EzBill - #1 Restaurant POS, ERP &amp; Restaurant Management System" />
        <meta
          property="og:description"
          content="Run your entire food business with 0ms offline speed. Real-time table layout, live digital KOTs, universal thermal printer integration, and instant UPI QR billing."
        />
        <meta property="og:image" content="https://ezbill.jobsio.in/icon-512.png" />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        <meta property="og:image:alt" content="EzBill Restaurant POS, ERP &amp; Restaurant Management System" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@ezbill" />
        <meta name="twitter:url" content="https://ezbill.jobsio.in/" />
        <meta name="twitter:title" content="EzBill - Restaurant POS, ERP &amp; Restaurant Management System" />
        <meta
          name="twitter:description"
          content="India's leading Restaurant ERP with live Table Management, KOT thermal printing, and GST calculation. Works 100% offline."
        />
        <meta name="twitter:image" content="https://ezbill.jobsio.in/icon-512.png" />

        <meta name="google-site-verification" content="google1360c11d4597b537" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#08090C" />
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

        {/* Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />

        {/* Structured Data (JSON-LD) for Maximum Google Ranking on EzBill, EzBill POS, EzBill ERP, ERP Restaurant Management System */}
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
                    "EzBill Billing Software",
                    "ERP Restaurant Management System",
                    "EzBill Restaurant Management System"
                  ],
                  "description": "EzBill - Smart Restaurant POS, Table Management, KOT Thermal Printing & GST Billing ERP System.",
                  "publisher": {
                    "@id": "https://ezbill.jobsio.in/#organization"
                  },
                  "inLanguage": "en"
                },
                {
                  "@type": "Organization",
                  "@id": "https://ezbill.jobsio.in/#organization",
                  "name": "EzBill Solutions",
                  "alternateName": ["EzBill", "EZBill", "EzBill POS", "EzBill ERP"],
                  "url": "https://ezbill.jobsio.in/",
                  "logo": "https://ezbill.jobsio.in/icon-512.png",
                  "contactPoint": {
                    "@type": "ContactPoint",
                    "telephone": "+91-81520-75375",
                    "email": "contactprodevopz@gmail.com",
                    "contactType": "customer service",
                    "areaServed": "IN",
                    "availableLanguage": ["English", "Hindi"]
                  },
                  "sameAs": ["https://ezbill.jobsio.in/"],
                  "description": "EzBill is India's leading restaurant POS and ERP management system with live table management, thermal KOT printing, and offline billing."
                },
                {
                  "@type": "SoftwareApplication",
                  "@id": "https://ezbill.jobsio.in/#software",
                  "name": "EzBill - Restaurant POS & ERP Management System",
                  "alternateName": [
                    "EzBill POS",
                    "EzBill ERP",
                    "ERP Restaurant Management System",
                    "EzBill Billing Software"
                  ],
                  "operatingSystem": "Web, Android, iOS, Windows, macOS, Linux",
                  "applicationCategory": "BusinessApplication",
                  "applicationSubCategory": "Restaurant Management System",
                  "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": "4.9",
                    "ratingCount": "1280",
                    "reviewCount": "1280"
                  },
                  "offers": [
                    {
                      "@type": "Offer",
                      "name": "Starter Plan",
                      "price": "299",
                      "priceCurrency": "INR",
                      "priceValidUntil": "2028-12-31"
                    },
                    {
                      "@type": "Offer",
                      "name": "Pro Restaurant ERP",
                      "price": "499",
                      "priceCurrency": "INR",
                      "priceValidUntil": "2028-12-31"
                    }
                  ],
                  "description": "EzBill provides instant 0ms restaurant billing, live table grid management, thermal receipt printing, float-safe GST calculations, and kitchen order ticket (KOT) workflows."
                },
                {
                  "@type": "FAQPage",
                  "@id": "https://ezbill.jobsio.in/#faq",
                  "mainEntity": [
                    {
                      "@type": "Question",
                      "name": "What is EzBill Restaurant POS & ERP?",
                      "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "EzBill is India's premier restaurant POS, ERP & restaurant management system designed for dine-in restaurants, cafes, cloud kitchens, and bars. It offers 0ms offline speed, live table status grids, thermal receipt printing, and automated GST tax calculations."
                      }
                    },
                    {
                      "@type": "Question",
                      "name": "How does EzBill Table Management work?",
                      "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "EzBill provides a real-time visual grid of all restaurant tables showing live status: Available (Green), Occupied (Amber), and Billed (Blue). Waiters and cashiers can transfer tables, split orders, merge bills, and track active diner sessions seamlessly."
                      }
                    },
                    {
                      "@type": "Question",
                      "name": "Does EzBill POS ERP work offline without internet?",
                      "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "Yes, EzBill runs 100% offline with local-first processing. All orders, table states, and billing operate without lag and synchronize securely with the cloud once an internet connection is restored."
                      }
                    },
                    {
                      "@type": "Question",
                      "name": "Which thermal printers are compatible with EzBill?",
                      "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "EzBill natively supports all 58mm (2-inch) and 80mm (3-inch) ESC/POS thermal receipt printers via Bluetooth (MTP-II), USB OTG, WiFi, Ethernet (LAN), and direct Web Browser print dialogs for instant KOT and customer invoice printing."
                      }
                    },
                    {
                      "@type": "Question",
                      "name": "How does EzBill calculate GST invoices accurately?",
                      "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "EzBill uses an integer-paise billing calculation engine that eliminates floating-point rounding errors. It computes CGST (e.g. 2.5%), SGST (2.5%), custom service charges, and automatic round-off to the nearest rupee conforming to GST compliance standards."
                      }
                    },
                    {
                      "@type": "Question",
                      "name": "What is the price of EzBill restaurant billing software?",
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
              html, body {
                background-color: #08090C !important;
              }
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; background-color: #08090C !important; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }

              /* High-DPI Image Optimization & Smoothing */
              img {
                image-rendering: -webkit-optimize-contrast;
                image-rendering: crisp-edges;
              }

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
          backgroundColor: "#08090C",
        }}
      >
        {children}
      </body>
    </html>
  );
}
