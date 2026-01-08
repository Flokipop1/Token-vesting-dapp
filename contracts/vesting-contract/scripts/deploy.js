const { ethers, run, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying to ${network.name} with: ${deployer.address}`);

  // 1. Existing Token Address
  const tokenAddress = "0x9cDe9AAcF58221E922CcA771b23287aB8B3DAa85";

  // 2. Timing
  const block = await ethers.provider.getBlock("latest");
  const start = block.timestamp + 3600; // 10m from now is usually enough
  const cliff = 0; 
  const total = 7200; // 1 hour


  console.log("--- Deployment Info ---");
  console.log(`Token: ${tokenAddress}`);
  console.log(`Start: ${start}, Cliff: ${cliff}, Total: ${total}`);

  // 3. Vesting Deployment
  const Vesting = await ethers.getContractFactory("Vesting");
  const vesting = await Vesting.deploy(tokenAddress, start, cliff, total);
  
  console.log("Waiting for deployment...");
  await vesting.waitForDeployment();
  
  // Use getAddress() for the most reliable string format
  const vestingAddress = await vesting.getAddress();
  console.log(`Vesting deployed to: ${vestingAddress}`);

  // 4. Verification
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("Waiting for block confirmations & Etherscan indexing...");
    
    // FIX: deploymentTransaction is a function in v6
    await vesting.deploymentTransaction().wait(6);

    // Extra 15-second cushion for Etherscan indexing
    await new Promise(resolve => setTimeout(resolve, 15000));

    try {
      await run("verify:verify", {
        address: vestingAddress,
        constructorArguments: [tokenAddress, start, cliff, total],
      });
      console.log("Contract verified successfully! ✅");
    } catch (e) {
      if (e.message.toLowerCase().includes("already verified")) {
        console.log("Contract is already verified.");
      } else {
        console.log("Verification error:", e.message);
      }
    }
  }
}

main().catch(console.error);