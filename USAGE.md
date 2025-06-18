# Using @bcoders.gr/eth-scrapper as an NPM Module

## Installation

```bash
npm install @bcoders.gr/eth-scrapper
```

## Basic Usage

```javascript
import { runScraper } from '@bcoders.gr/eth-scrapper';

async function scrapeTransactions() {
    const result = await runScraper(
        '0x0023A1D0106185cBcC81b253a267b9d05015E0b7', // Token address
        10,  // Max concurrent windows
        500  // Total pages to scrape
    );
    
    console.log('External transactions:', result.external.length);
    console.log('Internal transactions:', result.internal.length);
    console.log('Total time:', result.totalTime, 'seconds');
    
    return result;
}

scrapeTransactions();
```

## Advanced Examples

### 1. Processing Multiple Tokens

```javascript
import { runScraper } from '@bcoders.gr/eth-scrapper';

const tokens = [
    '0x0023A1D0106185cBcC81b253a267b9d05015E0b7',
    '0xA0b86a33E6441617f70d75f73A4E5FBA8ff14Df9',
    '0xdAC17F958D2ee523a2206206994597C13D831ec7'
];

async function scrapeMultipleTokens() {
    const results = {};
    
    for (const token of tokens) {
        console.log(`Scraping token: ${token}`);
        try {
            results[token] = await runScraper(token, 5, 100);
            console.log(`✅ Completed ${token}: ${results[token].external.length + results[token].internal.length} transactions`);
        } catch (error) {
            console.error(`❌ Failed ${token}:`, error.message);
        }
    }
    
    return results;
}
```

### 2. Custom Configuration

```javascript
import { runScraper } from '@bcoders.gr/eth-scrapper';

async function customScraping() {
    const config = {
        tokenAddress: '0x0023A1D0106185cBcC81b253a267b9d05015E0b7',
        maxWindows: 15,    // More windows = faster but uses more resources
        totalPages: 1000   // More pages = more comprehensive data
    };
    
    console.log('Starting high-performance scraping...');
    const startTime = Date.now();
    
    const result = await runScraper(
        config.tokenAddress,
        config.maxWindows,
        config.totalPages
    );
    
    const endTime = Date.now();
    const totalMinutes = Math.round((endTime - startTime) / 1000 / 60);
    
    console.log(`Scraped ${result.external.length + result.internal.length} transactions in ${totalMinutes} minutes`);
    
    return result;
}
```

### 3. Data Export

```javascript
import { runScraper } from '@bcoders.gr/eth-scrapper';
import fs from 'fs';

async function scrapeAndExport() {
    const result = await runScraper(
        '0x0023A1D0106185cBcC81b253a267b9d05015E0b7',
        10,
        500
    );
    
    // Export to JSON
    const exportData = {
        timestamp: new Date().toISOString(),
        tokenAddress: '0x0023A1D0106185cBcC81b253a267b9d05015E0b7',
        external: result.external,
        internal: result.internal,
        stats: {
            externalCount: result.external.length,
            internalCount: result.internal.length,
            totalCount: result.external.length + result.internal.length,
            scrapingTime: result.totalTime
        }
    };
    
    // Save to file
    fs.writeFileSync('transaction-hashes.json', JSON.stringify(exportData, null, 2));
    console.log('Data exported to transaction-hashes.json');
    
    // Export to CSV
    const allHashes = [
        ...result.external.map(hash => ({ hash, type: 'external' })),
        ...result.internal.map(hash => ({ hash, type: 'internal' }))
    ];
    
    const csvContent = 'hash,type\n' + 
        allHashes.map(item => `${item.hash},${item.type}`).join('\n');
    
    fs.writeFileSync('transaction-hashes.csv', csvContent);
    console.log('Data exported to transaction-hashes.csv');
    
    return exportData;
}
```

### 4. Error Handling & Retry Logic

```javascript
import { runScraper } from '@bcoders.gr/eth-scrapper';

async function robustScraping(tokenAddress, maxRetries = 3) {
    let attempt = 1;
    
    while (attempt <= maxRetries) {
        try {
            console.log(`Attempt ${attempt}/${maxRetries} for ${tokenAddress}`);
            
            const result = await runScraper(tokenAddress, 10, 500);
            
            console.log(`✅ Success on attempt ${attempt}`);
            return result;
            
        } catch (error) {
            console.error(`❌ Attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
            }
            
            // Wait before retry (exponential backoff)
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`⏳ Waiting ${waitTime/1000}s before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            attempt++;
        }
    }
}
```

## API Reference

### `runScraper(tokenAddress, maxWindows, totalPages)`

**Parameters:**
- `tokenAddress` (string): Ethereum token contract address
- `maxWindows` (number): Maximum concurrent browser windows (1-20 recommended)
- `totalPages` (number): Total pages to scrape (1-10000)

**Returns:**
```javascript
{
    external: string[],    // Array of external transaction hashes
    internal: string[],    // Array of internal transaction hashes  
    totalTime: number      // Execution time in seconds
}
```

## Performance Tips

1. **Optimal Window Count**: 10-15 windows for best performance/resource balance
2. **Page Limits**: Start with 100-500 pages for testing, scale up as needed
3. **Resource Monitoring**: Monitor CPU/memory usage with high window counts
4. **Network Consideration**: Respect Etherscan's rate limits

## Requirements

- Node.js 16.0.0+
- Electron 28.0.0+
- Windows/macOS/Linux

## Troubleshooting

If scraping gets stuck:
1. Close any browser windows manually
2. Check your internet connection
3. Reduce the number of concurrent windows
4. Try a different token address

## License

MIT
