# @bcoders.gr/eth-scrapper

A high-performance Electron-based web scraper for extracting Ethereum transaction hashes from Etherscan. This tool efficiently scrapes both external and internal transactions using parallel processing and automatic Cloudflare bypass.

## Features

- 🚀 **Parallel Processing**: Scrapes external and internal transactions simultaneously
- 🛡️ **Cloudflare Bypass**: Automatic handling of Cloudflare protection
- ⚡ **High Performance**: Multi-window processing for faster data extraction
- 🎯 **Precise Targeting**: Extracts transaction hashes for specific token addresses
- 📊 **Detailed Reporting**: Comprehensive execution statistics

## Installation

```bash
npm install @bcoders.gr/eth-scrapper
```

## Usage

### As CLI Tool

```bash
# Install globally for CLI usage
npm install -g @bcoders.gr/eth-scrapper

# Run with default parameters
npx @bcoders.gr/eth-scrapper 0x0023A1D0106185cBcC81b253a267b9d05015E0b7

# Run with custom parameters
npx @bcoders.gr/eth-scrapper 0x0023A1D0106185cBcC81b253a267b9d05015E0b7 10 500

# Show help
npx @bcoders.gr/eth-scrapper --help
```

### As NPM Module

```javascript
import { runScraper } from '@bcoders.gr/eth-scrapper';

// Basic usage
const result = await runScraper(
  '0x0023A1D0106185cBcC81b253a267b9d05015E0b7', // Token address
  10,  // Max concurrent windows
  500  // Total pages to scrape
);

console.log(`External transactions: ${result.external.length}`);
console.log(`Internal transactions: ${result.internal.length}`);
```

### Advanced Configuration

```javascript
const tokenAddress = '0x0023A1D0106185cBcC81b253a267b9d05015E0b7';
const maxWindows = 15;    // Increase for faster scraping (uses more resources)
const totalPages = 1000;  // Increase for more comprehensive data

const result = await runScraper(tokenAddress, maxWindows, totalPages);
```

## API Reference

### `runScraper(tokenAddress, maxWindows, totalPages)`

Scrapes transaction hashes from Etherscan for the specified token.

#### Parameters

- `tokenAddress` (string): The Ethereum token contract address
- `maxWindows` (number): Maximum number of concurrent browser windows (default: 10)
- `totalPages` (number): Total number of pages to scrape (default: 500)

#### Returns

Promise that resolves to an object containing:

```javascript
{
  external: string[],    // Array of external transaction hashes
  internal: string[],    // Array of internal transaction hashes
  totalTime: number      // Total execution time in seconds
}
```

## Performance

- **Concurrent Processing**: Uses multiple Electron windows for parallel data extraction
- **Smart Pagination**: Automatically distributes pages across workers
- **Memory Efficient**: Optimized for handling large datasets
- **Cloudflare Resilient**: Automatic detection and bypass of protection mechanisms

## Requirements

- Node.js 16.0.0 or higher
- Electron 28.0.0 or higher
- Windows/macOS/Linux compatible

## Example Output

```
=== PARALLEL EXECUTION SUMMARY ===
External transactions: 15,432 hashes
Internal transactions: 8,921 hashes
Total unique hashes: 24,353
Total parallel time: 180 seconds (3m 0s)
```

## License

MIT

## Author

bcoders.gr

## Support

For issues and feature requests, please visit: https://github.com/bcoders-gr/eth-scrapper/issues
