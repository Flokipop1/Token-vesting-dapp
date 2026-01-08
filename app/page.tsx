"use client";
import { ConnectKitButton} from "connectkit";
import {  useCSVReader } from "react-papaparse";
import { useAccount } from "wagmi";
import { useState, useEffect } from "react";
import { VESTING_ADDRESS, VESTING_ABI, TOKEN_ADDRESS } from "../context/constants";
import { getContract } from "../utils/web3";
import { ethers } from "ethers";
import { setBlockGasLimit } from "viem/actions";
declare global {
  interface Window {
    ethereum: any;
  }
}

export default function Home() {
  const {address, isConnected } = useAccount();
  const { CSVReader } = useCSVReader();


  const downloadSampleCSV = () => {
  const csvContent = "data:text/csv;charset=utf-8," 
    + "0x742d35Cc6634C0532925a3b844Bc454e4438f44e,500\n"
    + "0x71C7656EC7ab88b098defB751B7401B5f6d8976F,1250\n"
    + "0x2db34057e0344d9f7832269c1186e246798e29a9,300";
    
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "investor_template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
  
  
  const [mounted, setMounted] = useState(false);
  const [csvBeneficiaries, setCsvBeneficiaries] = useState<any[]>([]);
  const [isBatching, setIsBatching] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [adminAddresses, setAdminAddresses] = useState("");
  const [status, setStatus] = useState("");
  const [startTime, setStartTime] = useState<number>(0);
  const [adminAmounts, setAdminAmounts] = useState("");
  const [balance, setBalance] = useState("0");
  const [vested, setVested] = useState("0");
  const [account, setAccount] = useState("");
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [isMenu0pen, setIsMenu0pen] = useState<boolean>(false);
  const [userAllocation, setUserAllocation] =  useState("0")
  const [stats, setStats] = useState({
    totalVested: "0",
    availableToClaim: "0",
    totalClaimed: "0",
    duration: "0 Days"
  });

  useEffect(() => {setMounted(true); }, []);

 // --- 1. LOADING SAVED DATA ON STARTUP ---
useEffect(() => {
  const savedData = localStorage.getItem('batch_data');
  if (savedData) {
    try {
      setCsvBeneficiaries(JSON.parse(savedData));
    } catch (e) {
      console.error("Failed to load saved batch data", e);
    }
  }
}, []);

// --- 2. SAVE DATA AUTOMATICALLY WHENEVER IT CHANGES ---
useEffect(() => {
  if (csvBeneficiaries.length > 0) {
    localStorage.setItem('batch_data', JSON.stringify(csvBeneficiaries));
  } else {
    localStorage.removeItem('batch_data');
  }
}, [csvBeneficiaries]); 
  
async function updateDashBoard(userAddress: string) {
  // 1. SAFETY GATE: Stop immediately if address is invalid or missing
  if (!userAddress || !ethers.isAddress(userAddress)) {
    console.warn("STEP 0: Invalid User Address. Skipping update.");
    return;
  }
  
  if (!VESTING_ADDRESS || !ethers.isAddress(VESTING_ADDRESS)) {
    console.error("STEP 0: Invalid VESTING_ADDRESS. Check your .env file.");
    return;
  }

  console.log("STEP 1: Starting update for", userAddress);

  try {
    
    const provider = new ethers.BrowserProvider((window as any).ethereum, 97);
    
    const contract = new ethers.Contract(VESTING_ADDRESS, VESTING_ABI, provider);
    const tokenContract = new ethers.Contract(
      TOKEN_ADDRESS, 
      ["function balanceOf(address) view returns(uint256)"], 
      provider
    );

  
    const ownerAddress = await contract.getFunction("owner").staticCall();
    const contractOwner = ethers.getAddress(ownerAddress); 

    // 4. Fetch all raw data from blockchain
    const [rawStart, vestedRaw, BeneficiaryData, totalHoldingsRaw, dur] = await Promise.all([
      contract.start(),
      contract.vestedAmount(userAddress),
      contract.beneficiaries(userAddress),
      tokenContract.balanceOf(VESTING_ADDRESS),
      contract.duration()
    ]);

    // 5. Format variables
    const readableVested = ethers.formatUnits(vestedRaw, 18);
    const readableTotalHoldings = ethers.formatUnits(totalHoldingsRaw, 18);
    const readableReleased = ethers.formatUnits(BeneficiaryData.released, 18);
    
    // 6. Math & Duration
    const Available = parseFloat(readableVested) - parseFloat(readableReleased);
    const days = Math.floor(Number(dur) / 86400);

    // 7. Update Admin Status
    setIsOwner(userAddress.toLowerCase() === contractOwner.toLowerCase());
    
    // 8. Update State for UI
    setStartTime(Number(rawStart));
    setStats({ 
      availableToClaim: Available > 0 ? Available.toFixed(3) : "0.000",
      totalClaimed: parseFloat(readableReleased).toFixed(2), 
      totalVested: !isNaN(parseFloat(readableTotalHoldings)) 
        ? parseFloat(readableTotalHoldings).toLocaleString() 
        : "0", 
      duration: `${days} Days`
    }); 

    setUserAllocation(ethers.formatUnits(BeneficiaryData.total, 18));
    console.log("STEP 5: Success! Dashboard fully updated.");

  } catch (err: any) {
    
    if (err.message?.includes("ENS")) {
      console.error("ENS ERROR DETECTED: Ensure VESTING_ADDRESS is a valid 0x address.");
    }
    console.error("CRITICAL ERROR AT DASHBOARD UPDATE:", err);
    setStatus("Error loading dashboard data.");
  }
}
console.log("Current Stats in UI:", stats);


// ---  ---
const handleClearCSV = () => {
  if (window.confirm("Are you sure you want to clear all batch data?")) {
    setCsvBeneficiaries([]);
    localStorage.removeItem('koncoin_batch_data');
    setBatchProgress(0);
    setStatus("Ready for new batch");
  }
};




const handleCSVUpload = (results: any) => {
  
  const formatted = results.data
    .filter((row: any) => row[0] && row[1]) 
    .map((row: any, index: number) => ({
      id: `${row[0].trim().toLowerCase()}-${index}`, 
      address: row[0].trim(),
      amount: row[1].trim(),
      status: 'pending'
    }));
  setCsvBeneficiaries(formatted);
  setStatus(`Loaded ${formatted.length} investors from CSV.`);
};


async function processBatchSync() {
  if (isBatching || csvBeneficiaries.length === 0) return;
  
  setIsBatching(true);
  const BATCH_SIZE = 1; 
  
  try {
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(VESTING_ADDRESS, VESTING_ABI, signer);

    
    const pendingList = csvBeneficiaries.filter(b => b.status !== 'success');
    const totalCount = csvBeneficiaries.length;

    if (pendingList.length === 0) {
      setBatchProgress(100);
      setStatus("All investors in this list are already synced! ✅");
      setIsBatching(false);
      return;
    }

    setStatus(`Resuming: ${pendingList.length} of ${totalCount} remaining...`);

    
   for (let i = 0; i < pendingList.length; i += BATCH_SIZE) {
  const currentBatch = pendingList.slice(i, i + BATCH_SIZE);
 
  const firstPerson = currentBatch[0];
  const originalIndex = csvBeneficiaries.findIndex(b => b.address === firstPerson.address);
  
 
  const realBatchNumber = Math.floor(originalIndex / BATCH_SIZE) + 1;


      
      const addrs = currentBatch.map(b => b.address);
      const amts = currentBatch.map(b => ethers.parseUnits(b.amount, 18));

      setStatus(`Processing Batch ${realBatchNumber}...`);
      
     
      
      const tx = await contract.addBeneficiaries(addrs, amts);
      await tx.wait();
      

     
     
      setCsvBeneficiaries(prev => {
        const updatedList = prev.map(originalItem => {
          const isMatch = currentBatch.find(batchItem => batchItem.id === originalItem.id);
          return isMatch ? { ...originalItem, status: 'success' } : originalItem;
        });

        
        const successCount = updatedList.filter(b => b.status === 'success').length;
        setBatchProgress(Math.round((successCount / totalCount) * 100));

        return updatedList;
      });
    }
    
    setStatus("Sync Resumed and Completed!");
    alert("Full Distribution Sync Complete!");
  } catch (err: any) {
    console.error(err);
    setStatus("Error: " + (err.reason || err.message));
  } finally {
    setIsBatching(false);
  }
}




  async function handleAddBeneficiaries() {

  const provider = new ethers.BrowserProvider((window as any).ethereum);
   const signer = await provider.getSigner();
    const contract = new ethers.Contract(VESTING_ADDRESS, VESTING_ABI, signer);
    console.log("requesting signature");

    
    try {
      const contract = await getContract(VESTING_ADDRESS, VESTING_ABI);

  
      
     
      const addrArray = adminAddresses.split(",").map(a => a.trim()).filter(a => a !== "");
      const amountArray = adminAmounts.split(",").map(a => ethers.parseUnits(a.trim(), 18));
      if (addrArray.length === 0) {
      setStatus("Error: Please enter at least one address.");
      return;
    }

   

      setStatus("Adding Beneficiaries...");
      const tx = await contract.addBeneficiaries(addrArray, amountArray);
      await tx.wait();
      setStatus("Transaction Pending: " + tx.hash.slice(0, 10) + "...");
      await tx.wait()
      setStatus("Successfully added beneficiaries!");
      alert("Success! Beneficiaries added to the blockchain.");
    } catch (err: any) {
      setStatus("Admin Error: " + (err.reason || err.message));
    }

    
  }

  
async function handleClaim() {
  try {
    setStatus("Connecting to wallet...");
    
    
    const provider = new ethers.BrowserProvider(window.ethereum);
    
   
    const signer = await provider.getSigner(); 
    
    setStatus("Confirming in MetaMask...");

   
    const contract = new ethers.Contract(VESTING_ADDRESS, VESTING_ABI, signer);
    
    
    const tx = await contract.claim({setBlockGasLimit: 200000});
    
    setStatus("Transaction Pending...");
    await tx.wait();
    
    setStatus("Success! Tokens Claimed.");
  } catch (err: any) {


    if (err.code === -32603) {
      setStatus("RPC Error: Try increasing gas or checking your balance.");
    } else {
      setStatus("Claim failed. See console.");
    }
  
    
    if (err.code === 4001) {
      setStatus("Transaction rejected by user.");
    } else {
      setStatus("Error: " + (err.reason || err.message));
    }
    console.error(err);
  }


  
}


  
useEffect(() => {
  const init = async () => {
    
    if (isConnected && address) {
      
      await updateDashBoard(address);
    }
  };
  init();
}, [address, isConnected]); 


function VestingCountdown({ targetTimestamp }:
  { targetTimestamp: Number}
) {
   const [timeLeft, setTimeLeft] = useState<string>("Calculating");

   useEffect(() => {
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const diff = Number(targetTimestamp) - now;

      if (diff <= 0) {
        setTimeLeft("Vesting Started!");
        clearInterval(interval);
        return;
      }

      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    }, 1000);

    return () => clearInterval(interval);
  }, [targetTimestamp]);

  return (
    <div className="text-sm font-mono text-blue-400 mt-2">
       Starts in: <span className="text-white">{timeLeft}</span>
    </div>
  );

}



async function handleWithdrawUnused() {
  try {
    // 1. Setup Provider and Signer
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    
    // 2. Initialize Contract (Ensure VESTING_ADDR and ABI are imported)
    const contract = new ethers.Contract(VESTING_ADDRESS, VESTING_ABI, signer);
    
    // 3. Get Admin Address to send tokens to
    const adminAddress = await signer.getAddress();
    
    console.log("Withdrawing excess tokens to:", adminAddress);

    // 4. Call the Smart Contract function
    const tx = await contract.withdrawUnused(adminAddress);
    
    // 5. Wait for confirmation
    await tx.wait();
    alert("Success! Unused tokens have been sent to your wallet.");
    
  } catch (err: any) {
    console.error("Withdrawal failed:", err);
    
    // Friendly error message for "No excess" check in your Solidity code
    if (err.message.includes("No excess")) {
      alert("Error: There are no extra tokens in the contract to withdraw.");
    } else {
      alert("Transaction failed. Check console for details.");
    }
  }
}


const totalTokensToDistribute = csvBeneficiaries.reduce((sum, b) => {
  return sum + (parseFloat(b.amount) || 0);
}, 0);

return (
  <main className="min-h-screen bg-[#0f172a] text-white font-sans selection:bg-cyan-500/30">
    {/* --- NAVBAR --- */}
    <nav className="w-full p-5 flex justify-between items-center border-b border-white/5 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center font-black text-slate-900">K</div>
        <span className="text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">KONCOIN</span>
      </div>
      <ConnectKitButton showBalance={true} />
    </nav>

    <div className="max-w-6xl mx-auto px-6 py-12">
      {!mounted ? (
        /* --- 1. INITIAL LOADING STATE --- */
        <div className="py-20 text-center flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">Initializing Secure Gateway...</p>
        </div>
      ) : !isConnected ? (
        /* --- 2. PUBLIC VIEW --- */
        <div className="py-20 text-center">
          <h1 className="text-7xl font-black mb-6 tracking-tight leading-none text-white">
            Unlock your <br/><span className="text-cyan-400">future value.</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-lg mx-auto leading-relaxed">
            The premier destination for secure token distributions and investor vesting management.
          </p>
        </div>
      ) : (
        /* --- 3. DASHBOARD VIEW --- */
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-start">

          {/* --- LEFT COLUMN --- */}
          <div className={isOwner ? "md:col-span-7 space-y-8" : "md:col-span-12 max-w-3xl mx-auto space-y-8 w-full"}>
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-[2.5rem] p-10 border border-white/5 shadow-2xl relative overflow-hidden group">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl group-hover:bg-cyan-500/20 transition-all duration-700"></div>
              <h2 className="text-3xl font-bold mb-2 text-white">Claim Portal</h2>
              <p className="text-slate-400 mb-8 font-medium italic">Tokens release linearly over the duration.</p>
              <button onClick={handleClaim} className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-900 py-5 rounded-2xl font-black text-xl transition-all hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] active:scale-95 cursor-pointer">
                Release Vested Tokens
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
              <div className="bg-slate-900/50 backdrop-blur-md p-8 rounded-[2rem] border border-white/5 shadow-xl">
                <p className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.3em] mb-3">Total Contract Holdings</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-mono font-bold text-white">{stats.totalVested}</span>
                  <span className="text-xs font-bold text-slate-500 font-sans">VST</span>
                </div>
              </div>
              <div className="bg-slate-900/50 backdrop-blur-md p-8 rounded-[2rem] border border-white/5 shadow-xl">
                <p className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.3em] mb-3">Vesting Duration</p>
                <p className="text-3xl font-mono font-bold text-white">{stats.duration}</p>
              </div>
            </div>

            {(userAllocation !== "0" && userAllocation !== "0.0") && (
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[2rem] border border-cyan-500/20 shadow-2xl relative overflow-hidden w-full">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest mb-1">Personal Allocation</h3>
                    <p className="text-slate-400 text-xs">Wallet Specific Data</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Available to claim</p>
                    <p className="text-3xl font-mono font-bold text-white">{stats.availableToClaim}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Claimed</p>
                    <p className="text-3xl font-mono font-bold text-white">{stats.totalClaimed}</p>
                  </div>
                </div>

                <div className="p-4 border border-white/5 bg-slate-950/30 rounded-2xl mb-4">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Vesting Status</h3>
                  {startTime === 0 ? (
                    <p className="text-xs text-slate-500 italic">Loading contract data...</p>
                  ) : startTime > Math.floor(Date.now() / 1000) ? (
                    <VestingCountdown targetTimestamp={startTime} />
                  ) : (
                    <p className="text-cyan-400 font-bold text-sm">Vesting is Active</p>
                  )}
                </div>
                <div className="pt-6 border-t border-white/5 text-slate-400 text-xs">
                  Your Total Allocation: <span className="text-white font-bold">{userAllocation} Tokens</span>
                </div>
              </div>
            )}
          </div>

          {/* --- RIGHT COLUMN (ADMIN ONLY) --- */}
          {isOwner && (
            <div className="md:col-span-5">
              <div className="bg-white/5 backdrop-blur-sm rounded-[2.5rem] p-8 border border-white/10 sticky top-32">
                <div className="flex justify-between items-center mb-8">
                  <div className="px-3 py-1 bg-cyan-500/10 text-cyan-400 text-[10px] font-black rounded-full border border-cyan-500/20 uppercase tracking-widest">Admin Control</div>
                  {csvBeneficiaries.length > 0 && (
                    <button onClick={handleClearCSV} className="text-[10px] text-red-400 font-bold uppercase hover:underline cursor-pointer">Clear CSV</button>
                  )}
                </div>

                <div className="space-y-6">
                  {/* MANUAL ENTRY */}
                  <div className="p-4 bg-slate-900/40 rounded-2xl border border-white/5 space-y-4">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Manual Entry</p>
                    <textarea 
                      placeholder="0x123..., 0x456..." 
                      className="w-full bg-slate-950/50 p-4 rounded-xl border border-white/5 text-xs font-mono focus:border-cyan-500/50 outline-none text-white" 
                      rows={2} 
                      onChange={(e) => setAdminAddresses(e.target.value)}
                    />
                    <input 
                      placeholder="Amounts: 500, 1000" 
                      className="w-full bg-slate-950/50 p-4 rounded-xl border border-white/5 text-xs font-mono focus:border-cyan-500/50 outline-none text-white" 
                      onChange={(e) => setAdminAmounts(e.target.value)}
                    />
                    <button onClick={handleAddBeneficiaries} className="w-full bg-slate-800 hover:bg-slate-700 py-3 rounded-xl font-bold text-white text-xs transition-all">
                      Distribute Manual
                    </button>
                  </div>

                  <div className="relative py-2 text-center">
                    <span className="bg-[#0f172a] px-4 text-[10px] text-slate-600 font-bold uppercase tracking-widest relative z-10">OR</span>
                    <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/5"></div>
                  </div>

                  {/* CSV UPLOADER */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-end mb-2 ml-2">
                      <p className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">Bulk CSV Format</p>
                      <button onClick={downloadSampleCSV} className="text-[9px] font-bold text-slate-500 hover:text-cyan-400 uppercase tracking-tighter transition-colors cursor-pointer">
                        [ Download Template ]
                      </button>
                    </div>

                    <CSVReader onUploadAccepted={handleCSVUpload}>
                      {({ getRootProps, acceptedFile }: any) => (
                        <div {...getRootProps()} className="border-2 border-dashed border-white/10 p-6 rounded-2xl text-center cursor-pointer hover:border-cyan-500/40 transition-all bg-slate-950/20 group">
                          {acceptedFile ? (
                            <p className="text-cyan-400 font-bold text-xs">{acceptedFile.name} Loaded</p>
                          ) : (
                            <p className="text-slate-500 text-xs font-medium">Drop CSV (Address, Amount)</p>
                          )}
                        </div>
                      )}
                    </CSVReader>

                    {csvBeneficiaries.length > 0 && (
                      <div className="space-y-4">
                        {/* STATUS BOX */}
                        <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5">
                          <div className="flex justify-between items-end mb-2 px-1">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Sync Progress</span>
                              <span className="text-xs font-black text-cyan-400">
                                {csvBeneficiaries.filter(b => b.status === 'success').length} / {csvBeneficiaries.length} Synced
                              </span>
                            </div>
                            <span className="text-xs font-black text-cyan-400">{batchProgress}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-cyan-500 transition-all duration-500 shadow-[0_0_10px_rgba(6,182,212,0.4)]"
                              style={{ width: `${batchProgress}%` }}
                            />
                          </div>
                        </div>

                        {/* PREVIEW TABLE */}
                        <div className="max-h-40 overflow-y-auto bg-slate-950/50 rounded-xl border border-white/5 custom-scrollbar">
                          <table className="w-full text-left text-[10px]">
                            <tbody className="divide-y divide-white/5">
                              {csvBeneficiaries.map((b) => (
                                <tr key={b.id}>
                                  <td className="p-2 font-mono text-slate-400">{b.address.slice(0,6)}...{b.address.slice(-4)}</td>
                                  <td className="p-2 font-bold text-white">{b.amount}</td>
                                  <td className="p-2 text-right">{b.status === 'success' ? "✅" : "⏳"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <button 
                          onClick={processBatchSync} 
                          disabled={isBatching}
                          className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 py-4 rounded-2xl font-black text-slate-900 transition-all shadow-lg shadow-cyan-500/20 active:scale-95 cursor-pointer"
                        >

                        {/* TOTAL SUMMARY BOX - FIXED COLORS */}
<div className="p-5 bg-slate-950/60 rounded-[2rem] border border-cyan-500/30 mb-6 shadow-inner">
  <div className="flex justify-between items-start">
    <div className="space-y-1">
      <p className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.2em]">Total Distribution</p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-mono font-bold text-white">
          {totalTokensToDistribute.toLocaleString()}
        </span>
        <span className="text-[10px] font-bold text-slate-500 uppercase">VST</span>
      </div>
    </div>
    
    <div className="text-right space-y-1">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Investors</p>
      <p className="text-2xl font-mono font-bold text-white">
        {csvBeneficiaries.length}
      </p>
    </div>
  </div>
  
  {/* Status Footer */}
  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>
      <p className="text-[9px] text-slate-400 font-medium">Ready for Blockchain Sync</p>
    </div>
    <p className="text-[9px] text-cyan-500/70 font-bold uppercase">Verified</p>
  </div>
</div> 

                          {isBatching ? `PROCESSING BATCH...` : `START SYNCING`}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* EMERGENCY SECTION */}
                  <div className="pt-6 border-t border-white/5">
                    <div className="p-4 bg-slate-950/50 rounded-2xl border border-amber-500/10">
                      <h3 className="text-amber-500 font-bold text-[10px] uppercase tracking-widest mb-1">Emergency & Recovery</h3>
                      <button onClick={handleWithdrawUnused} className="w-full py-3 bg-amber-600/10 hover:bg-amber-600 text-amber-500 hover:text-white border border-amber-600/20 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer">
                        Claim Unused Tokens
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FOOTER */}
      <footer className="mt-20 pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-600">
        <div className="flex items-center gap-4 text-[11px] font-bold tracking-[0.2em] uppercase">
          <span>BSC Testnet</span>
          <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
          <span>Status: <span className="text-cyan-500">{status || "Ready"}</span></span>
        </div>
      </footer>
    </div>
  </main>
);
}