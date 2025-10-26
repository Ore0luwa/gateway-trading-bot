#!/bin/bash

if [ "$1" = "mainnet" ]; then
    echo "🌐 Switching to MAINNET..."
    cp .env.mainnet .env
    echo "✅ Now using MAINNET config"
    echo "⚠️  CAUTION: Real funds will be used!"
elif [ "$1" = "devnet" ]; then
    echo "🔧 Switching to DEVNET..."
    cp .env.devnet .env
    echo "✅ Now using DEVNET config"
else
    echo "Usage: ./switch-network.sh [mainnet|devnet]"
fi
