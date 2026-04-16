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
        const timeoutDuration = 60000;
        let isRequestFinalized = false;

        console.log(`[Attempt ${currentAttempt}/${maxRetries}] Downloading ${url.split('?')[0]}...`);

        const file = fs.createWriteStream(dest);
        const options = {
            headers: { 'User-Agent': 'gitsage-installer' }
        };

        const request = https.get(url, options, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                isRequestFinalized = true;
                file.close();
                // Clean up the partial file before redirecting
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
                
                downloadFile(response.headers.location, dest, currentAttempt, maxRetries)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                handleFailure(new Error(`HTTP ${response.statusCode} - ${response.statusMessage}`));
                return;
            }

            response.pipe(file);
        });

        file.on('finish', () => {
            if (isRequestFinalized) return;
            isRequestFinalized = true;
            file.close();
            resolve();
        });

        const handleFailure = (err) => {
            if (isRequestFinalized) return;
            isRequestFinalized = true;

            request.destroy();
            file.removeAllListeners();
            file.close();
            
            if (fs.existsSync(dest)) {
                try { fs.unlinkSync(dest); } catch (e) {}
            }

            if (currentAttempt < maxRetries) {
                const delay = 3000 * currentAttempt;
                console.warn(`Download failed: ${err.message}. Retrying in ${delay / 1000}s...`);
                setTimeout(() => {
                    downloadFile(url, dest, currentAttempt + 1, maxRetries)
                        .then(resolve)
                        .catch(reject);
                }, delay);
            } else {
                reject(err);
            }
        };

        request.on('error', handleFailure);
        request.setTimeout(timeoutDuration, () => {
            handleFailure(new Error(`Socket timeout after ${timeoutDuration / 1000}s`));
        });

        file.on('error', (err) => {
            handleFailure(err);
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
