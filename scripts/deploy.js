// scripts/deploy.js
// Déploiement de tous les smart contracts sur Polygon (Mumbai testnet)
//
// Commandes :
//   npx hardhat run scripts/deploy.js --network mumbai
//   npx hardhat run scripts/deploy.js --network polygon  (mainnet)

const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=================================================");
  console.log("🚀 DÉPLOIEMENT DataMarketplace");
  console.log("=================================================");
  console.log(`Déployeur: ${deployer.address}`);
  console.log(`Balance:   ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} MATIC`);
  console.log("-------------------------------------------------\n");

  // ----------------------------------------------------------------
  // 1. Déploiement DataToken (ERC-20 DTK)
  // ----------------------------------------------------------------
  console.log("📦 1/3 - Déploiement DataToken (DTK)...");
  const DataToken = await ethers.getContractFactory("DataToken");
  const token     = await DataToken.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`   ✅ DataToken déployé: ${tokenAddress}\n`);

  // ----------------------------------------------------------------
  // 2. Déploiement RewardDistributor
  // ----------------------------------------------------------------
  console.log("📦 2/3 - Déploiement RewardDistributor...");
  const RewardDistributor = await ethers.getContractFactory("RewardDistributor");
  const rewardDist        = await RewardDistributor.deploy(tokenAddress);
  await rewardDist.waitForDeployment();
  const rewardDistAddress = await rewardDist.getAddress();
  console.log(`   ✅ RewardDistributor déployé: ${rewardDistAddress}\n`);

  // ----------------------------------------------------------------
  // 3. Déploiement DatasetRegistry
  // ----------------------------------------------------------------
  console.log("📦 3/3 - Déploiement DatasetRegistry...");
  const DatasetRegistry = await ethers.getContractFactory("DatasetRegistry");
  const registry        = await DatasetRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`   ✅ DatasetRegistry déployé: ${registryAddress}\n`);

  // ----------------------------------------------------------------
  // 4. Configuration des permissions
  // ----------------------------------------------------------------
  console.log("⚙️  Configuration des permissions...");

  // Le RewardDistributor doit pouvoir minter des tokens
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  await token.grantRole(MINTER_ROLE, rewardDistAddress);
  console.log("   ✅ MINTER_ROLE accordé à RewardDistributor");

  // Lier le registry au reward distributor
  await rewardDist.setRegistryContract(registryAddress);
  console.log("   ✅ DatasetRegistry lié au RewardDistributor\n");

  // ----------------------------------------------------------------
  // 5. Sauvegarde des adresses déployées
  // ----------------------------------------------------------------
  const deploymentInfo = {
    network:          (await deployer.provider.getNetwork()).name,
    chainId:          (await deployer.provider.getNetwork()).chainId.toString(),
    deployer:         deployer.address,
    timestamp:        new Date().toISOString(),
    contracts: {
      DataToken:        tokenAddress,
      RewardDistributor: rewardDistAddress,
      DatasetRegistry:   registryAddress,
    }
  };

  fs.writeFileSync(
    "deployment.json",
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("=================================================");
  console.log("✅ DÉPLOIEMENT TERMINÉ");
  console.log("=================================================");
  console.log(JSON.stringify(deploymentInfo.contracts, null, 2));
  console.log("\n📄 Adresses sauvegardées dans deployment.json");
  console.log("\n📋 Vérification sur PolygonScan :");
  console.log(`   npx hardhat verify --network mumbai ${tokenAddress} ${deployer.address}`);
  console.log(`   npx hardhat verify --network mumbai ${rewardDistAddress} ${tokenAddress}`);
  console.log(`   npx hardhat verify --network mumbai ${registryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
