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
        <meta name="google-site-verification" content="google1360c11d4597b537" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0F172A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="EzBill" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" href="/icon-192.png" />
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
