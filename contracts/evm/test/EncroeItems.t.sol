// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {EncroeItems} from "../src/EncroeItems.sol";

contract EncroeItemsTest is Test {
    string constant ESCROW = "orchard.encroe.testnet";
    bytes32 constant PLAYER = 0x0707070707070707070707070707070707070707070707070707070707070707;
    address constant TO = address(0xbb);
    uint256 constant MPC_KEY = 0xA11CE;

    function ids() internal pure returns (uint32[] memory a) {
        a = new uint32[](2);
        a[0] = 1;
        a[1] = 3;
    }

    function amounts() internal pure returns (uint32[] memory a) {
        a = new uint32[](2);
        a[0] = 120;
        a[1] = 48;
    }

    function deployAt(address at, address signer) internal returns (EncroeItems) {
        deployCodeTo("EncroeItems.sol:EncroeItems", abi.encode(signer), at);
        return EncroeItems(at);
    }

    /// contracts/encroe-items `claim_digest_is_eip712`: the same claim, the same digest, computed on NEAR.
    function test_digest_is_the_one_NEAR_signs() public {
        vm.chainId(84532);
        EncroeItems t = deployAt(address(0xaa), address(1));
        assertEq(
            t.claimDigest(ESCROW, 1, PLAYER, TO, ids(), amounts()),
            0x5ef45b10eebc51b18e5c7667433e71aebf3fcc376fc873267891a4acf9dce870
        );
    }

    function signed(EncroeItems t, uint256 key, uint32[] memory amts)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        return vm.sign(key, t.claimDigest(ESCROW, 1, PLAYER, TO, ids(), amts));
    }

    function test_mints_a_signed_claim_once() public {
        EncroeItems t = new EncroeItems(vm.addr(MPC_KEY));
        (uint8 v, bytes32 r, bytes32 s) = signed(t, MPC_KEY, amounts());
        t.claim(ESCROW, 1, PLAYER, TO, ids(), amounts(), v, r, s);
        assertEq(t.balanceOf(TO, t.tokenId(ESCROW, 1)), 120);
        assertEq(t.balanceOf(TO, t.tokenId(ESCROW, 3)), 48);
        assertEq(t.tokenId(ESCROW, 3) & 0xffffffff, 3);
        vm.expectRevert("already claimed");
        t.claim(ESCROW, 1, PLAYER, TO, ids(), amounts(), v, r, s);
    }

    function test_refuses_any_other_signer() public {
        EncroeItems t = new EncroeItems(vm.addr(MPC_KEY));
        (uint8 v, bytes32 r, bytes32 s) = signed(t, 0xB0B, amounts());
        vm.expectRevert("not signed by encroe-items' MPC key");
        t.claim(ESCROW, 1, PLAYER, TO, ids(), amounts(), v, r, s);
    }

    function test_refuses_a_claim_changed_after_signing() public {
        EncroeItems t = new EncroeItems(vm.addr(MPC_KEY));
        (uint8 v, bytes32 r, bytes32 s) = signed(t, MPC_KEY, amounts());
        uint32[] memory more = amounts();
        more[0] = 9999;
        vm.expectRevert("not signed by encroe-items' MPC key");
        t.claim(ESCROW, 1, PLAYER, TO, ids(), more, v, r, s);
    }

    function test_tokens_move_like_any_erc1155() public {
        EncroeItems t = new EncroeItems(vm.addr(MPC_KEY));
        (uint8 v, bytes32 r, bytes32 s) = signed(t, MPC_KEY, amounts());
        t.claim(ESCROW, 1, PLAYER, TO, ids(), amounts(), v, r, s);
        uint256 id = t.tokenId(ESCROW, 1);
        vm.expectRevert("not approved");
        t.safeTransferFrom(TO, address(0xcc), id, 20, "");
        vm.prank(TO);
        t.safeTransferFrom(TO, address(0xcc), id, 20, "");
        assertEq(t.balanceOf(address(0xcc), id), 20);
        assertEq(t.balanceOf(TO, id), 100);
        assertTrue(t.supportsInterface(0xd9b67a26));
    }
}
