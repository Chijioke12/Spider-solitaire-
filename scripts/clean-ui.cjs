const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');

if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf-8');

  const overrideCss = `
    <style>
      /* KaiOS Device Overrides - Removes HUD and Chassis */
      body, html {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      .workspace-container {
        display: block !important;
        padding: 0 !important;
        background: #000 !important;
        min-height: 100vh !important;
      }
      .controls-hud-panel {
        display: none !important;
      }
      .phone-chassis {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        background: none !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .phone-speaker-grille {
        display: none !important;
      }
      .phone-keypad-panel {
        display: none !important;
      }
      .kaios-display-screen {
        width: 100vw !important;
        height: 100vh !important;
        max-width: 100% !important;
        border: none !important;
        border-radius: 0 !important;
        margin: 0 !important;
      }
    </style>
  `;

  if (!html.includes('/* KaiOS Device Overrides')) {
    html = html.replace('</head>', overrideCss + '</head>');
    fs.writeFileSync(indexPath, html);
    console.log('Successfully injected UI removal CSS into dist/index.html');
  } else {
    console.log('UI removal CSS already present in dist/index.html');
  }
} else {
  console.error('Error: dist/index.html not found. Make sure to run vite build first.');
  process.exit(1);
}
