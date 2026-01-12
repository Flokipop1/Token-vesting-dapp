export const VESTING_ADDRESS = "0xf52eD88F70cc6c3A7b59ed114710403bEA8A5995";
export const TOKEN_ADDRESS = "0x9cDe9AAcF58221E922CcA771b23287aB8B3DAa85";


export const VESTING_ABI = [
  "function claim() external",
  "function token() public view returns (address)",
  "function start() public view returns (uint256)",
  "function withdrawUnused(address to) external",
  "function cliff() public view returns (uint256)",
  "function duration() public view returns (uint256)",
  "function totalAllocated() public view returns (uint256)",
  "function owner() public view returns (address)",
  "function addBeneficiaries(address[] _beneficiaries, uint256[] _amounts) external",
  "function vestedAmount(address account) public view returns (uint256)",
  "function beneficiaries(address) public view returns (uint256 total, uint256 released)"
];