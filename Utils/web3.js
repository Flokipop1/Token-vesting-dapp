import { ethers } from "ethers";

export const getContract = async (address, abi) => {
  if (!window.ethereum) throw new Error("Please install MetaMask");
  
  // 1. Connect to the browser's provider (MetaMask)
  const provider = new ethers.BrowserProvider(window.ethereum);
  
  // 2. Get the 'Signer' (the person clicking the button)
  const signer = await provider.getSigner();
  
  // 3. Return a live contract object we can call functions on
  return new ethers.Contract(address, abi, signer);
};