import React, { useState } from "react";
import { connectWallet } from "../utils/blockchain";

const styles = {
  bar:     { background: "#1A3A5C", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  title:   { color: "#FFD700", fontWeight: "bold", fontSize: 20 },
  btn:     { background: "#FFD700", color: "#1A3A5C", border: "none", padding: "10px 20px", borderRadius: 8, fontWeight: "bold", cursor: "pointer" },
  badge:   { background: "#FFD700", color: "#1A3A5C", padding: "4px 12px", borderRadius: 20, fontWeight: "bold", fontSize: 13, marginLeft: 10 },
  address: { color: "#fff", fontSize: 13 },
};

export default function Navbar({ onConnect }) {
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState(null);
  const [balance, setBalance] = useState(null);

  async function handleConnect() {
    setLoading(true);
    try {
      const { signer: s, address: a, balance: b } = await connectWallet();
      setAddress(a);
      setBalance(b);
      onConnect(s);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.bar}>
      <div style={styles.title}>Data Marketplace</div>
      {address ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={styles.address}>{address.slice(0,6)}...{address.slice(-4)}</span>
          <span style={styles.badge}>{parseFloat(balance).toFixed(4)} ETH</span>
        </div>
      ) : (
        <button style={styles.btn} onClick={handleConnect} disabled={loading}>
          {loading ? "Connexion..." : "Connecter MetaMask"}
        </button>
      )}
    </div>
  );
}
