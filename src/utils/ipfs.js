import axios from "axios";
import CryptoJS from "crypto-js";

export async function computeHash(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wordArray = CryptoJS.lib.WordArray.create(e.target.result);
      const hash = "0x" + CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
      resolve(hash);
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function uploadToIPFS(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("pinataMetadata", JSON.stringify({ name: file.name }));
  formData.append("pinataOptions",  JSON.stringify({ cidVersion: 1 }));
  const response = await axios.post(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    formData,
    {
      headers: {
        pinata_api_key:        process.env.REACT_APP_PINATA_API_KEY,
        pinata_secret_api_key: process.env.REACT_APP_PINATA_SECRET,
      },
      maxBodyLength: Infinity,
    }
  );
  return response.data.IpfsHash;
}
