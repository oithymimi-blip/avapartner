import hre from "hardhat";

async function main() {
  console.log("Starting deployment...");

  // 1. Deploy the Forwarder logic contract
  console.log("Deploying Forwarder Implementation...");
  const Forwarder = await hre.ethers.getContractFactory("Forwarder");
  const forwarderImpl = await Forwarder.deploy();
  await forwarderImpl.waitForDeployment();
  const forwarderImplAddress = await forwarderImpl.getAddress();
  console.log(`Forwarder implementation deployed to: ${forwarderImplAddress}`);

  // 2. Deploy the Factory
  console.log("Deploying ForwarderFactory...");
  const ForwarderFactory = await hre.ethers.getContractFactory("ForwarderFactory");
  const factory = await ForwarderFactory.deploy(forwarderImplAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`ForwarderFactory deployed to: ${factoryAddress}`);

  console.log("Deployment complete!");
  console.log("--------------------------------------------------");
  console.log(`Save this address for your backend:`);
  console.log(`FACTORY_ADDRESS=${factoryAddress}`);
  console.log("--------------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
