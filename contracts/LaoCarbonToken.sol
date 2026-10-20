// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice 1 token = 1 tCO2e. Minted by the registry once an auditor approves a project's credits.
contract LaoCarbonToken is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address admin) ERC20("Lao Carbon Credit", "LCC") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    // Credits are whole tonnes, matching how registries issue serialised units.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function mint(address to, uint256 tons) external onlyRole(MINTER_ROLE) {
        _mint(to, tons);
    }
}
