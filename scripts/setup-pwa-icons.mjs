#!/usr/bin/env node

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const SOURCE_DIR = join(projectRoot, 'public', 'Archiv');
const OUTPUT_DIR = join(projectRoot, 'public', 'icons');
const SOURCE_ICON = join(SOURCE_DIR, 'still moving-512.png');

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('🎨 Processing PWA icons...\n');

/**
 * Remove white background and make it transparent
 */
async function removeWhiteBackground(inputPath) {
  console.log('  → Removing white background...');
  
  // Load the image
  const image = sharp(inputPath);
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Process pixels: make white pixels transparent
  const pixels = new Uint8ClampedArray(data.length);
  const threshold = 240; // Threshold for "white" detection
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    // If pixel is close to white, make it transparent
    if (r >= threshold && g >= threshold && b >= threshold) {
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 0; // Fully transparent
    } else {
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    }
  }
  
  // Return the processed image as a sharp instance
  return sharp(pixels, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4
    }
  }).png();
}

/**
 * Generate standard icons with transparent background
 */
async function generateStandardIcons(baseImage) {
  console.log('  → Generating standard icons...');
  
  const sizes = [
    { size: 512, name: 'icon-512.png' },
    { size: 192, name: 'icon-192.png' },
    { size: 180, name: 'apple-touch-icon.png' },
    { size: 32, name: 'favicon-32.png' },
    { size: 16, name: 'favicon-16.png' }
  ];
  
  for (const { size, name } of sizes) {
    await baseImage
      .clone()
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(join(OUTPUT_DIR, name));
    console.log(`    ✓ ${name} (${size}x${size})`);
  }
}

/**
 * Generate maskable icon with proper padding (70% content, 30% safe zone)
 */
async function generateMaskableIcon(baseImage) {
  console.log('  → Generating maskable icon...');
  
  const canvasSize = 512;
  const contentSize = Math.round(canvasSize * 0.7); // 70% of canvas
  const offset = Math.round((canvasSize - contentSize) / 2);
  
  // Resize the base icon to 70% of canvas
  const resizedIcon = await baseImage
    .clone()
    .resize(contentSize, contentSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  
  // Create a transparent canvas and composite the resized icon centered
  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite([{
    input: resizedIcon,
    top: offset,
    left: offset
  }])
  .png()
  .toFile(join(OUTPUT_DIR, 'icon-512-maskable.png'));
  
  console.log(`    ✓ icon-512-maskable.png (512x512 with safe zone)`);
}

/**
 * Main execution
 */
async function main() {
  try {
    if (!existsSync(SOURCE_ICON)) {
      console.error(`❌ Source icon not found: ${SOURCE_ICON}`);
      process.exit(1);
    }
    
    // Step 1: Remove white background
    const transparentBase = await removeWhiteBackground(SOURCE_ICON);
    
    // Step 2: Generate all standard icons
    await generateStandardIcons(transparentBase);
    
    // Step 3: Generate maskable icon
    await generateMaskableIcon(transparentBase);
    
    console.log('\n✅ All icons generated successfully!\n');
    console.log('Generated files:');
    console.log('  • public/icons/icon-512.png');
    console.log('  • public/icons/icon-192.png');
    console.log('  • public/icons/icon-512-maskable.png');
    console.log('  • public/icons/apple-touch-icon.png');
    console.log('  • public/icons/favicon-32.png');
    console.log('  • public/icons/favicon-16.png');
    
  } catch (error) {
    console.error('❌ Error processing icons:', error);
    process.exit(1);
  }
}

main();
