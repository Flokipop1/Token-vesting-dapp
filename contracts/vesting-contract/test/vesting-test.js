const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Vesting Contract", function () {
  let token, vesting;
  let owner, alice, bob;
  const totalVested = ethers.parseUnits("1000000", 18);  // tokens to be sent to vesting contract

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    // Deploy TestToken
    const TestToken = await ethers.getContractFactory("TestToken");
    token = await TestToken.deploy("MyToken", "MTK", ethers.parseUnits("1000000", 18));
    await token.waitForDeployment();

    // Deploy Vesting contract
    const Vesting = await ethers.getContractFactory("Vesting");
    const block =  await ethers.provider.getBlock("latest");
    const now = BigInt(block.timestamp);
    const start = now + 24n * 60n * 60n; 
    const cliff = 30n * 24n * 60n * 60n; // 30 days
    const duration = 180n * 24n * 60n * 60n; // 180 days
    vesting = await Vesting.deploy(token.target, start, cliff, duration);
    await vesting.waitForDeployment();

    // add test Alice as beneficiary
   await vesting.addBeneficiaries([alice.address, bob.address], [ethers.parseUnits("100000", 18), ethers.parseUnits("50000", 18)] );


    // Transfer tokens to vesting contract
    await token.transfer(vesting.target, ethers.parseUnits("1000000", 18));

    
  });


  it("Vesting contract should have correct token balance", async function () {
    const balance = await token.balanceOf(vesting.target);
    expect(balance).to.equal(totalVested);
  });

  it("Cannot release tokens before cliff", async function () {
    await expect(vesting.connect(alice).claim()).to.be.revertedWith("Nothing to claim");
  });

  it("Can release tokens gradually after cliff", async function () {
    const start = await vesting.start();
    const cliff = await vesting.cliff();

    const halfway = start + cliff + 10n

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(halfway)]);
    await ethers.provider.send("evm_mine", []);

    await vesting.connect(alice).claim();
    const aliceBalance = await token.balanceOf(alice.address);

    expect(aliceBalance).to.be.gt(0);
    expect(aliceBalance).to.be.lt(totalVested);
  });

  it("Releasing multiple times accumulates correctly", async function () {
    const start = await vesting.start();     // Absolute timestamp
    const duration = await vesting.duration(); // Duration in seconds
    const aliceAllocation = ethers.parseUnits("100000", 18);
  
    // 1. Move to exactly the CLIFF (30 days in)
    // At 30 days / 180 days, Alice should have ~16.6% of her tokens
    const cliffTimestamp = await vesting.cliff(); 
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(cliffTimestamp) + 1]);
    await ethers.provider.send("evm_mine", []);
  
    await vesting.connect(alice).claim();
    const firstRelease = await token.balanceOf(alice.address);
    
    // Verification: Alice should have more than 0 but much less than 100k
    expect(firstRelease).to.be.gt(0);
    expect(firstRelease).to.be.lt(aliceAllocation);
    console.log("First claim at cliff:", ethers.formatUnits(firstRelease, 18));
  
    
    const halfwayTimestamp = start + (duration / 2n);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(halfwayTimestamp)]);
    await ethers.provider.send("evm_mine", []);
  
    await vesting.connect(alice).claim();
    const secondRelease = await token.balanceOf(alice.address);
    
    expect(secondRelease).to.be.gt(firstRelease);
    console.log("Total claim at 50% time:", ethers.formatUnits(secondRelease, 18));
  
    
    const endTimestamp = start + duration;
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(endTimestamp)]);
    await ethers.provider.send("evm_mine", []);
  
    await vesting.connect(alice).claim();
    const finalBalance = await token.balanceOf(alice.address);
    expect(finalBalance).to.equal(aliceAllocation);
  });

  it("Cannot release more than total allocated tokens", async function () {
    const start = await vesting.start();
    const duration = await vesting.duration();

    const releaseToken = start + duration + 10n

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(releaseToken)]);
    await ethers.provider.send("evm_mine", []);

    await  vesting.connect(alice).claim()
    await expect(vesting.connect(alice).claim()).to.be.revertedWith("Nothing to claim");

     });

     it("The Bob Factor: Alice claiming should not affect Bob", async function () {
        const start = await vesting.start();
        const duration = await vesting.duration();
        const bobAllocation = ethers.parseUnits("50000", 18);
    
        
        const midTimestamp = start + (duration / 2n);
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(midTimestamp)]);
        await ethers.provider.send("evm_mine", []);
    
        
        await vesting.connect(alice).claim();
        const aliceBalance = await token.balanceOf(alice.address);
        expect(aliceBalance).to.be.gt(0);
    
       
        const bobData = await vesting.beneficiaries(bob.address);
        expect(bobData.released).to.equal(0n);
    
       
        await vesting.connect(bob).claim();
        const bobBalance = await token.balanceOf(bob.address);
        
        
        const expectedBobBalance = bobAllocation / 2n;
        expect(bobBalance).to.be.closeTo(expectedBobBalance, ethers.parseUnits("1", 18));
      });
    
      it("Should allow owner to withdraw unused tokens but protect allocated ones", async function () {
        
        
        const initialOwnerBalance = await token.balanceOf(owner.address);
        const expectedExcess = ethers.parseUnits("850000", 18);
    
        
        await vesting.withdrawUnused(owner.address);
        
        const finalOwnerBalance = await token.balanceOf(owner.address);
        expect(finalOwnerBalance - initialOwnerBalance).to.equal(expectedExcess);
    
        
        const remainingContractBalance = await token.balanceOf(vesting.target);
        expect(remainingContractBalance).to.equal(ethers.parseUnits("150000", 18));
    
       
        await expect(vesting.withdrawUnused(owner.address)).to.be.revertedWith("No excess");
      });

});