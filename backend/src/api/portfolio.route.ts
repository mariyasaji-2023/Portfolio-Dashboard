import { Router } from "express";
import * as XLSX from "xlsx";
import path from "path";
import yahooFinance from "yahoo-finance2";
import axios from "axios";
import * as cheerio from "cheerio";
import NodeCache from "node-cache";

const router = Router();

// Define portfolio item type
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

const filePath = path.join(__dirname, "Sample_Portfolio_BE_5668CF4AE9.xlsx");

// Cache setup (store portfolio for 15s)
const cache = new NodeCache({ stdTTL: 15 });

// 🔹 Mapping: Excel names/codes → Yahoo Finance tickers
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

// 🔹 Helper: fetch CMP from Yahoo Finance
async function fetchYahooCMP(symbol: string) {
  try {
    const quote = await yahooFinance.quote(symbol);
    return quote.regularMarketPrice || null;
  } catch (err) {
    console.error(`Yahoo fetch failed for ${symbol}`, err);
    return null;
  }
}

// 🔹 Helper: fetch P/E & Earnings from Google Finance
async function fetchGoogleFinance(symbol: string, exchange: string) {
  try {
    const url = `https://www.google.com/finance/quote/${symbol}:${exchange}`;
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" }, // avoid bot block
    });
    const $ = cheerio.load(data);

    // ⚠️ Selectors may change, adjust if needed
    const peRatio = $('div[aria-label="Price to earnings ratio"]').text().trim();
    const earnings = $('div[aria-label="Earnings per share"]').text().trim();

    return {
      peRatio: peRatio ? parseFloat(peRatio) : null,
      latestEarnings: earnings || null,
    };
  } catch (err) {
    console.error(`Google Finance fetch failed for ${symbol}`, err);
    return { peRatio: null, latestEarnings: null };
  }
}

// 🔹 Build portfolio function (with live data)
async function buildPortfolio(): Promise<PortfolioItem[]> {
  const workbook = XLSX.readFile(filePath);

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("❌ No sheets found in Excel file");
  }

  const sheetName = workbook.SheetNames[0]!;
  const sheet = workbook.Sheets[sheetName]!;
  const rawData = XLSX.utils.sheet_to_json<any>(sheet, {
    defval: null,
    range: 1,
  });

  let currentSector = "Unknown";
  const portfolio: PortfolioItem[] = [];

  for (const row of rawData) {
    const stockName = row["Particulars"];
    const purchasePrice = Number(row["Purchase Price"] || 0);
    const qty = Number(row["Qty"] || 0);

    // ✅ Detect sector row
    if (!purchasePrice && !qty && stockName && stockName.includes("Sector")) {
      currentSector = stockName.trim();
      continue;
    }

    if (!stockName || (!purchasePrice && !qty)) {
      continue;
    }

    const investment = purchasePrice * qty;

    const item: PortfolioItem = {
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
    };

    // 🔹 Fetch Live Data
    try {
      const yahooSymbol = stockSymbolMap[item.stockName];
      if (yahooSymbol) {
        item.cmp = await fetchYahooCMP(yahooSymbol);
        if (item.cmp) {
          item.presentValue = item.cmp * item.qty;
          item.gainLoss = item.presentValue - item.investment;
        }
      } else {
        console.warn(`⚠️ No Yahoo mapping for: ${item.stockName}`);
      }

      // Google Finance (use NSE as default exchange)
      const gData = await fetchGoogleFinance(
        yahooSymbol?.replace(".NS", "") || item.stockName,
        "NSE"
      );
      item.peRatio = gData.peRatio;
      item.latestEarnings = gData.latestEarnings;
    } catch (err) {
      console.warn("API fetch failed for", stockName, err);
    }

    portfolio.push(item);
  }

  // ✅ Portfolio %
  const totalInvestment = portfolio.reduce(
    (sum, stock) => sum + stock.investment,
    0
  );

  portfolio.forEach((stock) => {
    stock.portfolioPercent = totalInvestment
      ? (stock.investment / totalInvestment) * 100
      : 0;
  });

  return portfolio;
}

// 🔹 API Route with caching
router.get("/", async (req, res) => {
  try {
    const cached = cache.get<PortfolioItem[]>("portfolio");
    if (cached) {
      console.log("✅ Serving from cache");
      return res.json(cached);
    }

    const portfolio = await buildPortfolio();

    // Save to cache
    cache.set("portfolio", portfolio);

    res.json(portfolio);
  } catch (error) {
    console.error("Error in /portfolio:", error);
    res.status(500).json({ error: "Failed to fetch portfolio data" });
  }
});

export default router;
