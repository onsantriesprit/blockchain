import { ethers } from "ethers";
import { CONFIG } from "../config";

export async function connectWallet() {
  if (!window.ethereum) throw new Error("MetaMask non detecte ! Installe MetaMask.");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer  = await provider.getSigner();
  const address = await signer.getAddress();
  const balance = await provider.getBalance(address);
  return { signer, address, balance: ethers.formatEther(balance) };
}

export function getContracts(signer) {
  return {
    registry: new ethers.Contract(CONFIG.contracts.registry.address, CONFIG.contracts.registry.abi, signer),
    token:    new ethers.Contract(CONFIG.contracts.token.address,    CONFIG.contracts.token.abi,    signer),
    reward:   new ethers.Contract(CONFIG.contracts.reward.address,   CONFIG.contracts.reward.abi,   signer),
  };
}

export async function getTokenBalance(signer) {
  const { token } = getContracts(signer);
  const address   = await signer.getAddress();
  const balance   = await token.balanceOf(address);
  return ethers.formatEther(balance);
}
