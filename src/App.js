import React, { useState } from "react";
import Navbar        from "./components/Navbar";
import UploadDataset from "./components/UploadDataset";

export default function App() {
  const [signer, setSigner] = useState(null);
  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8" }}>
      <Navbar onConnect={setSigner} />
      <div style={{ padding: "32px 16px" }}>
        {signer ? (
          <UploadDataset signer={signer} />
        ) : (
          <div style={{ textAlign: "center", marginTop: 80 }}>
            <div style={{ fontSize: 64 }}>🔗</div>
            <div style={{ fontSize: 24, fontWeight: "bold", color: "#1A3A5C", marginTop: 16 }}>
              Connecte ton wallet MetaMask
            </div>
            <div style={{ color: "#888", marginTop: 8 }}>pour acceder au Data Marketplace</div>
          </div>
        )}
      </div>
    </div>
  );
}
