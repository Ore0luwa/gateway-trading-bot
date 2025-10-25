# Gateway Trading Bot - Architecture

## System Flow Diagram
```
┌─────────────────────────────────────────────────────────┐
│                    USER INTERFACE                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │          React Dashboard (Port 5173)              │  │
│  │  • Real-time transaction monitoring               │  │
│  │  • Performance analytics                          │  │
│  │  • Bot control (Start/Stop)                       │  │
│  │  • Cost savings calculator                        │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │ WebSocket + REST API              │
└─────────────────────┼───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│              TRADING BOT ENGINE (Node.js)                │
│  ┌────────────────────────────────────────────────┐    │
│  │  API Server (Express + WebSocket)              │    │
│  │  Port 3001                                      │    │
│  └─────────────────┬──────────────────────────────┘    │
│                    │                                     │
│  ┌─────────────────▼──────────────────────────────┐    │
│  │  Trading Logic                                  │    │
│  │  • Arbitrage Scanner                            │    │
│  │  • Risk Management                              │    │
│  │  • Position Sizing                              │    │
│  │  • Profit Threshold Checking                    │    │
│  └─────────────────┬──────────────────────────────┘    │
│                    │                                     │
│  ┌─────────────────▼──────────────────────────────┐    │
│  │  Data Layer (SQLite)                            │    │
│  │  • Transaction history                          │    │
│  │  • Arbitrage opportunities                      │    │
│  │  • Performance metrics                          │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌────▼──────┐ ┌────▼─────┐
│   Jupiter    │ │  Raydium  │ │   Orca   │
│     API      │ │    API    │ │   API    │
│              │ │           │ │          │
│ • Price      │ │ • Liquidity│ │ • Pools │
│   quotes     │ │   pools    │ │  data   │
│ • Swap       │ │ • Trading  │ │         │
│   routing    │ │   pairs    │ │         │
└───────┬──────┘ └────┬──────┘ └────┬─────┘
        │             │             │
        └─────────────┼─────────────┘
                      │
         ┌────────────▼────────────┐
         │   SANCTUM GATEWAY       │
         │   (Transaction Layer)   │
         ├─────────────────────────┤
         │ • buildGatewayTx()      │
         │ • sendTransaction()     │
         │ • Round-robin routing   │
         │ • Automatic refunds     │
         │ • Real-time observ.     │
         └────────────┬────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
    ┌────▼───┐  ┌────▼────┐  ┌───▼─────┐
    │  RPC   │  │  Jito   │  │   RPC   │
    │Primary │  │ Bundle  │  │Fallback │
    │        │  │         │  │         │
    └────┬───┘  └────┬────┘  └────┬────┘
         │           │            │
         └───────────┼────────────┘
                     │
         ┌───────────▼────────────┐
         │   SOLANA BLOCKCHAIN    │
         │   (Devnet/Mainnet)     │
         └────────────────────────┘
```

## Component Details

### 1. React Dashboard
- **Technology**: React 18, Vite, Recharts, Tailwind CSS
- **Features**:
  - Real-time WebSocket updates
  - Performance charts
  - Transaction feed
  - Bot control interface
- **Port**: 5173

### 2. Trading Bot Engine
- **Technology**: Node.js, Express, SQLite
- **Components**:
  - **API Server**: REST endpoints + WebSocket server
  - **Arbitrage Scanner**: Multi-DEX price comparison
  - **Risk Manager**: Position limits, profit thresholds
  - **Transaction Executor**: Gateway integration
- **Port**: 3001

### 3. Gateway Integration
- **Key Functions**:
```javascript
  // Build optimized transaction
  buildGatewayTransaction(tx, options)
  
  // Send with dual delivery + auto refund
  sendTransaction(signedTx, options)
```
- **Benefits**:
  - Dual delivery (RPC + Jito)
  - Automatic Jito refunds
  - Round-robin load balancing
  - Real-time observability

### 4. DEX Integration
- **Jupiter**: Primary aggregator, swap routing
- **Raydium**: Direct pool access
- **Orca**: Alternative liquidity

### 5. Database Layer
- **SQLite**: Lightweight, zero-config
- **Tables**:
  - `transactions`: All executed trades
  - `arbitrage_opportunities`: Detected opportunities

## Data Flow: Transaction Execution
```
1. Scanner detects arbitrage opportunity
   ↓
2. Risk manager validates:
   - Profit > threshold
   - Position size within limits
   ↓
3. Build swap transaction via Jupiter
   ↓
4. Gateway optimizes transaction:
   - Adds recent blockhash
   - Sets priority fee
   - Configures delivery methods
   ↓
5. Sign transaction with bot wallet
   ↓
6. Gateway sends to BOTH RPC + Jito
   ↓
7. First to land wins:
   - RPC success? → Jito refunded ✅
   - RPC fails? → Jito delivers ✅
   ↓
8. Confirm on-chain
   ↓
9. Update database with results
   ↓
10. Broadcast to dashboard via WebSocket
```

## Gateway Value Proposition

### Without Gateway:
```javascript
// Manual implementation (50+ lines)
async function sendWithRetry(tx) {
  try {
    // Try RPC
    const rpcResult = await rpc.send(tx);
    await waitForConfirmation();
  } catch (rpcError) {
    // Fallback to Jito
    const jitoResult = await jito.send(tx);
    // Pay full Jito tip - no refund
  }
  // Manual tracking, no observability
}
```

### With Gateway:
```javascript
// Simple, powerful (3 lines)
const result = await gateway.sendTransaction(tx, {
  deliveryMethod: 'optimized'
});
// Automatic refunds, observability, optimization
```

## Performance Metrics

### Expected Results (Based on Gateway's Proven Performance):

| Metric | Traditional | Gateway | Improvement |
|--------|------------|---------|-------------|
| Success Rate | 73% | 94% | +29% |
| Cost/100 TX | 0.095 SOL | 0.0154 SOL | -84% |
| Avg Latency | 2,340ms | 1,120ms | -52% |
| Refund Rate | 0% | ~60% | +60% |

## Security & Risk Management

### Built-in Protections:
1. **Position Limits**: Max trade size enforced
2. **Profit Thresholds**: Only execute profitable trades
3. **Emergency Stop**: Instant bot shutdown
4. **Rate Limiting**: Prevent excessive trading
5. **Error Handling**: Graceful failure recovery

### Environment Security:
- Private keys in `.env` (never committed)
- API keys encrypted in transit
- Database access restricted
- No hardcoded credentials

## Scalability

### Current Setup:
- Single bot instance
- SQLite database
- ~10 tx/minute capacity

### Production Scale:
- Multiple bot instances
- PostgreSQL cluster
- Redis caching
- ~1000 tx/minute capacity
- Gateway's round-robin handles load balancing

## Monitoring & Observability

### Real-time Metrics:
- Transaction success/failure rates
- Cost per transaction
- Gateway refund percentage
- Arbitrage opportunity count
- System health status

### Alerts (Future):
- Failed transaction threshold
- Low balance warning
- High latency detection
- Profitable opportunity alerts
