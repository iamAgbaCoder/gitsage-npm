const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
const child_process = require('child_process');

// Configuration
const REPO = 'iamAgbaCoder/gitsage';
const PKG_VERSION = require('./package.json').version;
const VERSION = `v${PKG_VERSION}`;

// Generic URL construct for GitHub releases
const getReleaseUrl = (assetName) => `https://github.com/${REPO}/releases/download/${VERSION}/${assetName}`;

function getAssetName() {
    const platform = os.platform();
    const arch = os.arch();

    const osNames = {
        win32: 'windows',
        darwin: 'darwin',
        linux: 'linux'
    };
    
    const archNames = {
        x64: 'amd64',
        arm64: 'arm64'
    };

    const osName = osNames[platform];
    const archName = archNames[arch];

    if (!osName) {
        throw new Error(`Unsupported platform: ${platform}`);
    }
    if (!archName) {
        throw new Error(`Unsupported architecture: ${arch}`);
    }

    const ext = platform === 'win32' ? '.exe' : '';
    // Format assumption: gitsage-linux-amd64, gitsage-windows-amd64.exe
    return `gitsage-${osName}-${archName}${ext}`;
}

const ASSET_NAME = getAssetName();
const DOWNLOAD_URL = getReleaseUrl(ASSET_NAME);
const BIN_DIR = path.join(__dirname, 'bin');
const BIN_NAME = os.platform() === 'win32' ? 'gitsage.exe' : 'gitsage';
const BIN_PATH = path.join(BIN_DIR, BIN_NAME);

// Ensure bin directory exists
if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
}

function downloadFile(url, dest, currentAttempt = 1, maxRetries = 3) {
    return new Promise((resolve, reject) => {
        console.log(`[Attempt ${currentAttempt}/${maxRetries}] Downloading ${url}...`);
        
        const file = fs.createWriteStream(dest);
        
        const request = https.get(url, (response) => {
            // Handle Redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                downloadFile(response.headers.location, dest, currentAttempt, maxRetries)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(dest, () => {}); // Cleanup
                const error = new Error(`HTTP ${response.statusCode} - ${response.statusMessage}`);
                if (currentAttempt < maxRetries) {
                    console.log(`Download failed, retrying in 2 seconds... (${error.message})`);
                    setTimeout(() => {
                        downloadFile(url, dest, currentAttempt + 1, maxRetries)
                            .then(resolve)
                            .catch(reject);
                    }, 2000);
                } else {
                    reject(error);
                }
                return;
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            file.close();
            fs.unlink(dest, () => {}); // Cleanup
            if (currentAttempt < maxRetries) {
                console.log(`Download failed, retrying in 2 seconds... (${err.message})`);
                setTimeout(() => {
                    downloadFile(url, dest, currentAttempt + 1, maxRetries)
                        .then(resolve)
                        .catch(reject);
                }, 2000);
            } else {
                reject(err);
            }
        });

        // Set higher timeout for the socket
        request.setTimeout(30000, () => {
            request.destroy();
            file.close();
            fs.unlink(dest, () => {}); // Cleanup
            reject(new Error('Downloader socket timed out'));
        });
    });
}

function makeExecutable() {
    if (os.platform() !== 'win32') {
        process.stdout.write(`Making binary executable...\n`);
        try {
            fs.chmodSync(BIN_PATH, 0o755);
            console.log('✅ File permissions updated via fs.chmodSync.');
        } catch (e) {
            console.log('Failed to use fs.chmodSync, falling back to shell command...');
            const chmodResult = child_process.spawnSync('chmod', ['+x', BIN_PATH]);
            if (chmodResult.status !== 0) {
                console.warn(`⚠️  Failed to make binary executable. You may need to run: chmod +x ${BIN_PATH}`);
            } else {
                console.log('✅ File permissions updated via chmod spawn.');
            }
        }
    }
}

async function install() {
    try {
        await downloadFile(DOWNLOAD_URL, BIN_PATH);
        makeExecutable();
        console.log('\n🚀 GitSage CLI successfully installed and ready to use!\n');
    } catch (error) {
        console.error('\n❌ Failed to install GitSage CLI:', error.message);
        console.error('Please ensure the version/OS supports this binary or check your network connection.');
        console.error(`Attempted to download: ${DOWNLOAD_URL}`);
        process.exit(1);
    }
}

install();
