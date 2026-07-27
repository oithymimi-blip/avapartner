import hre from "hardhat";

async function main() {
  const address = "0xAbe263021f5423D527C78Fc62C071e301107E474";
  const Forwarder = await hre.ethers.getContractAt("Forwarder", address);
  
  const hotWallet = await Forwarder.hotWallet();
  const owner = await Forwarder.owner();

  console.log("hotWallet:", hotWallet);
  console.log("owner:", owner);
}

main().catch(console.error);
