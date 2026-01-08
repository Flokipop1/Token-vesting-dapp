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
  
    // 2. Move halfway through the REMAINING duration (e.g., 90 days total)
    const halfwayTimestamp = start + (duration / 2n);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(halfwayTimestamp)]);
    await ethers.provider.send("evm_mine", []);
  
    await vesting.connect(alice).claim();
    const secondRelease = await token.balanceOf(alice.address);
    
    expect(secondRelease).to.be.gt(firstRelease);
    console.log("Total claim at 50% time:", ethers.formatUnits(secondRelease, 18));
  
    // 3. Move to the very end
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
    
        // 1. Move to 50% of the vesting duration
        const midTimestamp = start + (duration / 2n);
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(midTimestamp)]);
        await ethers.provider.send("evm_mine", []);
    
        // 2. Alice claims her tokens
        await vesting.connect(alice).claim();
        const aliceBalance = await token.balanceOf(alice.address);
        expect(aliceBalance).to.be.gt(0);
    
        // 3. Check Bob's state - his 'released' should still be 0
        const bobData = await vesting.beneficiaries(bob.address);
        expect(bobData.released).to.equal(0n);
    
        // 4. Bob claims and should get his own 50% correctly
        await vesting.connect(bob).claim();
        const bobBalance = await token.balanceOf(bob.address);
        
        // Bob should have ~25,000 (which is 50% of 50,000)
        // We use a small range check for precision
        const expectedBobBalance = bobAllocation / 2n;
        expect(bobBalance).to.be.closeTo(expectedBobBalance, ethers.parseUnits("1", 18));
      });
    
      it("Should allow owner to withdraw unused tokens but protect allocated ones", async function () {
        // Total allocated in beforeEach was 150,000 (Alice 100k + Bob 50k)
        // Total transferred to contract was 1,000,000
        // Unused should be 850,000
        
        const initialOwnerBalance = await token.balanceOf(owner.address);
        const expectedExcess = ethers.parseUnits("850000", 18);
    
        // 1. Owner withdraws the excess
        await vesting.withdrawUnused(owner.address);
        
        const finalOwnerBalance = await token.balanceOf(owner.address);
        expect(finalOwnerBalance - initialOwnerBalance).to.equal(expectedExcess);
    
        // 2. Contract should still have exactly 150,000 left for Alice and Bob
        const remainingContractBalance = await token.balanceOf(vesting.target);
        expect(remainingContractBalance).to.equal(ethers.parseUnits("150000", 18));
    
        // 3. Try to withdraw again - should fail because balance == totalAllocated
        await expect(vesting.withdrawUnused(owner.address)).to.be.revertedWith("No excess");
      });

});