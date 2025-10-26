// ============================================
// GATEWAY TRADING BOT - SIMPLIFIED BACKEND
// Using SQLite for easy setup (no PostgreSQL needed)
// ============================================

require('dotenv').config();
const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const axios = require('axios');
const express = require('express');
const WebSocket = require('ws');
const Database = require('better-sqlite3');
const bs58 = require('bs58');
const cors = require('cors');

// Configuration
const CONFIG = {
  NETWORK: process.env.NETWORK || 'devnet',
  RPC_ENDPOINT: process.env.RPC_ENDPOINT || 'https://api.devnet.solana.com',
  GATEWAY_API_URL: process.env.GATEWAY_API_URL || 'https://gateway.sanctum.so',
  GATEWAY_API_KEY: process.env.GATEWAY_API_KEY,
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY,
  MIN_PROFIT_USD: parseFloat(process.env.MIN_PROFIT_USD) || 0.5,
  MAX_POSITION_SIZE_SOL: parseFloat(process.env.MAX_POSITION_SIZE_SOL) || 0.1,
  DATABASE_PATH: process.env.DATABASE_PATH || './gateway_bot.db',
  PORT: process.env.PORT || 3001,
  JUPITER_API: 'https://quote-api.jup.ag/v6',
};

// ============================================
// SQLITE DATABASE SETUP
// ============================================

const db = new Database(CONFIG.DATABASE_PATH);
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_signature TEXT UNIQUE,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    network TEXT,
    method TEXT,
    dex TEXT,
    token_in TEXT,
    token_out TEXT,
    amount_in REAL,
    amount_out REAL,
    expected_profit_usd REAL,
    actual_profit_usd REAL,
    cost_sol REAL,
    jito_tip_sol REAL,
    refunded INTEGER DEFAULT 0,
    status TEXT,
    latency_ms INTEGER,
    error_message TEXT
  );

  CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    token_in TEXT,
    token_out TEXT,
    dex_buy TEXT,
    dex_sell TEXT,
    buy_price REAL,
    sell_price REAL,
    profit_percent REAL,
    executed INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions(timestamp);
  CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
`);

console.log('✅ SQLite database initialized');

// ============================================
// GATEWAY CLIENT
// ============================================

class GatewayClient {
  constructor() {
    this.apiUrl = CONFIG.GATEWAY_API_URL;
    this.apiKey = CONFIG.GATEWAY_API_KEY;
  }

  async buildGatewayTransaction(transaction, options = {}) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/v1/transaction/build`,
        {
          transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
          network: CONFIG.NETWORK,
          deliveryMethod: options.deliveryMethod || 'optimized',
          jitoTipLamports: options.jitoTipLamports || 10000,
          priorityFee: options.priorityFee || 'auto',
          ...options
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      return response.data;
    } catch (error) {
      console.error('Gateway build error:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendTransaction(signedTransaction, options = {}) {
    try {
      const startTime = Date.now();
      
      const response = await axios.post(
        `${this.apiUrl}/v1/transaction/send`,
        {
          transaction: signedTransaction.serialize().toString('base64'),
          network: CONFIG.NETWORK,
          enableRoundRobin: options.enableRoundRobin !== false,
          rpcs: options.rpcs || [CONFIG.RPC_ENDPOINT],
          ...options
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const latency = Date.now() - startTime;

      return {
        signature: response.data.signature,
        method: response.data.deliveryMethod || 'gateway',
        refunded: response.data.jitoRefunded || false,
        latency,
        ...response.data
      };
    } catch (error) {
      console.error('Gateway send error:', error.response?.data || error.message);
      throw error;
    }
  }
}

// ============================================
// ARBITRAGE DETECTOR (SIMPLIFIED)
// ============================================

class ArbitrageDetector {
  constructor(connection) {
    this.connection = connection;
    this.jupiterApi = CONFIG.JUPITER_API;
  }

  async getJupiterQuote(inputMint, outputMint, amount) {
    try {
      const response = await axios.get(`${this.jupiterApi}/quote`, {
        params: {
          inputMint,
          outputMint,
          amount,
          slippageBps: 50
        },
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      return null;
    }
  }

  async scanMarkets() {
    const opportunities = [];
    const baseMint = 'So11111111111111111111111111111111111111112'; // SOL
    const tokens = [
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    ];

    for (const token of tokens) {
      try {
        const amount = Math.floor(0.01 * 1e9); // 0.01 SOL

        // Path: SOL -> Token -> SOL
        const quote1 = await this.getJupiterQuote(baseMint, token, amount);
        if (!quote1) continue;

        const quote2 = await this.getJupiterQuote(token, baseMint, quote1.outAmount);
        if (!quote2) continue;

        const profitLamports = parseInt(quote2.outAmount) - amount;
        const profitPercent = (profitLamports / amount) * 100;

        if (profitPercent > 0.1) { // 0.1% minimum
          const opportunity = {
            token_in: baseMint,
            token_out: token,
            path: `SOL -> ${token.slice(0, 6)}... -> SOL`,
            buy_price: parseFloat(quote1.outAmount) / amount,
            sell_price: parseFloat(quote2.outAmount) / parseFloat(quote1.outAmount),
            profit_percent: profitPercent,
            profit_lamports: profitLamports,
            routes: [quote1, quote2]
          };

          opportunities.push(opportunity);

          // Save to database
          const stmt = db.prepare(`
            INSERT INTO arbitrage_opportunities 
            (token_in, token_out, dex_buy, dex_sell, buy_price, sell_price, profit_percent)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          stmt.run(baseMint, token, 'Jupiter', 'Jupiter', 
                   opportunity.buy_price, opportunity.sell_price, profitPercent);
        }
      } catch (error) {
        console.error(`Error scanning ${token}:`, error.message);
      }
    }

    return opportunities;
  }
}

// ============================================
// TRADING BOT
// ============================================

class TradingBot {
  constructor() {
    this.connection = new Connection(CONFIG.RPC_ENDPOINT, 'confirmed');
    this.gateway = new GatewayClient();
    this.arbitrage = new ArbitrageDetector(this.connection);
    
    if (!CONFIG.WALLET_PRIVATE_KEY || CONFIG.WALLET_PRIVATE_KEY === 'your_base58_private_key_here') {
      throw new Error('Please set WALLET_PRIVATE_KEY in .env file');
    }
    
    this.wallet = Keypair.fromSecretKey(bs58.decode(CONFIG.WALLET_PRIVATE_KEY));
    this.isRunning = false;
    this.stats = {
      totalTrades: 0,
      successfulTrades: 0,
      totalProfit: 0,
      totalCost: 0,
      gatewaySavings: 0
    };
  }

  async executeArbitrage(opportunity) {
    console.log(`\n🎯 Executing: ${opportunity.path}`);
    console.log(`Expected profit: ${opportunity.profit_percent.toFixed(2)}%`);

    try {
      // Get swap transaction from Jupiter
      const swapResponse = await axios.post(`${CONFIG.JUPITER_API}/swap`, {
        userPublicKey: this.wallet.publicKey.toString(),
        quoteResponse: opportunity.routes[0],
        wrapAndUnwrapSol: true
      });

      const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
      const transaction = Transaction.from(swapTransactionBuf);

      // Add recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.wallet.publicKey;

      // Sign transaction
      transaction.sign(this.wallet);

      // Send via Gateway
      const startTime = Date.now();
      const result = await this.gateway.sendTransaction(transaction, {
        enableRoundRobin: true,
        rpcs: [CONFIG.RPC_ENDPOINT]
      });

      const latency = Date.now() - startTime;

      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(result.signature, 'confirmed');
      
      const txData = {
        tx_signature: result.signature,
        network: CONFIG.NETWORK,
        method: result.method,
        dex: 'Jupiter',
        token_in: opportunity.token_in,
        token_out: opportunity.token_out,
        expected_profit_usd: opportunity.profit_percent,
        cost_sol: 0.0001,
        jito_tip_sol: 0.00001,
        refunded: result.refunded ? 1 : 0,
        status: confirmation.value.err ? 'failed' : 'success',
        latency_ms: latency
      };

      // Save to database
      const stmt = db.prepare(`
        INSERT INTO transactions 
        (tx_signature, network, method, dex, token_in, token_out, 
         expected_profit_usd, cost_sol, jito_tip_sol, refunded, status, latency_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        txData.tx_signature, txData.network, txData.method, txData.dex,
        txData.token_in, txData.token_out, txData.expected_profit_usd,
        txData.cost_sol, txData.jito_tip_sol, txData.refunded,
        txData.status, txData.latency_ms
      );

      // Update stats
      this.stats.totalTrades++;
      if (!confirmation.value.err) {
        this.stats.successfulTrades++;
        this.stats.totalProfit += opportunity.profit_percent;
      }
      this.stats.totalCost += txData.cost_sol;
      if (result.refunded) {
        this.stats.gatewaySavings += txData.jito_tip_sol * 0.9;
      }

      console.log(`✅ Trade executed: ${result.signature.slice(0, 8)}...`);
      console.log(`Method: ${result.method} | Refunded: ${result.refunded} | Latency: ${latency}ms`);

      // Broadcast to WebSocket
      this.broadcastTransaction(txData);

      return txData;

    } catch (error) {
      console.error('❌ Trade failed:', error.message);
      
      const stmt = db.prepare(`
        INSERT INTO transactions (network, method, dex, status, error_message)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(CONFIG.NETWORK, 'gateway', 'Jupiter', 'failed', error.message);

      return null;
    }
  }

  async scanAndTrade() {
    console.log('\n🔍 Scanning for arbitrage...');
    
    const opportunities = await this.arbitrage.scanMarkets();
    console.log(`Found ${opportunities.length} opportunities`);

    for (const opp of opportunities) {
      if (!this.isRunning) break;
      if (opp.profit_percent < CONFIG.MIN_PROFIT_USD) continue;

      await this.executeArbitrage(opp);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  async start() {
    console.log('\n🚀 Starting Gateway Trading Bot...');
    console.log(`Network: ${CONFIG.NETWORK}`);
    console.log(`Wallet: ${this.wallet.publicKey.toString()}`);
    
    const balance = await this.connection.getBalance(this.wallet.publicKey);
    console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL`);

    if (balance < 0.01 * 1e9) {
      throw new Error('Insufficient balance. Need at least 0.01 SOL');
    }

    this.isRunning = true;

    while (this.isRunning) {
      try {
        await this.scanAndTrade();
        await new Promise(resolve => setTimeout(resolve, 15000)); // 15 sec between scans
      } catch (error) {
        console.error('Bot error:', error.message);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  stop() {
    console.log('\n⏸️  Stopping bot...');
    this.isRunning = false;
    this.printStats();
  }

  printStats() {
    console.log('\n📊 Statistics:');
    console.log(`Total Trades: ${this.stats.totalTrades}`);
    console.log(`Successful: ${this.stats.successfulTrades}`);
    console.log(`Success Rate: ${((this.stats.successfulTrades / this.stats.totalTrades) * 100 || 0).toFixed(2)}%`);
    console.log(`Total Cost: ${this.stats.totalCost.toFixed(4)} SOL`);
    console.log(`Gateway Savings: ${this.stats.gatewaySavings.toFixed(4)} SOL`);
  }

  broadcastTransaction(txData) {
    if (global.wss) {
      global.wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'transaction', data: txData }));
        }
      });
    }
  }
}

// ============================================
// EXPRESS API SERVER
// ============================================

const app = express();
app.use(cors());
app.use(express.json());

let bot = null;

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Gateway Trading Bot API',
    isRunning: bot?.isRunning || false 
  });
});

// Get stats
app.get('/api/stats', (req, res) => {
  try {
    const result = db.prepare(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_transactions,
        AVG(latency_ms) as avg_latency,
        SUM(actual_profit_usd) as total_profit,
        SUM(cost_sol) as total_cost,
        SUM(CASE WHEN refunded = 1 THEN jito_tip_sol * 0.9 ELSE 0 END) as gateway_savings
      FROM transactions
    `).get();

    res.json({
      totalTransactions: result.total_transactions || 0,
      successfulTransactions: result.successful_transactions || 0,
      successRate: result.total_transactions > 0 
        ? (result.successful_transactions / result.total_transactions * 100) 
        : 0,
      avgLatency: result.avg_latency || 0,
      totalProfit: result.total_profit || 0,
      totalCost: result.total_cost || 0,
      gatewaySavings: result.gateway_savings || 0,
      isRunning: bot?.isRunning || false,
      network: process.env.NETWORK || 'devnet'  // ADD THIS LINE IF MISSING
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Get transactions
app.get('/api/transactions', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const transactions = db.prepare(`
      SELECT * FROM transactions 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(limit);

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get opportunities
app.get('/api/opportunities', (req, res) => {
  try {
    const opportunities = db.prepare(`
      SELECT * FROM arbitrage_opportunities 
      ORDER BY timestamp DESC 
      LIMIT 20
    `).all();

    res.json(opportunities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start bot
app.post('/api/bot/start', async (req, res) => {
  try {
    if (bot?.isRunning) {
      return res.status(400).json({ error: 'Bot already running' });
    }

    bot = new TradingBot();
    bot.start().catch(console.error);

    res.json({ message: 'Bot started successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop bot
app.post('/api/bot/stop', (req, res) => {
  try {
    if (!bot?.isRunning) {
      return res.status(400).json({ error: 'Bot not running' });
    }

    bot.stop();
    res.json({ message: 'Bot stopped successfully', stats: bot.stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBSOCKET SERVER
// ============================================

const server = app.listen(CONFIG.PORT, () => {
  console.log(`\n🌐 API Server: http://localhost:${CONFIG.PORT}`);
  console.log('\n📡 API Endpoints:');
  console.log(`  GET  http://localhost:${CONFIG.PORT}/api/stats`);
  console.log(`  GET  http://localhost:${CONFIG.PORT}/api/transactions`);
  console.log(`  POST http://localhost:${CONFIG.PORT}/api/bot/start`);
  console.log(`  POST http://localhost:${CONFIG.PORT}/api/bot/stop`);
  console.log('\n✅ Ready! Configure .env and start trading.\n');
});

const wss = new WebSocket.Server({ server });
global.wss = wss;

wss.on('connection', (ws) => {
  console.log('📡 WebSocket client connected');
  ws.on('close', () => console.log('📡 WebSocket client disconnected'));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  if (bot?.isRunning) bot.stop();
  db.close();
  process.exit(0);
});
