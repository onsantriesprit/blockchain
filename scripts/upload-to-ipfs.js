/**
 * upload-to-ipfs.js
 * ==================
 * Script principal : Upload image → IPFS → Hash sur Blockchain
 *
 * Flow complet :
 * 1. L'utilisateur sélectionne un fichier
 * 2. On calcule le SHA-256 du contenu (anti-doublon)
 * 3. On upload sur IPFS via Pinata
 * 4. On enregistre le CID IPFS sur la blockchain (DatasetRegistry)
 * 5. On reçoit les tokens de récompense automatiquement
 *
 * Dépendances :
 *   npm install ethers axios crypto-js
 */

import { ethers } from "ethers";
import axios from "axios";
import CryptoJS from "crypto-js";

// ================================================================
//  CONFIG
// ================================================================

const CONFIG = {
  // Adresses des smart contracts déployés (remplacer après déploiement)
  REGISTRY_ADDRESS:    "0xYourDatasetRegistryAddress",
  REWARD_DIST_ADDRESS: "0xYourRewardDistributorAddress",
  TOKEN_ADDRESS:       "0xYourDataTokenAddress",

  // Pinata IPFS (créer un compte sur pinata.cloud)
  PINATA_API_KEY:      process.env.PINATA_API_KEY,
  PINATA_SECRET:       process.env.PINATA_SECRET,

  // Réseau (Polygon Mumbai pour les tests, Polygon Mainnet en prod)
  RPC_URL: "https://rpc-mumbai.maticvigil.com",
  CHAIN_ID: 80001, // Polygon Mumbai
};

// ================================================================
//  ABIs (interfaces des smart contracts)
// ================================================================

const REGISTRY_ABI = [
  "function registerDataset(string ipfsHash, bytes32 contentHash, uint256 price, uint8 dataType, string metadata) returns (uint256)",
  "function checkDuplicate(bytes32 contentHash) view returns (bool exists, uint256 datasetId)",
  "event DatasetRegistered(uint256 indexed datasetId, address indexed owner, string ipfsHash, bytes32 contentHash, uint256 price, uint8 dataType)",
];

const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// ================================================================
//  CLASSE PRINCIPALE
// ================================================================

export class DataMarketplaceUploader {
  constructor(signer) {
    this.signer   = signer;
    this.provider = signer.provider;

    this.registry = new ethers.Contract(CONFIG.REGISTRY_ADDRESS, REGISTRY_ABI, signer);
    this.token    = new ethers.Contract(CONFIG.TOKEN_ADDRESS, TOKEN_ABI, signer);
  }

  // ----------------------------------------------------------------
  //  ÉTAPE 1 : Calcul du hash SHA-256 du fichier
  // ----------------------------------------------------------------

  async computeContentHash(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const wordArray  = CryptoJS.lib.WordArray.create(e.target.result);
        const sha256Hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
        const bytes32    = "0x" + sha256Hash;
        resolve(bytes32);
      };

      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  // ----------------------------------------------------------------
  //  ÉTAPE 2 : Vérification anti-doublon sur blockchain
  // ----------------------------------------------------------------

  async checkForDuplicate(contentHash) {
    const [exists, datasetId] = await this.registry.checkDuplicate(contentHash);

    if (exists) {
      throw new Error(
        `❌ Contenu dupliqué détecté ! Ce fichier existe déjà (Dataset #${datasetId})`
      );
    }

    console.log("✅ Aucun doublon détecté, contenu unique");
    return true;
  }

  // ----------------------------------------------------------------
  //  ÉTAPE 3 : Upload sur IPFS via Pinata
  // ----------------------------------------------------------------

  async uploadToIPFS(file, metadata = {}) {
    console.log("📤 Upload vers IPFS en cours...");

    const formData = new FormData();
    formData.append("file", file);

    // Métadonnées Pinata pour organisation
    const pinataMetadata = JSON.stringify({
      name: file.name,
      keyvalues: {
        uploader: await this.signer.getAddress(),
        timestamp: Date.now().toString(),
        ...metadata,
      },
    });
    formData.append("pinataMetadata", pinataMetadata);

    // Options : épingler 365 jours
    const pinataOptions = JSON.stringify({ cidVersion: 1 });
    formData.append("pinataOptions", pinataOptions);

    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      formData,
      {
        headers: {
          "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
          pinata_api_key:        CONFIG.PINATA_API_KEY,
          pinata_secret_api_key: CONFIG.PINATA_SECRET,
        },
        maxBodyLength: Infinity,
      }
    );

    const ipfsHash = response.data.IpfsHash;
    console.log(`✅ Fichier uploadé sur IPFS: ${ipfsHash}`);
    console.log(`🔗 URL: https://gateway.pinata.cloud/ipfs/${ipfsHash}`);

    return ipfsHash;
  }

  // ----------------------------------------------------------------
  //  ÉTAPE 4 : Enregistrement du hash sur la blockchain
  // ----------------------------------------------------------------

  async registerOnBlockchain(params) {
    const { ipfsHash, contentHash, price, dataType, metadata } = params;

    console.log("⛓️  Enregistrement sur la blockchain...");
    console.log(`   IPFS Hash: ${ipfsHash}`);
    console.log(`   Content Hash: ${contentHash}`);

    // Estimation du gas
    const gasEstimate = await this.registry.registerDataset.estimateGas(
      ipfsHash,
      contentHash,
      ethers.parseEther(price.toString()),
      dataType,
      JSON.stringify(metadata)
    );

    const tx = await this.registry.registerDataset(
      ipfsHash,
      contentHash,
      ethers.parseEther(price.toString()),
      dataType,
      JSON.stringify(metadata),
      { gasLimit: gasEstimate * 120n / 100n } // +20% buffer
    );

    console.log(`📝 Transaction envoyée: ${tx.hash}`);
    console.log("⏳ En attente de confirmation...");

    const receipt = await tx.wait();

    // Extraire l'ID du dataset depuis les logs
    const event = receipt.logs
      .map(log => {
        try { return this.registry.interface.parseLog(log); }
        catch { return null; }
      })
      .find(e => e?.name === "DatasetRegistered");

    const datasetId = event?.args?.datasetId;

    console.log(`✅ Dataset enregistré sur la blockchain !`);
    console.log(`   Dataset ID: #${datasetId}`);
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas utilisé: ${receipt.gasUsed}`);

    return { datasetId, txHash: tx.hash, blockNumber: receipt.blockNumber };
  }

  // ----------------------------------------------------------------
  //  FLOW COMPLET : Upload → IPFS → Blockchain
  // ----------------------------------------------------------------

  async uploadDataset(file, options = {}) {
    const {
      price       = 0.01,     // Prix en ETH/MATIC
      dataType    = 0,         // 0=IMAGE, 1=TEXT, 2=AUDIO, 3=VIDEO, 4=TABULAR
      title       = file.name,
      description = "",
      tags        = [],
      qualityScore = 75,       // Score donné par l'Agent VLM (0-100)
    } = options;

    console.log("\n🚀 === DÉBUT DU PROCESSUS D'UPLOAD ===");
    console.log(`   Fichier: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    try {
      // ÉTAPE 1: Hash du contenu
      console.log("\n🔐 Étape 1/4: Calcul du hash SHA-256...");
      const contentHash = await this.computeContentHash(file);
      console.log(`   Hash: ${contentHash}`);

      // ÉTAPE 2: Anti-doublon
      console.log("\n🔍 Étape 2/4: Vérification des doublons...");
      await this.checkForDuplicate(contentHash);

      // ÉTAPE 3: Upload IPFS
      console.log("\n📡 Étape 3/4: Upload sur IPFS...");
      const ipfsHash = await this.uploadToIPFS(file, { title, tags: tags.join(",") });

      // ÉTAPE 4: Blockchain
      console.log("\n⛓️  Étape 4/4: Enregistrement blockchain...");
      const result = await this.registerOnBlockchain({
        ipfsHash,
        contentHash,
        price,
        dataType,
        metadata: { title, description, tags, qualityScore, fileName: file.name, fileSize: file.size },
      });

      // Solde tokens après récompense
      const address     = await this.signer.getAddress();
      const balance     = await this.token.balanceOf(address);
      const decimals    = await this.token.decimals();
      const dtkBalance  = ethers.formatUnits(balance, decimals);

      console.log("\n🎉 === UPLOAD TERMINÉ AVEC SUCCÈS ===");
      console.log(`   Dataset ID:    #${result.datasetId}`);
      console.log(`   IPFS CID:      ${ipfsHash}`);
      console.log(`   TX Hash:       ${result.txHash}`);
      console.log(`   Solde DTK:     ${dtkBalance} DTK`);

      return {
        success:     true,
        datasetId:   result.datasetId.toString(),
        ipfsHash,
        contentHash,
        txHash:      result.txHash,
        ipfsUrl:     `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
        dtkBalance,
      };

    } catch (error) {
      console.error("\n❌ Erreur lors de l'upload:", error.message);
      throw error;
    }
  }

  // ----------------------------------------------------------------
  //  HELPERS
  // ----------------------------------------------------------------

  async getTokenBalance() {
    const address  = await this.signer.getAddress();
    const balance  = await this.token.balanceOf(address);
    const decimals = await this.token.decimals();
    return ethers.formatUnits(balance, decimals);
  }
}

// ================================================================
//  EXEMPLE D'UTILISATION (React/Next.js)
// ================================================================

/*
// Dans votre composant React :

import { BrowserProvider } from "ethers";
import { DataMarketplaceUploader } from "./upload-to-ipfs";

async function handleFileUpload(event) {
  const file = event.target.files[0];

  // Connexion MetaMask
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();

  const uploader = new DataMarketplaceUploader(signer);

  const result = await uploader.uploadDataset(file, {
    price:       0.01,
    dataType:    0,        // IMAGE
    title:       "Plantes tropicales - Dataset 2024",
    description: "100 images haute résolution de plantes tropicales",
    tags:        ["botanique", "tropical", "nature"],
    qualityScore: 85,
  });

  console.log("Résultat:", result);
}
*/
