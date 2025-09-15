import { Router } from "express"; 
import * as XLSX from "xlsx";
import path from "path";
import yahooFinance from "yahoo-finance2";
import NodeCache from "node-cache";
import cron from "node-cron";

const router = Router();

interface PortfolioItem {
  stockName: string;
  purchasePrice: number;
  qty: number;
  investment: number;
  portfolioPercent: number;
  exchange: string;
  cmp: number | null;
  presentValue: number | null;
  gainLoss: number | null;
  peRatio: number | null;
  latestEarnings: number | string | null;
  sector: string;
}

const filePath = path.join(__dirname, "..", "..", "Sample_Portfolio_BE_5668CF4AE9.xlsx");

// Increased cache time to 10 minutes since we're doing batch updates
const cache = new NodeCache({ stdTTL: 600 });

const stockSymbolMap: Record<string, string> = {
  "HDFC Bank": "HDFCBANK.NS",
  "Bajaj Finance": "BAJFINANCE.NS",
  "ICICI Bank": "ICICIBANK.NS",
  "Affle India": "AFFLE.NS",
  "LTI Mindtree": "LTIM.NS",
  "KPIT Tech": "KPITTECH.NS",
  "Tata Tech": "TATATECH.NS",
  "BLS E-Services": "BLSE.NS",
  "Tanla": "TANLA.NS",
  "Dmart": "DMART.NS",
  "Tata Consumer": "TATACONSUM.NS",
  "Pidilite": "PIDILITIND.NS",
  "Tata Power": "TATAPOWER.NS",
  "KPI Green": "KPIGREEN.NS",
  "Suzlon": "SUZLON.NS",
  "Gensol": "GENSOL.NS",
  "Hariom Pipes": "HARIOMPIPE.NS",
  "Astral": "ASTRAL.NS",
  "Polycab": "POLYCAB.NS",
  "Clean Science": "CLEAN.NS",
  "Deepak Nitrite": "DEEPAKNTR.NS",
  "Fine Organic": "FINEORG.NS",
  "Gravita": "GRAVITA.NS",
  "SBI Life": "SBILIFE.NS",
  "Infy": "INFY.NS",
  "Happeist Mind": "HAPPSTMNDS.NS",
  "Easemytrip": "EASEMYTRIP.NS",
};

// 🔹 Helper: Create timeout promise
function createTimeoutPromise<T>(ms: number): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
}

// 🔹 OPTIMIZED: Batch fetch multiple quotes at once
async function fetchBatchQuotes(symbols: string[]): Promise<Map<string, any>> {
  const results = new Map<string, any>();
  
  try {
    // Yahoo Finance supports batch requests - much faster!
    const quotes = await Promise.race([
      yahooFinance.quote(symbols),
      createTimeoutPromise<any>(8000) // 8 second timeout for batch
    ]);

    // Handle both single quote and array of quotes
    const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
    
    quotesArray.forEach((quote: any) => {
      if (quote && quote.symbol) {
        results.set(quote.symbol, quote);
      }
    });
  } catch (err) {
    console.error(`Batch Yahoo fetch failed:`, err instanceof Error ? err.message : err);
  }

  return results;
}

// 🔹 OPTIMIZED: Process stocks in smaller batches
async function processStocksBatch(items: PortfolioItem[], batchSize: number = 10): Promise<PortfolioItem[]> {
  const results: PortfolioItem[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const symbols = batch
      .map(item => stockSymbolMap[item.stockName])
      .filter((symbol): symbol is string => Boolean(symbol));

    console.log(`📊 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(items.length/batchSize)}`);

    // Fetch all quotes for this batch at once
    const quotesMap = await fetchBatchQuotes(symbols);

    // Process each item in the batch
    const processedBatch = batch.map(item => {
      const yahooSymbol = stockSymbolMap[item.stockName];
      
      if (!yahooSymbol) {
        console.warn(`⚠️ No Yahoo mapping for: ${item.stockName}`);
        return item;
      }

      const quote = quotesMap.get(yahooSymbol);
      
      if (quote) {
        // Get current market price
        const cmp = quote.regularMarketPrice || quote.price || null;
        
        if (cmp && typeof cmp === 'number') {
          item.cmp = cmp;
          item.presentValue = item.cmp * item.qty;
          item.gainLoss = item.presentValue - item.investment;
        }

        // Get P/E ratio from Yahoo (more reliable than scraping)
        item.peRatio = quote.trailingPE || quote.forwardPE || null;
        
        // Get earnings data
        item.latestEarnings = quote.epsTrailingTwelveMonths || 
                             quote.epsForward || 
                             quote.earningsPerShare || null;
      }

      return item;
    });

    results.push(...processedBatch);
    
    // Small delay between batches to be respectful to the API
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

// 🔹 OPTIMIZED: Build portfolio with batch processing
async function buildPortfolio(): Promise<PortfolioItem[]> {
  console.log("📊 Building portfolio with optimizations...");
  const startTime = Date.now();

  const workbook = XLSX.readFile(filePath);

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("❌ No sheets found in Excel file");
  }

  const sheetName = workbook.SheetNames[0]!;
  const sheet = workbook.Sheets[sheetName]!;
  const rawData = XLSX.utils.sheet_to_json<any>(sheet, { defval: null, range: 1 });

  let currentSector = "Unknown";
  const portfolio: PortfolioItem[] = [];

  for (const row of rawData) {
    const stockName = row["Particulars"];
    const purchasePrice = Number(row["Purchase Price"] || 0);
    const qty = Number(row["Qty"] || 0);

    if (!purchasePrice && !qty && stockName && stockName.includes("Sector")) {
      currentSector = stockName.trim();
      continue;
    }

    if (!stockName || (!purchasePrice && !qty)) continue;

    const investment = purchasePrice * qty;

    portfolio.push({
      stockName,
      purchasePrice,
      qty,
      investment,
      portfolioPercent: 0,
      exchange: row["NSE/BSE"] || "",
      cmp: null,
      presentValue: null,
      gainLoss: null,
      peRatio: null,
      latestEarnings: null,
      sector: currentSector,
    });
  }

  // 🚀 OPTIMIZED: Process all stocks in batches instead of one by one
  const portfolioWithData = await processStocksBatch(portfolio, 10);

  const totalInvestment = portfolioWithData.reduce((sum, stock) => sum + stock.investment, 0);

  portfolioWithData.forEach((stock) => {
    stock.portfolioPercent = totalInvestment
      ? (stock.investment / totalInvestment) * 100
      : 0;
  });

  const duration = (Date.now() - startTime) / 1000;
  console.log(`✅ Portfolio built in ${duration.toFixed(2)} seconds`);

  return portfolioWithData;
}

// 🔹 Seed cache at startup
async function seedCache() {
  console.log("🚀 Seeding cache at startup...");
  try {
    const portfolio = await buildPortfolio();
    cache.set("portfolio", portfolio);
    console.log("✅ Cache seeded successfully");
  } catch (err) {
    console.error("❌ Failed to seed cache:", err);
  }
}

// 🔹 OPTIMIZED: Auto-refresh cache every 10 minutes instead of 5
cron.schedule("*/10 * * * *", async () => {
  console.log("🔄 Auto-refreshing portfolio...");
  try {
    const portfolio = await buildPortfolio();
    cache.set("portfolio", portfolio);
    console.log("✅ Auto-refresh success");
  } catch (err) {
    console.error("❌ Auto-refresh failed:", err);
  }
});

// 🔹 OPTIMIZED: API Route with better caching strategy
router.get("/", async (req, res) => {
  const cached = cache.get<PortfolioItem[]>("portfolio");
  
  if (cached) {
    return res.json({
      success: true,
      data: cached,
      cached: true,
      timestamp: new Date().toISOString(),
      totalStocks: cached.length
    });
  }

  // If cache is empty, try to build portfolio but with timeout
  try {
    console.log("⚠️ Cache miss - building portfolio on-demand");
    
    const portfolioPromise = buildPortfolio();
    const timeoutPromise = createTimeoutPromise<PortfolioItem[]>(15000); // 15 second max
    
    const portfolio = await Promise.race([portfolioPromise, timeoutPromise]);
    
    cache.set("portfolio", portfolio);
    
    res.json({
      success: true,
      data: portfolio,
      cached: false,
      timestamp: new Date().toISOString(),
      totalStocks: portfolio.length
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: "Portfolio data is being built in the background. Please try again in a few moments.",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// 🔹 Health check with more details
router.get("/health", (req, res) => {
  const cacheStats = cache.getStats();
  const portfolio = cache.get<PortfolioItem[]>("portfolio");
  
  res.json({
    status: "healthy",
    cache: { 
      keys: cache.keys().length, 
      stats: cacheStats,
      portfolioLoaded: !!portfolio,
      stockCount: portfolio?.length || 0
    },
    timestamp: new Date().toISOString()
  });
});

// 🔹 Force refresh with async option
router.post("/refresh", async (req, res) => {
  const { async = false } = req.body;
  
  try {
    cache.del("portfolio");
    
    if (async) {
      // Start refresh in background
      buildPortfolio().then(portfolio => {
        cache.set("portfolio", portfolio);
        console.log("✅ Async refresh completed");
      }).catch(err => {
        console.error("❌ Async refresh failed:", err);
      });
      
      res.json({
        success: true,
        message: "Portfolio refresh started in background",
        async: true,
        timestamp: new Date().toISOString()
      });
    } else {
      const portfolio = await buildPortfolio();
      cache.set("portfolio", portfolio);
      res.json({
        success: true,
        message: "Portfolio refreshed successfully",
        data: portfolio,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to refresh portfolio",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Initialize cache after a short delay to let the server start
setTimeout(seedCache, 2000);

export default router;