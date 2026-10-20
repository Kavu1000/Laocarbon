// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Soulbound (ERC-5192) retirement certificate. Cannot be transferred once minted.
contract LaoCarbonCertificate is ERC721, AccessControl {
    using Strings for uint256;
    using Strings for address;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    struct Retirement {
        address beneficiary;
        uint256 projectId;
        uint256 tons;
        uint256 timestamp;
        string projectIpfsHash;
    }

    error Soulbound();

    event Locked(uint256 tokenId);

    uint256 public totalMinted;
    mapping(uint256 => Retirement) private _retirements;

    constructor(address admin) ERC721("Lao Carbon Retirement Certificate", "LCRC") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mint(
        address to,
        uint256 projectId,
        uint256 tons,
        string calldata projectIpfsHash
    ) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        tokenId = ++totalMinted;
        _retirements[tokenId] = Retirement(to, projectId, tons, block.timestamp, projectIpfsHash);
        _mint(to, tokenId);
        emit Locked(tokenId);
    }

    function retirement(uint256 tokenId) external view returns (Retirement memory) {
        _requireOwned(tokenId);
        return _retirements[tokenId];
    }

    /// @dev ERC-5192: every certificate is permanently locked.
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Retirement memory r = _retirements[tokenId];
        string memory head = string.concat(
            '{"name":"Carbon Retirement Certificate #', tokenId.toString(),
            '","description":"', r.tons.toString(), ' tCO2e permanently retired on LaoCarbon.",',
            '"external_url":"ipfs://', r.projectIpfsHash, '",'
        );
        string memory attrs = string.concat(
            '"attributes":[{"trait_type":"Beneficiary","value":"', r.beneficiary.toHexString(), '"},',
            '{"trait_type":"Project ID","display_type":"number","value":', r.projectId.toString(), "},",
            '{"trait_type":"Tonnes CO2e","display_type":"number","value":', r.tons.toString(), "},",
            '{"trait_type":"Retired At","display_type":"date","value":', r.timestamp.toString(), "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(string.concat(head, attrs))));
    }

    // Allow mint (from == 0) only; block transfers and burns.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }
}
