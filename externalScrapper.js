import electron from 'electron';
const { BrowserWindow } = electron;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLOUDFLARE_STATUS_FILE = path.join(__dirname, '.cloudflare-passed');

function clearCloudflareStatus() {
    try {
        if (fs.existsSync(CLOUDFLARE_STATUS_FILE)) {
            fs.unlinkSync(CLOUDFLARE_STATUS_FILE);
            console.warn('🛡️ Cloudflare detected - clearing status file for next run');
        }
    } catch (error) {
        console.error('Error clearing Cloudflare status:', error);
    }
}

export class ExternalScrapper {
    constructor(electronApp, tokenAddress, maxWindows = 10, totalPages = 500) {
        this.app = electronApp;
        this.tokenAddress = tokenAddress;
        this.windows = [];
        this.maxWindows = maxWindows;
        this.totalPages = totalPages;        // Performance-optimized constant options
        this.options = {
            headless: true,
            offscreen: true,
            windowCooldown: 300, // ms between same-window requests
            enableProgressLogging: true,
            autoRetryFailed: true,
            maxRetries: 2,
            pageTimeout: 8000,
            batchDelay: 100
        };

        this.failedPages = new Set(); // Track failed pages for retry
        this.processedPages = new Set(); // Track for progress logging

        this.createWindows();
    }

    createUrl(page) {
        return `https://etherscan.io/advanced-filter?tkn=${this.tokenAddress}&txntype=2&ps=100&p=${page}`;
    }

    createWindows() {
        for (let i = 0; i < this.maxWindows; i++) {
            const window = this.createWindow();
            this.windows.push(window);
        }
        //console.log(`Created ${this.windows.length} browser windows`);
    }
    createWindow() {
        const window = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                webSecurity: false,
                allowRunningInsecureContent: true,
                offscreen: this.options.offscreen, // Configurable offscreen rendering
                backgroundThrottling: false,
                experimentalFeatures: true
            },
            title: 'Etherscan Browser',
            show: !this.options.headless, // Configurable headless mode
            skipTaskbar: true,
            minimizable: false,
            maximizable: false,
            resizable: false
        });

        // Increase max listeners to prevent memory leak warnings
        window.webContents.setMaxListeners(50);

        // Optimize for speed
        window.webContents.setAudioMuted(true);
        window.webContents.setVisualZoomLevelLimits(1, 1);

        // Disable unnecessary features for performance
        if (!this.options.offscreen) {
            window.webContents.executeJavaScript(`
                document.documentElement.style.scrollBehavior = 'auto';
                const style = document.createElement('style');
                style.textContent = 'img { display: none !important; }';
                document.head.appendChild(style);
            `).catch(() => { });
        }

        return window;
    }
    async scrapePage(page) {
        const windowindex = (page - 1) % this.maxWindows;
        const window = this.windows[windowindex];
        const url = this.createUrl(page);

        // Generate unique ID for this page processing
        const uniqueId = `${Date.now()}_${page}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            // Optimized loading with proper event cleanup
            const loadResult = await Promise.race([
                new Promise(async (resolve, reject) => {
                    try {
                        let resolved = false;
                        const resolveOnce = () => {
                            if (!resolved) {
                                resolved = true;
                                cleanup();
                                resolve({ success: true });
                            }
                        };

                        const rejectOnce = (error) => {
                            if (!resolved) {
                                resolved = true;
                                cleanup();
                                reject(error);
                            }
                        };

                        // Event handlers
                        const domReadyHandler = () => resolveOnce();
                        const stopLoadingHandler = () => resolveOnce();
                        const failLoadHandler = (event, errorCode, errorDescription) => {
                            rejectOnce(new Error(`Navigation failed: ${errorCode} - ${errorDescription}`));
                        };

                        // Cleanup function to remove all listeners
                        const cleanup = () => {
                            window.webContents.removeListener('dom-ready', domReadyHandler);
                            window.webContents.removeListener('did-stop-loading', stopLoadingHandler);
                            window.webContents.removeListener('did-fail-load', failLoadHandler);
                        };

                        // Add event listeners
                        window.webContents.once('dom-ready', domReadyHandler);
                        window.webContents.once('did-stop-loading', stopLoadingHandler);
                        window.webContents.once('did-fail-load', failLoadHandler);

                        await window.loadURL(url);

                        // Fallback resolution if events don't fire
                        setTimeout(() => {
                            if (!resolved) {
                                resolveOnce();
                            }
                        }, 200);

                    } catch (error) {
                        reject(error);
                    }
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Page load timeout')), this.options.pageTimeout)
                )
            ]);

            // Minimal wait for essential content only
            await new Promise(resolve => setTimeout(resolve, 800));

            // Get HTML content with timeout and error handling
            const htmlContent = await Promise.race([
                window.webContents.executeJavaScript('document.documentElement.outerHTML').catch(err => {
                    throw new Error(`JS execution failed: ${err.message}`);
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('HTML extraction timeout')), 5000)
                )
            ]);            // Advanced content validation with failure pattern detection
            if (!htmlContent || htmlContent.length < 500) {
                console.warn(`Page ${page}: Insufficient content (${htmlContent?.length || 0} chars)`);
                throw new Error('Insufficient HTML content received');
            }

            // Check for known failure patterns (rate limiting, captcha, etc.)
            const failurePatterns = [
                'Access Denied',
                'captcha',
                'CAPTCHA',
                'blocked',
                'rate limit',
                'temporarily unavailable',
                'service unavailable',
                'cloudflare',
                'please try again'
            ];

            const contentLower = htmlContent.toLowerCase();
            const detectedFailure = failurePatterns.find(pattern =>
                contentLower.includes(pattern.toLowerCase())
            );            if (detectedFailure) {
                console.warn(`Page ${page}: Detected failure pattern "${detectedFailure}"`);
                
                // If Cloudflare is detected, clear the status file
                if (detectedFailure === 'cloudflare') {
                    clearCloudflareStatus();
                }
                
                throw new Error(`Blocked by Etherscan or ${detectedFailure} detected`);
            }// Process directly in memory - no temporary file needed!
            return { page, htmlContent, uniqueId };

        } catch (error) {
            // More specific error handling
            const errorMsg = error.message || 'Unknown error';
            if (errorMsg.includes('ERR_ABORTED')) {
                console.warn(`Page ${page} request was aborted - likely rate limited`);
            } else if (errorMsg.includes('timeout')) {
                console.warn(`Page ${page} timed out - server may be slow`);
            } else {
                console.error('Error scraping page ' + page + ':', errorMsg);
            }
            return { page, htmlContent: null, uniqueId: null };
        }
    }

    parseHTMLForHashes(htmlContent, page) {
        try {
            // Ultra-fast regex parsing with pre-compiled pattern
            const hashRegex = /href="[^"]*\/tx\/(0x[a-fA-F0-9]{64})"/g;
            const hashSet = new Set();
            let match;
            let matchCount = 0;

            // Use while loop for maximum performance
            while ((match = hashRegex.exec(htmlContent)) !== null) {
                hashSet.add(match[1]);
                matchCount++;

                // Safety check to avoid infinite loops
                if (matchCount > 10000) {
                    console.warn('Page ' + page + ': Too many matches, breaking early');
                    break;
                }
            }

            const hashes = Array.from(hashSet);
            return hashes;

        } catch (error) {
            console.error('Error parsing HTML for page ' + page + ':', error);
            return [];
        }
    }

    async parseHTMLAsync(pageData) {
        return new Promise((resolve) => {
            setImmediate(() => {
                try {
                    if (!pageData.htmlContent) {
                        resolve({ page: pageData.page, hashes: [] });
                        return;
                    }

                    const hashes = this.parseHTMLForHashes(pageData.htmlContent, pageData.page);
                    resolve({ page: pageData.page, hashes });
                } catch (error) {
                    console.error('Error in async parsing for page ' + pageData.page + ':', error);
                    resolve({ page: pageData.page, hashes: [] });
                }
            });
        });
    }    async scrappe() {
        // First detect the actual total pages available
        const detectedPages = await this.detectTotalPages();
        const actualTotalPages = Math.min(detectedPages, this.totalPages); // Use detected or configured, whichever is smaller
        const allHashesSet = new Set();
        const processedPages = new Set();
        let completedCount = 0;

        // Optimized concurrent processing with immediate parsing
        const activePromises = new Map();

        // Initialize window queues
        for (let i = 0; i < this.maxWindows; i++) {
            activePromises.set(i, Promise.resolve());
        }

        // Create a more efficient processing pipeline
        const processPage = async (page) => {
            const windowIndex = (page - 1) % this.maxWindows;

            // Chain to the previous request for this window to avoid conflicts
            const previousPromise = activePromises.get(windowIndex); const pagePromise = previousPromise
                .then(async () => {
                    // Per-window cooldown to reduce rate limiting
                    await new Promise(resolve => setTimeout(resolve, this.options.windowCooldown));
                    return this.scrapePageSafe(page);
                }).then(async (result) => {
                    if (result.htmlContent) {
                        // Parse immediately in the same promise chain for max speed
                        const hashes = this.parseHTMLForHashes(result.htmlContent, page);

                        // Add hashes to global set immediately
                        hashes.forEach(hash => allHashesSet.add(hash));
                        if (!processedPages.has(page)) {
                            processedPages.add(page);
                            this.processedPages.add(page); // Track for progress logging
                            completedCount++;                            // Progress logging
                           
                        }
                        // Memory-only processing - no temp file deletion needed
                        return { page, hashCount: hashes.length };
                    } else {
                        // Track failed page for potential retry
                        this.failedPages.add(page);
                        return { page, hashCount: 0 };
                    }
                })
                .catch(error => {
                    console.error(`Error processing page ${page}:`, error);
                    this.failedPages.add(page);
                    return { page, hashCount: 0 };
                });

            // Update the window's active promise
            activePromises.set(windowIndex, pagePromise);
            return pagePromise;
        };        // Launch all pages with intelligent batching and rate limiting
        const maxConcurrent = this.maxWindows;
        let batchStart = 1;
        let errorCount = 0;

        while (batchStart <= actualTotalPages) {
            const batchEnd = Math.min(batchStart + maxConcurrent - 1, actualTotalPages);
            const currentBatch = [];

            // Create batch of promises
            for (let page = batchStart; page <= batchEnd; page++) {
                currentBatch.push(processPage(page));
            }

            //console.log(`Launching batch: pages ${batchStart}-${batchEnd} (${currentBatch.length} pages)`);

            // Process batch with timeout for resilience
            const batchResults = await Promise.allSettled(currentBatch.map(p =>
                Promise.race([
                    p,
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Batch timeout')), 45000)
                    )
                ])
            ));

            // Count errors in this batch for adaptive rate limiting
            const batchErrors = batchResults.filter(r => r.status === 'rejected').length;
            errorCount += batchErrors;

            batchStart = batchEnd + 1;            // Adaptive delay based on error rate
            if (batchStart <= actualTotalPages) {
                let delay = this.options.batchDelay; // Base delay

                if (batchErrors > 5) {
                    delay = 2000; // High error rate - longer delay
                    console.log(`High error rate detected (${batchErrors} errors), increasing delay to ${delay}ms`);
                } else if (batchErrors > 2) {
                    delay = 800; // Moderate errors
                    console.log(`Moderate errors detected (${batchErrors} errors), delay: ${delay}ms`);
                }

                if (delay > this.options.batchDelay) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // Final wait for any stragglers
        //console.log('Finalizing remaining requests...');
        await Promise.allSettled(Array.from(activePromises.values())); const uniqueHashes = Array.from(allHashesSet);
       // console.log('Ultra-fast scraping completed! Total unique hashes: ' + uniqueHashes.length);
       // console.log('Pages processed: ' + processedPages.size + '/' + actualTotalPages);

        // Automatic retry of failed pages
        if (this.options.autoRetryFailed && this.failedPages.size > 0) {
            console.log(`Retrying ${this.failedPages.size} failed pages...`);
            await this.retryFailedPages(allHashesSet);
        }
        return uniqueHashes;
    }    // Automatic retry of failed pages
    async retryFailedPages(allHashesSet) {
        const failedArray = Array.from(this.failedPages);
        console.log(`Retrying ${failedArray.length} failed pages: ${failedArray.join(', ')}`);

        const retryPromises = failedArray.map(async (page) => {
            try {
                const result = await this.scrapePageSafe(page);
                if (result.htmlContent) {
                    const hashes = this.parseHTMLForHashes(result.htmlContent, page);
                    hashes.forEach(hash => allHashesSet.add(hash));
                    this.failedPages.delete(page); // Remove from failed list
                    console.log(`Retry successful for page ${page}: ${hashes.length} hashes`);
                    return { page, success: true, hashCount: hashes.length };
                }
            } catch (error) {
                console.warn(`Retry failed for page ${page}:`, error.message);
            }
            return { page, success: false, hashCount: 0 };
        });

        const retryResults = await Promise.allSettled(retryPromises);
        const successful = retryResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
        console.log(`Retry completed: ${successful}/${failedArray.length} pages recovered`);
    }    async scrapePageSafe(page) {
        const maxRetries = this.options.maxRetries;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.scrapePage(page);

                // Validate result has sufficient content
                if (result.htmlContent && result.htmlContent.length > 500) {
                    return result;
                }

                if (attempt < maxRetries) {
                    const delay = Math.min(500 * attempt, 2000);
                    console.warn(`Page ${page} attempt ${attempt} failed (insufficient content), retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

            } catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                    // Longer delay for rate limiting issues
                    const isRateLimit = error.message.includes('ERR_ABORTED') || error.message.includes('timeout');
                    const delay = isRateLimit ? Math.min(1000 * attempt, 3000) : Math.min(300 * attempt, 1000);

                    console.warn(`Page ${page} attempt ${attempt} failed: ${error.message} - retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        console.error(`Failed to scrape page ${page} after ${maxRetries} attempts:`, lastError?.message || 'Unknown error');
        return { page, htmlContent: null, uniqueId: null };
    }

    // Clean up resources when done
    cleanup() {
        console.log('Cleaning up browser windows...');
        this.windows.forEach((window, index) => {
            try {
                if (!window.isDestroyed()) {
                    // Remove all listeners to prevent memory leaks
                    window.webContents.removeAllListeners();
                    window.close();
                }
            } catch (error) {
                console.warn(`Error closing window ${index}:`, error.message);
            }
        });
        this.windows = [];
    }

    async detectTotalPages() {
        // Use the first window to detect total pages
        const window = this.windows[0];
        const url = this.createUrl(1);

        try {
            await window.loadURL(url);
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for page load

            const totalPages = await window.webContents.executeJavaScript(`
                (function() {
                    try {
                        // Look for pagination text "Page X of Y"
                        const pageInfo = document.querySelector('.page-link.text-nowrap');
                        if (pageInfo && pageInfo.textContent) {
                            const match = pageInfo.textContent.match(/Page \\d+ of (\\d+)/);
                            if (match) {
                                return parseInt(match[1]);
                            }
                        }
                        
                        // Fallback: check for "Last" button and extract page number
                        const lastButton = document.querySelector('a.page-link[href*="p="]:last-of-type');
                        if (lastButton) {
                            const href = lastButton.getAttribute('href');
                            const match = href.match(/p=(\\d+)/);
                            if (match) {
                                return parseInt(match[1]);
                            }
                        }
                        
                        // If no pagination found, assume 1 page
                        return 1;
                    } catch (error) {
                        return 1;
                    }
                })()
            `);

            return totalPages || 1;
        } catch (error) {
            console.error('Error detecting total pages:', error);
            return 1; // Fallback to 1 page on error
        }
    }}
