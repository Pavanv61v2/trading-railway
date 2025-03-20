// TradingView to Bybit Trading Bridge with direct connection
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Create Express server
const app = express();
app.use(bodyParser.json());

// Bybit API keys
const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;
const USE_TESTNET = process.env.USE_TESTNET === 'true';

// Bybit API base URLs
const BASE_URL = USE_TESTNET 
  ? 'https://api-testnet.bybit.com' 
  : 'https://api.bybit.com';

// Webhook endpoint that TradingView will call
app.post('/webhook', async (req, res) => {
  try {
    console.log('Received webhook from TradingView:', req.body);

    // Parse the TradingView alert data
    const { 
      symbol, 
      action, // 'buy' or 'sell'
      quantity, 
      price = null, // Optional: For limit orders
      takeProfit = null, 
      stopLoss = null,
      orderType = 'Market' // Default to market order
    } = req.body;

    console.log(`Processing alert: ${action} ${quantity} ${symbol}`);

    // Format symbol for Bybit (TradingView often uses different formats)
    const bybitSymbol = formatSymbolForBybit(symbol);
    
    // Create order parameters
    const side = action.toLowerCase() === 'buy' ? 'Buy' : 'Sell';
    const orderParams = {
      category: 'spot',
      symbol: bybitSymbol,
      side: side,
      orderType: orderType.charAt(0).toUpperCase() + orderType.slice(1).toLowerCase(), // Capitalize first letter
      qty: quantity.toString(),
      timeInForce: 'GTC'
    };
    
    // Add price for limit orders
    if (orderType.toLowerCase() === 'limit' && price) {
      orderParams.price = price.toString();
    }

    // Execute the trade on Bybit
    console.log('Placing order with params:', orderParams);
    const orderResult = await placeOrder(orderParams);
    
    // Log and return the result
    console.log('Order result:', orderResult);
    res.status(200).json({
      success: orderResult.retCode === 0,
      message: orderResult.retMsg,
      data: orderResult.result
    });
  } catch (error) {
    console.error('Error processing webhook:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
    res.status(500).json({
      success: false,
      message: 'Error processing trade',
      error: error.message
    });
  }
});

// Root path handler to confirm the server is running
app.get('/', (req, res) => {
  res.send('TradingView-Bybit bridge is running! Send webhooks to the /webhook endpoint.');
});

// Test endpoint to verify Bybit API connectivity
app.get('/test-connection', async (req, res) => {
  try {
    // Try to fetch Bybit server time
    const response = await axios.get(`${BASE_URL}/v5/market/time`);
    res.json({
      status: 'success',
      message: 'Connected to Bybit API successfully',
      data: response.data
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to connect to Bybit API',
      error: error.message
    });
  }
});

// Helper function to place an order using Bybit v5 API
async function placeOrder(params) {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  
  // Create signature
  const queryString = createSignature(timestamp, recvWindow, params);
  
  try {
    // Make a direct request to Bybit
    const response = await axios({
      method: 'POST',
      url: `${BASE_URL}/v5/order/create`,
      headers: {
        'X-BAPI-API-KEY': API_KEY,
        'X-BAPI-SIGN': queryString.signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'Content-Type': 'application/json'
      },
      data: params,
      timeout: 10000 // 10 second timeout
    });
    
    return response.data;
  } catch (error) {
    console.error('Error placing order:', error.message);
    throw error;
  }
}

// Helper function to create signature for Bybit API
function createSignature(timestamp, recvWindow, params) {
  const paramsString = JSON.stringify(params);
  const signaturePayload = timestamp + API_KEY + recvWindow + paramsString;
  const signature = crypto
    .createHmac('sha256', API_SECRET)
    .update(signaturePayload)
    .digest('hex');
    
  return {
    signature
  };
}

// Helper function to format TradingView symbols for Bybit
function formatSymbolForBybit(tvSymbol) {
  // Common format conversion examples:
  // BTCUSD -> BTCUSDT
  // BTC/USD -> BTCUSDT
  // Handle common symbol format differences
  let symbol = tvSymbol.replace('/', '').toUpperCase();
  
  // Add USDT suffix if needed (common for crypto)
  if (symbol.endsWith('USD') && !symbol.endsWith('USDT')) {
    symbol = symbol.replace('USD', 'USDT');
  }
  
  return symbol;
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TradingView-Bybit bridge running on port ${PORT}`);
});
