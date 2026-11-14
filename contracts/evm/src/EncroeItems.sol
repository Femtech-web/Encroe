// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC1155Receiver {
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        returns (bytes4);
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4);
}

/// @title EncroeItems: a released game's items, as ERC-1155 tokens their players hold on this chain.
/// @notice Mints only what NEAR's MPC network signed with the key it derives for the `encroe-items` contract (NEAR
/// Chain Signatures). That contract signs a claim only for a player whose items are under a released Encroe escrow's
/// committed root, and only once. Nobody holds the signer's key; anyone may relay a signed claim.
contract EncroeItems {
    /// The MPC-derived address of `encroe-items` on NEAR, path `encroe/items/1`.
    address public immutable signer;
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(bytes32 escrow,uint64 epoch,bytes32 player,address to,bytes32 items)");

    /// keccak256(escrow, player) => claimed
    mapping(bytes32 => bool) public claimed;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => mapping(address => uint256)) private _balances;

    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event TransferBatch(
        address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values
    );
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event Claimed(string escrow, uint64 epoch, bytes32 indexed player, address indexed to);

    constructor(address signer_) {
        signer = signer_;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Encroe Items"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /// A game's item as a token id: the escrow's hash, its low 32 bits replaced by the game's own item id.
    function tokenId(string memory escrow, uint32 item) public pure returns (uint256) {
        return (uint256(keccak256(bytes(escrow))) & ~uint256(0xffffffff)) | item;
    }

    function claimDigest(
        string calldata escrow,
        uint64 epoch,
        bytes32 player,
        address to,
        uint32[] calldata ids,
        uint32[] calldata amounts
    ) public view returns (bytes32) {
        bytes32 items = keccak256(abi.encodePacked(ids, amounts));
        bytes32 strukt = keccak256(abi.encode(CLAIM_TYPEHASH, keccak256(bytes(escrow)), epoch, player, to, items));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, strukt));
    }

    /// Mints a player's items to `to`, once, if NEAR's MPC network signed exactly this claim.
    function claim(
        string calldata escrow,
        uint64 epoch,
        bytes32 player,
        address to,
        uint32[] calldata ids,
        uint32[] calldata amounts,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(ids.length > 0 && ids.length <= 16 && ids.length == amounts.length, "1 to 16 kinds of item");
        bytes32 key = keccak256(abi.encode(keccak256(bytes(escrow)), player));
        require(!claimed[key], "already claimed");
        address got = ecrecover(claimDigest(escrow, epoch, player, to, ids, amounts), v, r, s);
        require(got != address(0) && got == signer, "not signed by encroe-items' MPC key");
        claimed[key] = true;
        uint256[] memory tokenIds = new uint256[](ids.length);
        uint256[] memory values = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            tokenIds[i] = tokenId(escrow, ids[i]);
            values[i] = amounts[i];
            _balances[tokenIds[i]][to] += amounts[i];
        }
        emit TransferBatch(msg.sender, address(0), to, tokenIds, values);
        emit Claimed(escrow, epoch, player, to);
        _checkBatch(msg.sender, address(0), to, tokenIds, values, "");
    }

    // ---------- ERC-1155 ----------

    function balanceOf(address account, uint256 id) public view returns (uint256) {
        return _balances[id][account];
    }

    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory out)
    {
        require(accounts.length == ids.length, "length mismatch");
        out = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            out[i] = _balances[ids[i]][accounts[i]];
        }
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data) external {
        require(from == msg.sender || isApprovedForAll[from][msg.sender], "not approved");
        require(to != address(0), "to the zero address");
        _balances[id][from] -= value;
        _balances[id][to] += value;
        emit TransferSingle(msg.sender, from, to, id, value);
        if (to.code.length > 0) {
            require(
                IERC1155Receiver(to).onERC1155Received(msg.sender, from, id, value, data)
                    == IERC1155Receiver.onERC1155Received.selector,
                "receiver refused"
            );
        }
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external {
        require(from == msg.sender || isApprovedForAll[from][msg.sender], "not approved");
        require(to != address(0), "to the zero address");
        require(ids.length == values.length, "length mismatch");
        for (uint256 i = 0; i < ids.length; i++) {
            _balances[ids[i]][from] -= values[i];
            _balances[ids[i]][to] += values[i];
        }
        emit TransferBatch(msg.sender, from, to, ids, values);
        _checkBatch(msg.sender, from, to, ids, values, data);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0xd9b67a26; // ERC-165, ERC-1155
    }

    function _checkBatch(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values,
        bytes memory data
    ) private {
        if (to.code.length == 0) return;
        require(
            IERC1155Receiver(to).onERC1155BatchReceived(operator, from, ids, values, data)
                == IERC1155Receiver.onERC1155BatchReceived.selector,
            "receiver refused"
        );
    }
}
