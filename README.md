# GitSage CLI (NPM Wrapper)

This is the official Node Package Manager installer for **GitSage**. 

This package serves as a lightweight, robust, and zero-dependency wrapper that automatically downloads and executes the correct native binary for your operating system and architecture during installation.

## Installation

Install GitSage globally using your preferred package manager:

**Using npm:**
```bash
npm install -g gitsage
```

**Using yarn:**
```bash
yarn global add gitsage
```

**Using pnpm:**
```bash
pnpm add -g gitsage
```

## Supported Platforms

This wrapper automatically requests the correct pre-compiled binary based on your environment:

- **macOS** (`darwin`): x64 & arm64 (Apple Silicon)
- **Linux** (`linux`): x64 & arm64
- **Windows** (`win32`): x64

> **Note:** The installer requires an active internet connection to evaluate system details and download the associated GitHub Release binary during installation.

## Usage

Once installed globally, you can use the `gitsage` CLI command from anywhere.

```bash
gitsage <command> [options]
```

**Example:**
```bash
gitsage --help
```

*All arguments, environment variables, standard inputs, and colorized outputs are forwarded transparently via `child_process.spawnSync`.*

## How Fast Is It?

This package deliberately isolates away dependencies (no bulky `node_modules` like `axios`, `tar`, or `node-fetch`). It solely leverages built-in Node native libraries to instantly:
1. Parse your active environment
2. Download via Node's `https` module
3. Update OS file permissions
4. Map execution proxies internally

This ensures incredibly swift installation times with high stability across npm, yarn, and pnpm environments.

## Issues and Feedback

For feature requests, bug reports, or general questions regarding this npm installer or GitSage itself, please open an issue tracking topic in the [main GitSage repository](https://github.com/iamAgbaCoder/gitsage). 
