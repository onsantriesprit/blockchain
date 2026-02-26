// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DatasetRegistry
 * @dev Enregistre les hash IPFS des datasets sur la blockchain
 * @author Lead Blockchain Engineer - DataMarketplace
 */
contract DatasetRegistry is Ownable, ReentrancyGuard {

    // ============================================================
    //  STRUCTURES
    // ============================================================

    struct Dataset {
        string  ipfsHash;        // Hash CID IPFS (ex: QmXxx...)
        address owner;           // Propriétaire du dataset
        uint256 price;           // Prix en tokens (en wei équivalent)
        uint256 registeredAt;    // Timestamp d'enregistrement
        uint256 usageCount;      // Nombre d'utilisations
        DataType dataType;       // Type de données
        bool    isActive;        // Disponible sur le marketplace
        string  metadata;        // JSON metadata (titre, description, tags)
        bytes32 contentHash;     // Hash SHA256 du contenu (anti-doublon)
    }

    enum DataType { IMAGE, TEXT, AUDIO, VIDEO, TABULAR, OTHER }

    // ============================================================
    //  STORAGE
    // ============================================================

    // datasetId => Dataset
    mapping(uint256 => Dataset) public datasets;

    // contentHash => datasetId (détection doublons)
    mapping(bytes32 => uint256) public contentHashToId;

    // owner => liste de ses datasetIds
    mapping(address => uint256[]) public ownerDatasets;

    // datasetId => acheteurs autorisés
    mapping(uint256 => mapping(address => bool)) public accessGranted;

    uint256 public nextDatasetId = 1;
    uint256 public platformFeePercent = 5; // 5% de frais plateforme

    // ============================================================
    //  EVENTS
    // ============================================================

    event DatasetRegistered(
        uint256 indexed datasetId,
        address indexed owner,
        string  ipfsHash,
        bytes32 contentHash,
        uint256 price,
        DataType dataType
    );

    event DatasetPurchased(
        uint256 indexed datasetId,
        address indexed buyer,
        address indexed owner,
        uint256 amount
    );

    event DatasetPriceUpdated(
        uint256 indexed datasetId,
        uint256 oldPrice,
        uint256 newPrice
    );

    event DatasetDeactivated(uint256 indexed datasetId);

    // ============================================================
    //  MODIFIERS
    // ============================================================

    modifier onlyDatasetOwner(uint256 _datasetId) {
        require(datasets[_datasetId].owner == msg.sender, "Not dataset owner");
        _;
    }

    modifier datasetExists(uint256 _datasetId) {
        require(_datasetId > 0 && _datasetId < nextDatasetId, "Dataset not found");
        _;
    }

    modifier datasetActive(uint256 _datasetId) {
        require(datasets[_datasetId].isActive, "Dataset not active");
        _;
    }

    // ============================================================
    //  CONSTRUCTOR
    // ============================================================

    constructor() Ownable(msg.sender) {}

    // ============================================================
    //  CORE FUNCTIONS
    // ============================================================

    /**
     * @dev Enregistre un nouveau dataset
     * @param _ipfsHash  CID IPFS du fichier uploadé
     * @param _contentHash Hash SHA256 du contenu (calculé off-chain)
     * @param _price     Prix en wei
     * @param _dataType  Type de données
     * @param _metadata  JSON string avec titre, description, tags
     */
    function registerDataset(
        string  calldata _ipfsHash,
        bytes32          _contentHash,
        uint256          _price,
        DataType         _dataType,
        string  calldata _metadata
    ) external nonReentrant returns (uint256 datasetId) {

        require(bytes(_ipfsHash).length > 0,    "Empty IPFS hash");
        require(_contentHash != bytes32(0),      "Empty content hash");
        require(contentHashToId[_contentHash] == 0, "Duplicate content detected");

        datasetId = nextDatasetId++;

        datasets[datasetId] = Dataset({
            ipfsHash:    _ipfsHash,
            owner:       msg.sender,
            price:       _price,
            registeredAt: block.timestamp,
            usageCount:  0,
            dataType:    _dataType,
            isActive:    true,
            metadata:    _metadata,
            contentHash: _contentHash
        });

        contentHashToId[_contentHash] = datasetId;
        ownerDatasets[msg.sender].push(datasetId);

        emit DatasetRegistered(
            datasetId,
            msg.sender,
            _ipfsHash,
            _contentHash,
            _price,
            _dataType
        );
    }

    /**
     * @dev Achète l'accès à un dataset (paiement en ETH natif)
     */
    function purchaseAccess(uint256 _datasetId)
        external
        payable
        nonReentrant
        datasetExists(_datasetId)
        datasetActive(_datasetId)
    {
        Dataset storage dataset = datasets[_datasetId];

        require(!accessGranted[_datasetId][msg.sender], "Already purchased");
        require(msg.sender != dataset.owner, "Owner already has access");
        require(msg.value >= dataset.price, "Insufficient payment");

        // Calcul des frais plateforme
        uint256 fee          = (msg.value * platformFeePercent) / 100;
        uint256 ownerAmount  = msg.value - fee;

        // Transfert au propriétaire
        (bool success, ) = payable(dataset.owner).call{value: ownerAmount}("");
        require(success, "Transfer to owner failed");

        // Les frais restent dans le contrat (pour la plateforme)

        accessGranted[_datasetId][msg.sender] = true;
        dataset.usageCount++;

        emit DatasetPurchased(_datasetId, msg.sender, dataset.owner, msg.value);
    }

    /**
     * @dev Vérifie si un dataset existe déjà (anti-doublon)
     */
    function checkDuplicate(bytes32 _contentHash) external view returns (bool exists, uint256 datasetId) {
        datasetId = contentHashToId[_contentHash];
        exists    = datasetId != 0;
    }

    /**
     * @dev Retourne tous les datasets d'un owner
     */
    function getOwnerDatasets(address _owner) external view returns (uint256[] memory) {
        return ownerDatasets[_owner];
    }

    /**
     * @dev Met à jour le prix d'un dataset
     */
    function updatePrice(uint256 _datasetId, uint256 _newPrice)
        external
        datasetExists(_datasetId)
        onlyDatasetOwner(_datasetId)
    {
        uint256 oldPrice = datasets[_datasetId].price;
        datasets[_datasetId].price = _newPrice;
        emit DatasetPriceUpdated(_datasetId, oldPrice, _newPrice);
    }

    /**
     * @dev Désactive un dataset du marketplace
     */
    function deactivateDataset(uint256 _datasetId)
        external
        datasetExists(_datasetId)
        onlyDatasetOwner(_datasetId)
    {
        datasets[_datasetId].isActive = false;
        emit DatasetDeactivated(_datasetId);
    }

    /**
     * @dev Withdrawal des frais plateforme (owner uniquement)
     */
    function withdrawFees(address payable _to) external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        (bool success, ) = _to.call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    /**
     * @dev Mise à jour des frais plateforme
     */
    function setPlatformFee(uint256 _feePercent) external onlyOwner {
        require(_feePercent <= 20, "Fee too high");
        platformFeePercent = _feePercent;
    }
}
