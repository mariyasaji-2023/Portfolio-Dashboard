"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const XLSX = __importStar(require("xlsx"));
const path_1 = __importDefault(require("path"));
const yahoo_finance2_1 = __importDefault(require("yahoo-finance2"));
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const node_cache_1 = __importDefault(require("node-cache"));
const router = (0, express_1.Router)();
const filePath = path_1.default.join(__dirname, "..", "..", "Sample_Portfolio_BE_5668CF4AE9.xlsx");
// Cache setup (store portfolio for 15s)
const cache = new node_cache_1.default({ stdTTL: 15 });
// 🔹 Mapping: Excel names/codes → Yahoo Finance tickers
const stockSymbolMap = {
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
async function fetchYahooCMP(symbol) {
    try {
        const quote = await yahoo_finance2_1.default.quote(symbol);
        return quote.regularMarketPrice || null;
    }
    catch (err) {
        console.error(`Yahoo fetch failed for ${symbol}`, err);
        return null;
    }
}
// 🔹 Helper: fetch P/E & Earnings from Google Finance
async function fetchGoogleFinance(symbol, exchange) {
    try {
        const url = `https://www.google.com/finance/quote/${symbol}:${exchange}`;
        const { data } = await axios_1.default.get(url, {
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
    }
    catch (err) {
        console.error(`Google Finance fetch failed for ${symbol}`, err);
        return { peRatio: null, latestEarnings: null };
    }
}
// 🔹 Build portfolio function (with live data)
async function buildPortfolio() {
    const workbook = XLSX.readFile(filePath);
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error("❌ No sheets found in Excel file");
    }
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        range: 1,
    });
    let currentSector = "Unknown";
    const portfolio = [];
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
        const item = {
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
            }
            else {
                console.warn(`⚠️ No Yahoo mapping for: ${item.stockName}`);
            }
            // Google Finance (use NSE as default exchange)
            const gData = await fetchGoogleFinance((yahooSymbol === null || yahooSymbol === void 0 ? void 0 : yahooSymbol.replace(".NS", "")) || item.stockName, "NSE");
            item.peRatio = gData.peRatio;
            item.latestEarnings = gData.latestEarnings;
        }
        catch (err) {
            console.warn("API fetch failed for", stockName, err);
        }
        portfolio.push(item);
    }
    // ✅ Portfolio %
    const totalInvestment = portfolio.reduce((sum, stock) => sum + stock.investment, 0);
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
        const cached = cache.get("portfolio");
        if (cached) {
            console.log("✅ Serving from cache");
            return res.json(cached);
        }
        const portfolio = await buildPortfolio();
        // Save to cache
        cache.set("portfolio", portfolio);
        res.json(portfolio);
    }
    catch (error) {
        console.error("Error in /portfolio:", error);
        res.status(500).json({ error: "Failed to fetch portfolio data" });
    }
});
exports.default = router;
//# sourceMappingURL=portfolio.route.js.map