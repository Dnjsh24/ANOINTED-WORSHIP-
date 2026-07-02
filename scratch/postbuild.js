const fs = require('fs');
const path = require('path');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(function(childItemName) {
      copyRecursiveSync(path.join(src, childItemName),
                        path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

const buildDir = path.join(__dirname, '..', '.next');
const serverDir = path.join(buildDir, 'server');

if (fs.existsSync(serverDir)) {
  const targetSubdir = 'services/anointed-worship-app';
  
  // Handle 'pages' directory
  const pagesSrc = path.join(serverDir, 'pages');
  if (fs.existsSync(pagesSrc)) {
    const pagesDest = path.join(pagesSrc, targetSubdir);
    console.log(`Copying pages from ${pagesSrc} to ${pagesDest}...`);
    // Create temporary folder to avoid infinite recursion
    const tempPagesDest = path.join(buildDir, 'temp-pages-copy');
    copyRecursiveSync(pagesSrc, tempPagesDest);
    copyRecursiveSync(tempPagesDest, pagesDest);
    fs.rmSync(tempPagesDest, { recursive: true, force: true });
  }

  // Handle 'app' directory
  const appSrc = path.join(serverDir, 'app');
  if (fs.existsSync(appSrc)) {
    const appDest = path.join(appSrc, targetSubdir);
    console.log(`Copying app from ${appSrc} to ${appDest}...`);
    // Create temporary folder to avoid infinite recursion
    const tempAppDest = path.join(buildDir, 'temp-app-copy');
    copyRecursiveSync(appSrc, tempAppDest);
    copyRecursiveSync(tempAppDest, appDest);
    fs.rmSync(tempAppDest, { recursive: true, force: true });
  }
  
  console.log('Postbuild copy completed successfully!');
} else {
  console.warn('No .next/server folder found to process.');
}
