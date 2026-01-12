# Token-vesting-dapp
A production-ready Token Vesting Dashboard featuring batch beneficiary syncing, gas-optimized smart contract interactions, and a real-time investor claim portal. Built with Next.js 15, Ethers.js v6, and Tailwind CSS

#  Professional Web3 Token Vesting Dashboard

A high-performance, gas-optimized decentralized application (dApp) for managing token distributions. This project features a dual-interface for both contract administrators (Founders) and investors (Beneficiaries).

## 🛠 Tech Stack
- Frontend: Next.js 15 (App Router), Tailwind CSS
- Blockchain: Ethers.js v6
- Smart Contracts: Solidity (Vesting & ERC20)
- Network: Binance Smart Chain (BSC) Testnet/mainnet

## ✨ Key Features
- Smart Batch Syncing: Handles large-scale beneficiary uploads (100+ addresses) in optimized batches to prevent gas limit errors.
- State-Aware Resumption: Logic to detect partially completed syncs, allowing users to resume from the last successful batch.
- Real-Time Claim Portal: Dynamic calculation of vested vs. releasable tokens based on contract start time and duration.
- Role-Based UI: Automatic detection of the 'Owner' wallet to unlock administrative tools and contract management panels.
- Provider Stability: Built-in handling for RPC timeouts and network switching.

##  Live Testnet Demo
https://vestflow.netlify.app/

## 🛡 Security & Optimization
- Human-Readable ABIs: Improved maintainability and smaller bundle size.
- Parallel Data Fetching: Utilizes Promise.all for sub-1-second dashboard updates.
- Gas Awareness: Batch sizes are adjustable to ensure compatibility with various EVM network gas limits.

## 📦 Installation & Setup
1. Clone the repository: git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
2. Install dependencies: npm install
3. Create a .env file with the following keys:
   - NEXT_PUBLIC_VESTING_ADDRESS
   - NEXT_PUBLIC_TOKEN_ADDRESS
4. Run the development server: npm run dev
