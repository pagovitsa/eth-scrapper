// Example of using @bcoders.gr/eth-scrapper as an npm module
import { runScraper } from '@bcoders.gr/eth-scrapper';

async function main() {
    try {
        console.log('🚀 Using @bcoders.gr/eth-scrapper as npm module');
        
        // Example 1: Basic usage
        const tokenAddress = '0x0023A1D0106185cBcC81b253a267b9d05015E0b7';
        const maxWindows = 5;  // Use fewer windows for demo
        const totalPages = 50; // Scrape fewer pages for demo
        
        console.log(`📊 Scraping transactions for token: ${tokenAddress}`);
        console.log(`⚡ Using ${maxWindows} windows to scrape ${totalPages} pages`);
        
        const result = await runScraper(tokenAddress, maxWindows, totalPages);
        
        console.log('\n=== SCRAPING RESULTS ===');
        console.log(`✅ External transactions: ${result.external.length}`);
        console.log(`✅ Internal transactions: ${result.internal.length}`);
        console.log(`⏱️ Total time: ${result.totalTime} seconds`);
        
        // Example of processing the results
        const allHashes = [...result.external, ...result.internal];
        console.log(`📝 Total unique transaction hashes: ${allHashes.length}`);
        
        // Show first few hashes as example
        if (allHashes.length > 0) {
            console.log('\n📋 Sample transaction hashes:');
            allHashes.slice(0, 5).forEach((hash, index) => {
                console.log(`${index + 1}. ${hash}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error occurred:', error.message);
    }
}

// Run the demo
main();
