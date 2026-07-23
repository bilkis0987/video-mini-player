// Script untuk generate icon extension dari logo
// Run: node generate-icons.js

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('sharp tidak terinstall. Install dengan: npm install sharp');
  console.log('Atau gunakan online tool: https://favicon.io/');
  process.exit(1);
}

const logoPath = path.join(__dirname, 'logo-mini-play-web.png');
const iconsDir = path.join(__dirname, 'src', 'icons');

// Ukuran icon yang dibutuhkan
const sizes = [16, 48, 128];

async function generateIcons() {
  // Cek apakah logo ada
  if (!fs.existsSync(logoPath)) {
    console.log('Logo tidak ditemukan:', logoPath);
    process.exit(1);
  }

  console.log('Logo ditemukan:', logoPath);
  console.log('Generating icons...');

  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon${size}.png`);

    await sharp(logoPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // transparent background
      })
      .png()
      .toFile(outputPath);

    console.log(`✓ Generated: icon${size}.png (${size}x${size})`);
  }

  console.log('\nSelesai! Icon extension sudah digenerate.');
  console.log('Lokasi:', iconsDir);
}

generateIcons().catch(console.error);
