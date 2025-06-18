#!/usr/bin/env node

// CLI wrapper for the eth-scrapper module
import { runScraper } from './index.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🚀 Ethereum Transaction Scraper

Usage:
  npx @bcoders.gr/eth-scrapper [token_address] [max_windows] [total_pages]
  
Examples:
  npx @bcoders.gr/eth-scrapper 0x0023A1D0106185cBcC81b253a267b9d05015E0b7
  npx @bcoders.gr/eth-scrapper 0x0023A1D0106185cBcC81b253a267b9d05015E0b7 10 500

Parameters:
  token_address  - Ethereum token contract address (required)
  max_windows    - Maximum concurrent windows (default: 10)
  total_pages    - Total pages to scrape (default: 500)

Options:
  --help, -h     - Show this help message
`);
    process.exit(0);
}

// Get parameters from command line or use defaults
const tokenAddress = args[0] || '0x0023A1D0106185cBcC81b253a267b9d05015E0b7';
const maxWindows = parseInt(args[1]) || 10;
const totalPages = parseInt(args[2]) || 500;

console.log('🚀 Starting Ethereum Transaction Scraper via Electron...');
console.log(`📊 Token: ${tokenAddress}`);
console.log(`⚡ Windows: ${maxWindows}`);
console.log(`📄 Pages: ${totalPages}`);

// Run via electron to ensure proper context
const electronPath = path.join(__dirname, 'node_modules', '.bin', 'electron');
const mainScript = path.join(__dirname, 'electron-runner.js');

// Create a temporary runner script
import fs from 'fs';

const runnerScript = `
import { runScraper } from './index.js';

(async () => {
    try {
        const result = await runScraper('${tokenAddress}', ${maxWindows}, ${totalPages});
        console.log('\\n=== SCRAPING COMPLETED ===');
        console.log('External transactions:', result.external.length);
        console.log('Internal transactions:', result.internal.length);
        console.log('Total time:', result.totalTime, 'seconds');
        process.exit(0);
    } catch (error) {
        console.error('Scraping failed:', error);
        process.exit(1);
    }
})();
`;

fs.writeFileSync(mainScript, runnerScript);

// Spawn electron process
const electronProcess = spawn('npx', ['electron', mainScript], {
    stdio: 'inherit',
    shell: true
});

electronProcess.on('close', (code) => {
    // Clean up runner script
    try {
        fs.unlinkSync(mainScript);
    } catch (e) {}
    
    process.exit(code);
});

electronProcess.on('error', (error) => {
    console.error('Failed to start electron:', error);
    try {
        fs.unlinkSync(mainScript);
    } catch (e) {}
    process.exit(1);
});
