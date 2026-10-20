// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LaoCarbonToken} from "./LaoCarbonToken.sol";
import {LaoCarbonCertificate} from "./LaoCarbonCertificate.sol";

contract LaoCarbonMarketplace is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    uint256 public constant BPS = 10_000;
    uint256 public constant FOREST_OWNER_BPS = 8_700;
    uint256 public constant PLATFORM_BPS = 500;
    uint256 public constant AUDITOR_BPS = 500;
    uint256 public constant GOVERNMENT_BPS = 300;

    struct Project {
        address forestOwner;
        address auditor;
        string ipfsHash;
        bool registered;
    }

    struct Listing {
        uint256 projectId;
        address seller;
        uint256 pricePerTon; // in payment token base units (USDT: 6 decimals)
        uint256 available; // tonnes held in escrow by this contract
    }

    IERC20 public immutable paymentToken;
    LaoCarbonToken public immutable carbonToken;
    LaoCarbonCertificate public immutable certificate;

    address public platformWallet;
    address public governmentWallet;

    uint256 public nextListingId = 1;
    mapping(uint256 => Project) public projects;
    mapping(uint256 => Listing) public listings;

    event ProjectRegistered(uint256 indexed projectId, address indexed forestOwner, address indexed auditor, string ipfsHash);
    event Listed(uint256 indexed listingId, uint256 indexed projectId, address indexed seller, uint256 pricePerTon, uint256 tons);
    event ListingCancelled(uint256 indexed listingId, uint256 tonsReturned);
    event CarbonOffset(
        uint256 indexed certificateId,
        address indexed buyer,
        uint256 indexed projectId,
        uint256 listingId,
        uint256 tons,
        uint256 totalPaid,
        string projectIpfsHash,
        uint256 timestamp
    );
    event RevenueSplit(
        uint256 indexed certificateId,
        uint256 forestOwnerAmount,
        uint256 platformAmount,
        uint256 auditorAmount,
        uint256 governmentAmount
    );
    event WalletsUpdated(address platformWallet, address governmentWallet);

    error ZeroAddress();
    error ZeroAmount();
    error ProjectExists();
    error UnknownProject();
    error NotForestOwner();
    error NotSeller();
    error InsufficientCredits(uint256 available, uint256 requested);
    error PriceExceedsMax(uint256 total, uint256 maxTotal);

    constructor(
        address admin,
        IERC20 paymentToken_,
        LaoCarbonToken carbonToken_,
        LaoCarbonCertificate certificate_,
        address platformWallet_,
        address governmentWallet_
    ) {
        if (
            admin == address(0) || address(paymentToken_) == address(0) || address(carbonToken_) == address(0)
                || address(certificate_) == address(0)
        ) revert ZeroAddress();
        paymentToken = paymentToken_;
        carbonToken = carbonToken_;
        certificate = certificate_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
        _setWallets(platformWallet_, governmentWallet_);
    }

    // ---------------------------------------------------------------- admin

    function setWallets(address platformWallet_, address governmentWallet_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setWallets(platformWallet_, governmentWallet_);
    }

    function registerProject(uint256 projectId, address forestOwner, address auditor, string calldata ipfsHash)
        external
        onlyRole(REGISTRAR_ROLE)
    {
        if (forestOwner == address(0) || auditor == address(0)) revert ZeroAddress();
        if (projects[projectId].registered) revert ProjectExists();
        projects[projectId] = Project(forestOwner, auditor, ipfsHash, true);
        emit ProjectRegistered(projectId, forestOwner, auditor, ipfsHash);
    }

    // --------------------------------------------------------- forest owner

    /// @notice Deposits `tons` credits into escrow. Caller must approve this contract on the carbon token first.
    function createListing(uint256 projectId, uint256 pricePerTon, uint256 tons) external returns (uint256 listingId) {
        Project storage p = projects[projectId];
        if (!p.registered) revert UnknownProject();
        if (msg.sender != p.forestOwner) revert NotForestOwner();
        if (pricePerTon == 0 || tons == 0) revert ZeroAmount();

        listingId = nextListingId++;
        listings[listingId] = Listing(projectId, msg.sender, pricePerTon, tons);
        IERC20(address(carbonToken)).safeTransferFrom(msg.sender, address(this), tons);
        emit Listed(listingId, projectId, msg.sender, pricePerTon, tons);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (msg.sender != l.seller) revert NotSeller();
        uint256 remaining = l.available;
        l.available = 0;
        IERC20(address(carbonToken)).safeTransfer(msg.sender, remaining);
        emit ListingCancelled(listingId, remaining);
    }

    // ---------------------------------------------------------------- buyer

    function quote(uint256 listingId, uint256 tons) public view returns (uint256) {
        return listings[listingId].pricePerTon * tons;
    }

    /// @notice Pays for `tons` credits, splits revenue, burns the credits and mints a soulbound certificate,
    ///         all in one transaction. Caller must approve `quote(listingId, tons)` of the payment token first.
    /// @param maxTotalCost Slippage guard; reverts if the quoted cost exceeds it.
    function buyAndOffset(uint256 listingId, uint256 tons, uint256 maxTotalCost)
        external
        nonReentrant
        returns (uint256 certificateId)
    {
        if (tons == 0) revert ZeroAmount();
        Listing storage l = listings[listingId];
        if (l.available < tons) revert InsufficientCredits(l.available, tons);
        uint256 total = l.pricePerTon * tons;
        if (total > maxTotalCost) revert PriceExceedsMax(total, maxTotalCost);

        Project storage p = projects[l.projectId];
        l.available -= tons;

        // 1. Revenue split, paid straight from buyer to each recipient. Rounding dust goes to the forest owner.
        uint256 platformAmt = (total * PLATFORM_BPS) / BPS;
        uint256 auditorAmt = (total * AUDITOR_BPS) / BPS;
        uint256 governmentAmt = (total * GOVERNMENT_BPS) / BPS;
        uint256 ownerAmt = total - platformAmt - auditorAmt - governmentAmt;

        paymentToken.safeTransferFrom(msg.sender, l.seller, ownerAmt);
        paymentToken.safeTransferFrom(msg.sender, platformWallet, platformAmt);
        paymentToken.safeTransferFrom(msg.sender, p.auditor, auditorAmt);
        paymentToken.safeTransferFrom(msg.sender, governmentWallet, governmentAmt);

        // 2. Burn from escrow. OZ v5 forbids transfer to address(0); burn() emits Transfer(this, 0x0) and cuts totalSupply.
        carbonToken.burn(tons);

        // 4. Soulbound certificate to the buyer.
        certificateId = certificate.mint(msg.sender, l.projectId, tons, p.ipfsHash);

        // 3. On-chain record. Purchase and burn share one block.timestamp.
        emit CarbonOffset(certificateId, msg.sender, l.projectId, listingId, tons, total, p.ipfsHash, block.timestamp);
        emit RevenueSplit(certificateId, ownerAmt, platformAmt, auditorAmt, governmentAmt);
    }

    /// @notice Burns credits the caller holds (e.g. a forest owner offsetting its own emissions) and mints a
    ///         soulbound certificate. Only the project's forest owner can retire against it, so certificates
    ///         stay attributable to the project that issued the credits. Caller must approve `tons` first.
    /// @dev Emits CarbonOffset with listingId 0 and totalPaid 0 so indexers treat it like any retirement.
    function retire(uint256 projectId, uint256 tons) external nonReentrant returns (uint256 certificateId) {
        if (tons == 0) revert ZeroAmount();
        Project storage p = projects[projectId];
        if (!p.registered) revert UnknownProject();
        if (msg.sender != p.forestOwner) revert NotForestOwner();

        carbonToken.burnFrom(msg.sender, tons);
        certificateId = certificate.mint(msg.sender, projectId, tons, p.ipfsHash);
        emit CarbonOffset(certificateId, msg.sender, projectId, 0, tons, 0, p.ipfsHash, block.timestamp);
    }

    function _setWallets(address platformWallet_, address governmentWallet_) private {
        if (platformWallet_ == address(0) || governmentWallet_ == address(0)) revert ZeroAddress();
        platformWallet = platformWallet_;
        governmentWallet = governmentWallet_;
        emit WalletsUpdated(platformWallet_, governmentWallet_);
    }
}
