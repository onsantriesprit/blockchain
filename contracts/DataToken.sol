// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title DataToken (DTK)
 * @dev Token utilitaire ERC-20 pour récompenser les contributeurs
 */
contract DataToken is ERC20, ERC20Burnable, AccessControl {

    bytes32 public constant MINTER_ROLE   = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE   = keccak256("BURNER_ROLE");

    uint256 public constant MAX_SUPPLY    = 1_000_000_000 * 1e18; // 1 milliard DTK
    uint256 public totalMinted;

    event TokensMinted(address indexed to, uint256 amount, string reason);
    event TokensBurned(address indexed from, uint256 amount);

    constructor(address _admin) ERC20("DataToken", "DTK") {
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(MINTER_ROLE, _admin);

        // Mint initial supply pour la plateforme (10%)
        uint256 initialSupply = MAX_SUPPLY / 10;
        _mint(_admin, initialSupply);
        totalMinted += initialSupply;
    }

    /**
     * @dev Mint des tokens pour récompenser un contributeur
     * @param _to      Adresse du bénéficiaire
     * @param _amount  Montant en wei (18 décimales)
     * @param _reason  Raison du mint (ex: "dataset_upload", "task_completed")
     */
    function mintReward(address _to, uint256 _amount, string calldata _reason)
        external
        onlyRole(MINTER_ROLE)
    {
        require(totalMinted + _amount <= MAX_SUPPLY, "Max supply exceeded");
        require(_to != address(0), "Invalid address");

        _mint(_to, _amount);
        totalMinted += _amount;

        emit TokensMinted(_to, _amount, _reason);
    }

    /**
     * @dev Burn des tokens (pour les achats sur le marketplace)
     */
    function burnFrom(address _from, uint256 _amount)
        public
        override
        onlyRole(BURNER_ROLE)
    {
        _burn(_from, _amount);
        emit TokensBurned(_from, _amount);
    }

    /**
     * @dev Retourne la supply restante mintable
     */
    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalMinted;
    }
}
