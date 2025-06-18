import { app, BrowserWindow } from 'electron';
import { ExternalScrapper } from './externalScrapper.js';
import { InternalScrapper } from './internalScrapper.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLOUDFLARE_STATUS_FILE = path.join(__dirname, '.cloudflare-passed');

function hasPassedCloudflare() {
    return fs.existsSync(CLOUDFLARE_STATUS_FILE);
}

function markCloudflareAsPassed() {
    try {
        fs.writeFileSync(CLOUDFLARE_STATUS_FILE, new Date().toISOString());
    } catch (error) {
        console.error('Error marking Cloudflare as passed:', error);
    }
}

function clearCloudflareStatus() {
    try {
        if (fs.existsSync(CLOUDFLARE_STATUS_FILE)) {
            fs.unlinkSync(CLOUDFLARE_STATUS_FILE);
        }
    } catch (error) {
        console.error('Error clearing Cloudflare status:', error);
    }
}

async function initializeApp() {
    const userDataPath = path.join(__dirname, 'electron-userdata');
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
    app.setPath('userData', userDataPath);
    
    // Suppress GPU and hardware acceleration errors
    app.commandLine.appendSwitch('--disable-dev-shm-usage');
    app.commandLine.appendSwitch('--no-sandbox');
    app.commandLine.appendSwitch('--disable-gpu');
    app.commandLine.appendSwitch('--disable-gpu-sandbox');
    app.commandLine.appendSwitch('--disable-software-rasterizer');
    app.commandLine.appendSwitch('--disable-gpu-process-crash-limit');
    app.commandLine.appendSwitch('--disable-features', 'VizDisplayCompositor');
    app.commandLine.appendSwitch('--disable-background-timer-throttling');
    app.commandLine.appendSwitch('--disable-backgrounding-occluded-windows');
    app.commandLine.appendSwitch('--disable-renderer-backgrounding');
    app.commandLine.appendSwitch('--disable-ipc-flooding-protection');
    app.commandLine.appendSwitch('--log-level', '3'); // Only show fatal errors
    
    await app.whenReady();
    return app;
}



async function runScraper(tokenAddress, maxWindows, totalPages) {
    console.log('Initializing Electron app...');
    const electronApp = await initializeApp();
    
    // Check if we've already passed Cloudflare
    const skipTestWindow = hasPassedCloudflare();
    console.log(`Cloudflare status: ${skipTestWindow ? 'Previously passed' : 'Need to check'}`);
    
    if (!skipTestWindow) {
        console.log('Opening test window for Cloudflare check...');
        // Pre-solve any Cloudflare captcha before starting scrapers
        const testWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            show: true,
           
        });
        
        const testUrl = `https://etherscan.io/advanced-filter?tkn=${tokenAddress}&txntype=2&ps=100&p=1`;
        console.log(`Loading URL: ${testUrl}`);
        
        await testWindow.loadURL(testUrl);
    
    // Wait for the table to load or user to close window
    await new Promise((resolve) => {
        let resolved = false;
        
        // Add timeout after 30 seconds
        const timeout = setTimeout(() => {
            if (!resolved) {
                console.log('Timeout reached, proceeding without Cloudflare verification');
                resolved = true;
                testWindow.close();
                markCloudflareAsPassed();
                resolve();
            }
        }, 30000);
        
        // Check for table every 2 seconds
        const checkTable = async () => {
            if (resolved) return;
            
            try {
                const tableExists = await testWindow.webContents.executeJavaScript(`
                    (function() {
                        try {
                            // Check if transaction table exists and has content
                            const table = document.querySelector('table');
                            const hasRows = table && table.querySelector('tbody tr');
                            const hasTransactionData = document.body.textContent.includes('Txn Hash') || 
                                                     document.body.textContent.includes('Transaction Hash');
                            
                            return table && hasRows && hasTransactionData;
                        } catch (error) {
                            return false;
                        }
                    })()
                `);
                
                if (tableExists) {
                    console.log('Table found! Cloudflare check passed.');
                    resolved = true;
                    clearTimeout(timeout);
                    testWindow.close();
                    // Mark Cloudflare as passed
                    markCloudflareAsPassed();
                    resolve();
                    return;
                }
            } catch (error) {
                console.log('Checking for table...', error.message);
            }
            
            if (!resolved) {
                setTimeout(checkTable, 200);
            }
        };
        
        // Handle manual window closure
        testWindow.on('closed', () => {
            if (!resolved) {
                console.log('Test window closed manually');
                resolved = true;
                clearTimeout(timeout);
                // Mark Cloudflare as passed even on manual close
                markCloudflareAsPassed();
                resolve();
            }
        });
        
        // Start checking for table after initial load
        setTimeout(checkTable, 200);
    });
    }

    const totalStartTime = Date.now();

    try {
        const externalScrapper = new ExternalScrapper(electronApp, tokenAddress, maxWindows, totalPages);
        const internalScrapper = new InternalScrapper(electronApp, tokenAddress, maxWindows, totalPages);
        const [externalHashes, internalHashes] = await Promise.all([externalScrapper.scrappe(), internalScrapper.scrappe()]);
        
        const totalEndTime = Date.now();
        const totalSeconds = Math.round((totalEndTime - totalStartTime) / 1000);
        const totalMinutes = Math.floor(totalSeconds / 60);
        const remainingSeconds = totalSeconds % 60;
        
        console.log('=== PARALLEL EXECUTION SUMMARY ===');
        console.log(`External transactions: ${externalHashes.length} hashes`);
        console.log(`Internal transactions: ${internalHashes.length} hashes`);
        console.log(`Total unique hashes: ${externalHashes.length + internalHashes.length}`);
        console.log(`Total parallel time: ${totalSeconds} seconds (${totalMinutes}m ${remainingSeconds}s)`);

        return {
            external: externalHashes,
            internal: internalHashes,
            totalTime: totalSeconds
        };

    } catch (error) {
        console.error('Error during parallel scraping:', error);
        throw error;
    } finally {
        // Quit the app after scraping is complete
        console.log('Quitting application...');
        electronApp.quit();
    }
}

// Export the main function for use as a module
export { runScraper };

// Only run the example when this file is executed directly (not when imported)
const isMainModule = process.argv[1] && process.argv[1].endsWith('index.js');

if (isMainModule) {
    console.log('Running as main module...');
    // Example usage - Only runs when executed directly
    (async () => {
        try {
            console.log('Starting Ethereum transaction scraper...');
            const result = await runScraper('0x0023A1D0106185cBcC81b253a267b9d05015E0b7', 10, 500);
            console.log('Scraping completed successfully!');
        } catch (error) {
            console.error('Scraping failed:', error);
        }
    })();
} else {
    console.log('Module imported, ready for use.');
}
