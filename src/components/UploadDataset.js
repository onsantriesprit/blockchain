import React, { useState } from "react";
import { ethers } from "ethers";
import { computeHash, uploadToIPFS } from "../utils/ipfs";
import { getContracts } from "../utils/blockchain";

const DATA_TYPES = ["IMAGE", "TEXT", "AUDIO", "VIDEO", "TABULAR"];
const S = {
  container: { maxWidth: 600, margin: "0 auto", padding: 24, fontFamily: "Arial" },
  card:      { background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.1)" },
  title:     { fontSize: 22, fontWeight: "bold", color: "#1A3A5C", marginBottom: 20 },
  label:     { display: "block", marginBottom: 6, fontWeight: "bold", color: "#333" },
  input:     { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", marginBottom: 16, fontSize: 14, boxSizing: "border-box" },
  select:    { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", marginBottom: 16, fontSize: 14, boxSizing: "border-box" },
  dropzone:  { border: "2px dashed #2E6DA4", borderRadius: 12, padding: 40, textAlign: "center", cursor: "pointer", marginBottom: 16, background: "#f8f9ff" },
  btn:       { width: "100%", padding: 14, background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: "bold", cursor: "pointer" },
  btnDis:    { width: "100%", padding: 14, background: "#aaa", color: "#fff", border: "none", borderRadius: 8, fontSize: 16 },
  step:      { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #eee" },
  success:   { background: "#D4EDDA", border: "1px solid #1E7E34", borderRadius: 8, padding: 16, marginTop: 16 },
  error:     { background: "#F8D7DA", border: "1px solid #dc3545", borderRadius: 8, padding: 16, marginTop: 16 },
};

export default function UploadDataset({ signer }) {
  const [file, setFile]               = useState(null);
  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice]             = useState("0.01");
  const [dataType, setDataType]       = useState(0);
  const [loading, setLoading]         = useState(false);
  const [steps, setSteps]             = useState([]);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState(null);

  const addStep  = (text, status="done") => setSteps(p => [...p, { text, status }]);
  const lastDone = ()                    => setSteps(p => p.map((s,i) => i===p.length-1 ? {...s,status:"done"} : s));

  async function handleUpload() {
    if (!file || !title || !signer) return;
    setLoading(true); setSteps([]); setResult(null); setError(null);
    try {
      addStep("Calcul hash SHA-256...", "loading");
      const contentHash = await computeHash(file);
      lastDone();

      addStep("Verification doublons...", "loading");
      const { registry } = getContracts(signer);
      const [exists, dupId] = await registry.checkDuplicate(contentHash);
      if (exists) throw new Error("Contenu duplique ! Dataset #" + dupId + " existe deja.");
      lastDone();

      addStep("Upload sur IPFS...", "loading");
      const ipfsHash = await uploadToIPFS(file);
      lastDone();

      addStep("Enregistrement blockchain...", "loading");
      const metadata = JSON.stringify({ title, description, fileName: file.name });
      const tx = await registry.registerDataset(ipfsHash, contentHash, ethers.parseEther(price), dataType, metadata);
      addStep("Attente confirmation...", "loading");
      const receipt = await tx.wait();
      lastDone();

      const event = receipt.logs.map(log => { try { return registry.interface.parseLog(log); } catch { return null; } }).find(e => e?.name === "DatasetRegistered");
      setResult({ datasetId: event?.args?.datasetId?.toString(), ipfsHash, txHash: tx.hash, ipfsUrl: "https://gateway.pinata.cloud/ipfs/" + ipfsHash });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const icon = (s) => s==="done" ? "✅" : s==="loading" ? "⏳" : "⭕";

  return (
    <div style={S.container}>
      <div style={S.card}>
        <div style={S.title}>Uploader un Dataset</div>
        <div style={S.dropzone} onClick={() => document.getElementById("fi").click()}>
          {file ? (
            <div><div style={{fontSize:32}}>📁</div><b>{file.name}</b><div style={{color:"#888"}}>{(file.size/1024).toFixed(1)} KB</div></div>
          ) : (
            <div><div style={{fontSize:40}}>☁️</div><div style={{color:"#2E6DA4",fontWeight:"bold"}}>Clique pour selectionner</div><div style={{color:"#888",fontSize:13}}>Images, textes, audio...</div></div>
          )}
          <input id="fi" type="file" style={{display:"none"}} onChange={e => setFile(e.target.files[0])} />
        </div>

        <label style={S.label}>Titre *</label>
        <input style={S.input} placeholder="Ex: Plantes tropicales 2024" value={title} onChange={e=>setTitle(e.target.value)} />

        <label style={S.label}>Description</label>
        <input style={S.input} placeholder="Description..." value={description} onChange={e=>setDescription(e.target.value)} />

        <label style={S.label}>Type de donnees</label>
        <select style={S.select} value={dataType} onChange={e=>setDataType(Number(e.target.value))}>
          {DATA_TYPES.map((t,i) => <option key={i} value={i}>{t}</option>)}
        </select>

        <label style={S.label}>Prix (ETH)</label>
        <input style={S.input} type="number" step="0.001" value={price} onChange={e=>setPrice(e.target.value)} />

        <button style={loading||!file||!title ? S.btnDis : S.btn} onClick={handleUpload} disabled={loading||!file||!title}>
          {loading ? "Upload en cours..." : "Uploader sur IPFS + Blockchain"}
        </button>

        {steps.length > 0 && (
          <div style={{marginTop:20}}>
            <b style={{color:"#1A3A5C"}}>Progression :</b>
            {steps.map((s,i) => (
              <div key={i} style={S.step}>
                <span>{icon(s.status)}</span>
                <span style={{color: s.status==="done"?"#1E7E34":s.status==="loading"?"#E67E22":"#aaa"}}>{s.text}</span>
              </div>
            ))}
          </div>
        )}

        {result && (
          <div style={S.success}>
            <b style={{color:"#1E7E34",fontSize:16}}>Dataset enregistre avec succes !</b>
            <div style={{marginTop:8}}>Dataset ID : <b>#{result.datasetId}</b></div>
            <div style={{marginTop:4}}>IPFS : <a href={result.ipfsUrl} target="_blank" rel="noreferrer">{result.ipfsHash}</a></div>
            <div style={{marginTop:4,fontSize:12,color:"#555"}}>TX : {result.txHash}</div>
          </div>
        )}

        {error && (
          <div style={S.error}>
            <b style={{color:"#dc3545"}}>Erreur</b>
            <div style={{marginTop:4}}>{error}</div>
          </div>
        )}
      </div>
    </div>
  );
}
