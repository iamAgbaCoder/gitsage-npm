#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const BIN_NAME = os.platform() === 'win32' ? 'gitsage.exe' : 'gitsage';
const BIN_PATH = path.join(__dirname, 'bin', BIN_NAME);

if (!fs.existsSync(BIN_PATH)) {
    console.error('❌ GitSage CLI binary not found!');
    console.error('The postinstall script likely failed to download it.');
    console.error(`Tried looking for: ${BIN_PATH}`);
    console.error('You may need to reinstall the package or check for network issues during install.');
    process.exit(1);
}

// Forward all arguments except `node` and `index.js`
const args = process.argv.slice(2);

try {
    const result = spawnSync(BIN_PATH, args, {
        stdio: 'inherit',
        windowsHide: true,
    });

    if (result.error) {
        if (result.error.code === 'ENOENT') {
            console.error('\n❌ GitSage CLI binary is missing or cannot be executed at:', BIN_PATH);
        } else {
            console.error('\n❌ Failed to execute GitSage CLI:', result.error.message);
        }
        process.exit(1);
    }

    process.exit(result.status ?? 0);
} catch (error) {
    console.error('\n❌ Unexpected error running GitSage CLI:', error.message);
    process.exit(1);
}
