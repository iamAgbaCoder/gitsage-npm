const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
const child_process = require('child_process');
const readline = require('readline');

// Configuration
const REPO = 'iamAgbaCoder/gitsage';
const PKG_JSON = require('./package.json');
const PKG_VERSION = PKG_JSON.version;

// The actual version of the binary released on GitHub
// Decoupled from the NPM wrapper's version (currently v1.1.0)
const CLI_VERSION = 'v1.0.0'; 
const VERSION = CLI_VERSION;

// Setup paths
const BIN_DIR = path.join(__dirname, 'bin');
const BIN_NAME = os.platform() === 'win32' ? 'gitsage.exe' : 'gitsage';
const BIN_PATH = path.join(BIN_DIR, BIN_NAME);
const TMP_PATH = BIN_PATH + '.tmp';
const VERSION_FILE = path.join(BIN_DIR, '.version');

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

// Ensure bin directory exists
if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
}

const isTTY = process.stdout.isTTY;

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

let lastReportedPercent = -1;

function renderProgressBar(downloaded, total, startTime) {
    const percent = total > 0 ? (downloaded / total) : 0;
    const now = Date.now();
    const elapsed = (now - startTime) / 1000;
    const speed = downloaded / elapsed;

    if (!isTTY) {
        // Log progress every 20% in non-TTY environments
        const currentPercent = Math.floor(percent * 5) * 20;
        if (currentPercent > lastReportedPercent) {
            console.log(`  Progress: ${currentPercent}% (${formatBytes(downloaded)}${total > 0 ? ' / ' + formatBytes(total) : ''}) @ ${formatBytes(speed)}/s`);
            lastReportedPercent = currentPercent;
        }
        return;
    }

    const width = 30;
    let clampedPercent = percent > 1 ? 1 : percent;
    
    const completedLines = Math.round(width * clampedPercent);
    const bar = '[' + '='.repeat(completedLines) + ' '.repeat(width - completedLines) + ']';
    
    const percentage = (clampedPercent * 100).toFixed(1) + '%';
    const sizeInfo = `${formatBytes(downloaded)} / ${total > 0 ? formatBytes(total) : '???'}`;
    const speedInfo = `${formatBytes(speed)}/s`;

    const line = `  ${bar} ${percentage} | ${sizeInfo} | ${speedInfo}`;
    
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(line);
}

function downloadFile(url, dest, currentAttempt = 1, maxRetries = 3) {
    return new Promise((resolve, reject) => {
        const timeoutDuration = 60000;
        let isRequestFinalized = false;

        if (currentAttempt === 1) {
            console.log(`\n⬇️  Downloading GitSage CLI ${VERSION}...`);
        }

        const options = {
            headers: { 'User-Agent': 'gitsage-installer' }
        };

        const request = https.get(url, options, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                isRequestFinalized = true;
                downloadFile(response.headers.location, dest, currentAttempt, maxRetries)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                handleFailure(new Error(`HTTP ${response.statusCode} - ${response.statusMessage}`));
                return;
            }

            const total = parseInt(response.headers['content-length'], 10) || 0;
            let downloaded = 0;
            const startTime = Date.now();

            const file = fs.createWriteStream(dest, { highWaterMark: 1024 * 1024 });

            response.on('data', (chunk) => {
                downloaded += chunk.length;
                renderProgressBar(downloaded, total, startTime);
            });

            response.pipe(file);

            file.on('finish', () => {
                if (isRequestFinalized) return;
                isRequestFinalized = true;
                file.close();
                process.stdout.write('\n'); // New line after progress bar
                resolve();
            });

            file.on('error', (err) => {
                handleFailure(err);
            });
        });

        const handleFailure = (err) => {
            if (isRequestFinalized) return;
            isRequestFinalized = true;

            request.destroy();
            
            if (fs.existsSync(dest)) {
                try { fs.unlinkSync(dest); } catch (e) {}
            }

            if (currentAttempt < maxRetries) {
                const delay = 2000 * currentAttempt;
                console.warn(`\n⚠️ Download failed: ${err.message}. Retrying in ${delay / 1000}s...`);
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
    });
}

function makeExecutable() {
    if (os.platform() !== 'win32') {
        try {
            fs.chmodSync(BIN_PATH, 0o755);
        } catch (e) {
            child_process.spawnSync('chmod', ['+x', BIN_PATH]);
        }
    }
}

async function install() {
    // Auto-detect if already installed
    if (fs.existsSync(BIN_PATH) && fs.existsSync(VERSION_FILE)) {
        try {
            const installedVersion = fs.readFileSync(VERSION_FILE, 'utf8').trim();
            if (installedVersion === PKG_VERSION) {
                console.log(`✅ GitSage CLI ${VERSION} is already installed. Skipping download.`);
                makeExecutable();
                return;
            }
        } catch (e) {}
    }

    try {
        await downloadFile(DOWNLOAD_URL, TMP_PATH);
        
        // Finalize installation
        if (fs.existsSync(BIN_PATH)) fs.unlinkSync(BIN_PATH);
        fs.renameSync(TMP_PATH, BIN_PATH);
        
        // Save installed version
        fs.writeFileSync(VERSION_FILE, PKG_VERSION, 'utf8');
        
        makeExecutable();
        console.log('✅ Installation complete.\n');
        console.log('🚀 GitSage CLI successfully installed and ready to use!\n');
    } catch (error) {
        console.error('\n❌ Failed to install GitSage CLI:', error.message);
        console.error(`Attempted to download from: ${DOWNLOAD_URL}`);
        
        if (fs.existsSync(TMP_PATH)) fs.unlinkSync(TMP_PATH);
        process.exit(1);
    }
}

install();

