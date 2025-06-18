// Test local import to verify module functionality
import { runScraper } from './index.js';

console.log('Testing module import...');
console.log('runScraper function imported:', typeof runScraper);

// Quick test with minimal parameters
async function testModule() {
    try {
        console.log('Starting quick test with minimal scraping...');
        // Use very small numbers for quick test
        const result = await runScraper(
            '0x0023A1D0106185cBcC81b253a267b9d05015E0b7',
            2,  // Only 2 windows
            5   // Only 5 pages
        );
        
        console.log('✅ Module test successful!');
        console.log('Result structure:', {
            external: result.external?.length || 0,
            internal: result.internal?.length || 0,
            totalTime: result.totalTime
        });
        
    } catch (error) {
        console.error('❌ Module test failed:', error.message);
    }
}

testModule();
