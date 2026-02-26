import deployment from "./deployment.json";
import DatasetRegistryABI from "./abis/DatasetRegistry.json";
import DataTokenABI from "./abis/DataToken.json";
import RewardDistributorABI from "./abis/RewardDistributor.json";

export const CONFIG = {
  contracts: {
    registry: {
      address: deployment.contracts.DatasetRegistry,
      abi: DatasetRegistryABI.abi,
    },
    token: {
      address: deployment.contracts.DataToken,
      abi: DataTokenABI.abi,
    },
    reward: {
      address: deployment.contracts.RewardDistributor,
      abi: RewardDistributorABI.abi,
    },
  },
  pinata: {
    apiKey:  process.env.REACT_APP_PINATA_API_KEY,
    secret:  process.env.REACT_APP_PINATA_SECRET,
    gateway: "https://gateway.pinata.cloud/ipfs",
  },
  network: {
    rpcUrl:  "http://127.0.0.1:8545",
    chainId: 31337,
    name:    "localhost",
  },
};
