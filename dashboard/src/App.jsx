import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Activity, TrendingUp, DollarSign, Zap } from 'lucide-react'

function App() {
  const [stats, setStats] = useState({
    totalTransactions: 0,
    successfulTransactions: 0,
    successRate: 0,
    totalCost: 0,
    gatewaySavings: 0,
    isRunning: false,
    network: 'devnet'
  })
  const [transactions, setTransactions] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchStats()
    fetchTransactions()
    const interval = setInterval(() => {
      fetchStats()
      fetchTransactions()
    }, 5000)
    return () => clearInterval(interval)
  }, [])




const fetchStats = async () => {
  try {
    const response = await axios.get('http://localhost:3001/api/stats')
    console.log('📊 Stats received:', response.data) 
    console.log('🌐 Network:', response.data.network) 
    setStats(response.data)
    setIsLoading(false)
  } catch (error) {
    console.error('Error fetching stats:', error)
  }
}




  const fetchTransactions = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/transactions?limit=10')
      setTransactions(response.data)
    } catch (error) {
      console.error('Error fetching transactions:', error)
    }
  }

  const startBot = async () => {
    try {
      await axios.post('http://localhost:3001/api/bot/start')
      fetchStats()
    } catch (error) {
      alert('Error starting bot: ' + error.response?.data?.error)
    }
  }

  const stopBot = async () => {
    try {
      await axios.post('http://localhost:3001/api/bot/stop')
      fetchStats()
    } catch (error) {
      alert('Error stopping bot: ' + error.response?.data?.error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Gateway Trading Bot
            </h1>
            <p className="text-gray-400">High-Frequency Arbitrage with Sanctum Gateway</p>
          </div>
          <div className="flex items-center gap-4">
            <span className={`text-sm font-semibold uppercase ${
  stats.network === 'mainnet-beta' ? 'text-red-500 bg-red-500/10 px-3 py-1 rounded border border-red-500' : 'text-gray-400'
}`}>
  {stats.network === 'mainnet-beta' ? '⚠️ MAINNET' : 'Devnet'}
</span>


            <button
              onClick={stats.isRunning ? stopBot : startBot}
              className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                stats.isRunning 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {stats.isRunning ? 'Stop Bot' : 'Start Bot'}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Total Transactions</span>
              <Activity className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-3xl font-bold">{stats.totalTransactions}</div>
            <div className="text-sm text-green-400 mt-1">
              {stats.successRate.toFixed(1)}% success rate
            </div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Successful</span>
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <div className="text-3xl font-bold">{stats.successfulTransactions}</div>
            <div className="text-sm text-gray-400 mt-1">Confirmed on-chain</div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Total Cost</span>
              <DollarSign className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="text-3xl font-bold">{stats.totalCost.toFixed(4)} SOL</div>
            <div className="text-sm text-gray-400 mt-1">Transaction fees</div>
          </div>

          <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 backdrop-blur border border-green-500/50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-300 text-sm">Gateway Savings</span>
              <Zap className="w-5 h-5 text-green-400" />
            </div>
            <div className="text-3xl font-bold text-green-400">
              {stats.gatewaySavings.toFixed(4)} SOL
            </div>
            <div className="text-sm text-green-300 mt-1">Jito refunds</div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>
          
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No transactions yet. Start the bot to begin trading.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                    <th className="pb-3">Time</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Method</th>
                    <th className="pb-3">Cost</th>
                    <th className="pb-3">Refunded</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-3 text-sm text-gray-400">
                        {new Date(tx.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-3">
                        <span className={`text-xs px-2 py-1 rounded ${
                          tx.status === 'success' ? 'bg-green-600/20 text-green-400' :
                          tx.status === 'failed' ? 'bg-red-600/20 text-red-400' :
                          'bg-yellow-600/20 text-yellow-400'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 text-sm">{tx.method || 'N/A'}</td>
                      <td className="py-3 text-sm">{tx.cost_sol?.toFixed(6) || '0'} SOL</td>
                      <td className="py-3">
                        {tx.refunded ? (
                          <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded">
                            ✓ Yes
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Status Indicator */}
        {stats.isRunning && (
          <div className="mt-6 bg-green-600/20 border border-green-500/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              <span className="text-green-400 font-semibold">Bot is running - Scanning for arbitrage opportunities...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
