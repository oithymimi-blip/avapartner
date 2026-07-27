export const FACTORY_ABI = [
  "function createForwarder(uint256 _userId, address _hotWallet) external returns (address clone)",
  "event ForwarderCreated(address indexed forwarderAddress, uint256 indexed userId)"
];

export const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function decimals() view returns (uint8)"
];

export const FORWARDER_ABI = [
  "event Flushed(address indexed token, uint256 amount)",
  "event Deposited(address indexed sender, uint256 amount)",
  "function flushBNB() external",
  "function flushToken(address _token) external"
];
