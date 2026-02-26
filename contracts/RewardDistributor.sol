// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./DataToken.sol";

/**
 * @title RewardDistributor
 * @dev Distribue automatiquement les tokens selon les actions des utilisateurs
 *
 * Système de récompenses :
 * - Upload dataset        → 50 DTK de base + bonus qualité
 * - Tâche complétée       → 100 DTK
 * - Dataset utilisé       → 10 DTK par utilisation (passif)
 * - Parrainage            →  20 DTK
 */
contract RewardDistributor is Ownable, ReentrancyGuard {

    DataToken public immutable token;

    // ============================================================
    //  REWARD AMOUNTS (en DTK avec 18 décimales)
    // ============================================================

    uint256 public rewardUpload       = 50  * 1e18;
    uint256 public rewardTaskComplete = 100 * 1e18;
    uint256 public rewardDatasetUsed  = 10  * 1e18;
    uint256 public rewardReferral     = 20  * 1e18;

    // ============================================================
    //  USER SCORES & STATS
    // ============================================================

    struct UserStats {
        uint256 totalEarned;     // Total de tokens gagnés (historique)
        uint256 datasetsUploaded;
        uint256 tasksCompleted;
        uint256 datasetsUsed;    // Nombre de fois que ses données ont été utilisées
        uint256 level;           // Niveau calculé automatiquement
        bool    registered;
    }

    mapping(address => UserStats) public userStats;
    mapping(address => address)   public referrals;      // user => referrer

    // Prévenir les doubles récompenses pour un même dataset
    mapping(bytes32 => bool) public rewardProcessed;

    address public registryContract; // DatasetRegistry autorisé à déclencher des rewards

    // ============================================================
    //  EVENTS
    // ============================================================

    event RewardIssued(
        address indexed user,
        uint256 amount,
        string  rewardType,
        uint256 newTotalEarned
    );

    event UserLevelUp(address indexed user, uint256 oldLevel, uint256 newLevel);
    event UserRegistered(address indexed user, address indexed referrer);

    // ============================================================
    //  MODIFIERS
    // ============================================================

    modifier onlyRegistry() {
        require(msg.sender == registryContract || msg.sender == owner(), "Not authorized");
        _;
    }

    // ============================================================
    //  CONSTRUCTOR
    // ============================================================

    constructor(address _tokenAddress) Ownable(msg.sender) {
        token = DataToken(_tokenAddress);
    }

    // ============================================================
    //  REGISTRATION
    // ============================================================

    /**
     * @dev Inscription d'un utilisateur avec parrainage optionnel
     */
    function registerUser(address _referrer) external {
        require(!userStats[msg.sender].registered, "Already registered");

        userStats[msg.sender].registered = true;
        userStats[msg.sender].level      = 1;

        emit UserRegistered(msg.sender, _referrer);

        // Bonus parrainage
        if (_referrer != address(0) && _referrer != msg.sender && userStats[_referrer].registered) {
            referrals[msg.sender] = _referrer;
            _issueReward(_referrer, rewardReferral, "referral");
        }
    }

    // ============================================================
    //  REWARD FUNCTIONS
    // ============================================================

    /**
     * @dev Récompense pour un upload de dataset
     * @param _user      Uploadeur
     * @param _datasetId ID du dataset
     * @param _qualityScore Score de qualité 0-100 (donné par l'Agent VLM)
     */
    function rewardDatasetUpload(
        address _user,
        uint256 _datasetId,
        uint8   _qualityScore
    ) external onlyRegistry nonReentrant {
        bytes32 key = keccak256(abi.encodePacked("upload", _datasetId));
        require(!rewardProcessed[key], "Already rewarded");

        rewardProcessed[key] = true;

        // Bonus qualité : jusqu'à +100% si qualityScore = 100
        uint256 bonus  = (rewardUpload * _qualityScore) / 100;
        uint256 amount = rewardUpload + bonus;

        userStats[_user].datasetsUploaded++;
        _issueReward(_user, amount, "dataset_upload");
    }

    /**
     * @dev Récompense passive quand un dataset est utilisé/acheté
     */
    function rewardDatasetUsage(address _owner, uint256 _datasetId)
        external
        onlyRegistry
        nonReentrant
    {
        // Pas de limite ici, chaque utilisation génère une récompense
        userStats[_owner].datasetsUsed++;
        _issueReward(_owner, rewardDatasetUsed, "dataset_used");

        // Clé unique par usage pour tracking
        emit RewardIssued(_owner, rewardDatasetUsed, "dataset_used", userStats[_owner].totalEarned);
    }

    /**
     * @dev Récompense pour complétion d'une tâche assignée par l'Agent Task Generator
     * @param _user      Utilisateur
     * @param _taskId    ID de la tâche
     * @param _bonusMultiplier Multiplicateur 100 = x1, 200 = x2 (selon difficulté)
     */
    function rewardTaskCompletion(
        address _user,
        uint256 _taskId,
        uint16  _bonusMultiplier
    ) external onlyOwner nonReentrant {
        bytes32 key = keccak256(abi.encodePacked("task", _taskId, _user));
        require(!rewardProcessed[key], "Task already rewarded");

        rewardProcessed[key] = true;

        uint256 amount = (rewardTaskComplete * _bonusMultiplier) / 100;
        userStats[_user].tasksCompleted++;
        _issueReward(_user, amount, "task_completed");
    }

    // ============================================================
    //  INTERNAL
    // ============================================================

    function _issueReward(address _user, uint256 _amount, string memory _type) internal {
        userStats[_user].totalEarned += _amount;
        token.mintReward(_user, _amount, _type);

        uint256 oldLevel = userStats[_user].level;
        uint256 newLevel = _calculateLevel(userStats[_user].totalEarned);

        if (newLevel > oldLevel) {
            userStats[_user].level = newLevel;
            emit UserLevelUp(_user, oldLevel, newLevel);
        }

        emit RewardIssued(_user, _amount, _type, userStats[_user].totalEarned);
    }

    /**
     * @dev Calcule le niveau utilisateur basé sur ses gains totaux
     * Niveau 1: 0 - 500 DTK
     * Niveau 2: 500 - 2000 DTK
     * Niveau 3: 2000 - 10000 DTK
     * Niveau 4: 10000+ DTK
     */
    function _calculateLevel(uint256 _totalEarned) internal pure returns (uint256) {
        uint256 earned = _totalEarned / 1e18; // Convertir en DTK entiers
        if (earned >= 10_000) return 4;
        if (earned >= 2_000)  return 3;
        if (earned >= 500)    return 2;
        return 1;
    }

    // ============================================================
    //  CONFIG
    // ============================================================

    function setRegistryContract(address _registry) external onlyOwner {
        registryContract = _registry;
    }

    function updateRewardAmounts(
        uint256 _upload,
        uint256 _task,
        uint256 _usage,
        uint256 _referral
    ) external onlyOwner {
        rewardUpload       = _upload;
        rewardTaskComplete = _task;
        rewardDatasetUsed  = _usage;
        rewardReferral     = _referral;
    }

    /**
     * @dev Retourne les stats complètes d'un utilisateur
     */
    function getUserProfile(address _user) external view returns (
        uint256 totalEarned,
        uint256 datasetsUploaded,
        uint256 tasksCompleted,
        uint256 datasetsUsed,
        uint256 level,
        uint256 tokenBalance
    ) {
        UserStats memory stats = userStats[_user];
        return (
            stats.totalEarned,
            stats.datasetsUploaded,
            stats.tasksCompleted,
            stats.datasetsUsed,
            stats.level,
            token.balanceOf(_user)
        );
    }
}
