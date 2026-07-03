import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildDir = path.join(__dirname, '..', 'dist');
const outputDir = path.join(__dirname, '..', 'omnisd_build');
const appZipPath = path.join(outputDir, 'application.zip');
const omnisdZipPath = path.join(outputDir, 'spider-solitaire-omnisd.zip');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Ensure dist has a manifest.webapp
const manifestPath = path.join(buildDir, 'manifest.webapp');
if (!fs.existsSync(manifestPath)) {
  console.error('Error: manifest.webapp not found in dist/. Please ensure it is in the public/ folder.');
  process.exit(1);
}

// 1. Create application.zip containing the dist folder contents
async function createApplicationZip() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(appZipPath);
    const archive = new ZipArchive({
      zlib: { level: 9 } // Sets the compression level.
    });

    output.on('close', function() {
      console.log(`application.zip created: ${archive.pointer()} total bytes`);
      resolve();
    });

    archive.on('error', function(err) {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(buildDir, false); // false means don't put it in a 'dist' subfolder
    archive.finalize();
  });
}

// 2. Create the final OmniSD zip
async function createOmniSdZip() {
  const metadata = {
    version: 1,
    manifestURL: "app://kaiosapp/manifest.webapp"
  };

  const metadataPath = path.join(outputDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(omnisdZipPath);
    const archive = new ZipArchive({
      zlib: { level: 9 }
    });

    output.on('close', function() {
      console.log(`OmniSD package created successfully: ${omnisdZipPath} (${archive.pointer()} total bytes)`);
      resolve();
    });

    archive.on('error', function(err) {
      reject(err);
    });

    archive.pipe(output);
    archive.file(metadataPath, { name: 'metadata.json' });
    archive.file(appZipPath, { name: 'application.zip' });
    archive.finalize();
  });
}

async function build() {
  try {
    await createApplicationZip();
    await createOmniSdZip();
  } catch (err) {
    console.error('Error creating OmniSD package:', err);
    process.exit(1);
  }
}

build();
