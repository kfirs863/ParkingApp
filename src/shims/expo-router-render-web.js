// Shim for expo-router/node/render.js
//
// Expo SDK 54 Metro always invokes the expo-router SSR pipeline during
// 'expo export --platform web', regardless of the output mode, even for apps
// that don't use expo-router. This shim satisfies the module requirement by
// returning a complete HTML shell. Client-side React Navigation handles all
// routing; no server-side rendering is needed.

module.exports = {
  renderAsync: async function renderAsync() {
    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
  <meta name="theme-color" content="#F5A623" />
  <link rel="manifest" href="/manifest.json" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Parking" />
  <link rel="apple-touch-icon" href="/icon-192.png" />
  <link rel="icon" type="image/png" href="/icon-192.png" />
  <title>Upper House Parking</title>
  <style>
    html, body { margin: 0; padding: 0; background-color: #0a0a0f; direction: rtl; }
    ::-webkit-scrollbar { display: none; }
    * { scrollbar-width: none; -ms-overflow-style: none; }
  </style>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;
  },
};
