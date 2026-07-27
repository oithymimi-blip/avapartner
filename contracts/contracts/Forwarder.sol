// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Forwarder
 * @dev A simple contract that receives BNB or tokens and allows the owner or hot wallet to flush them.
 * This contract is intended to be cloned using EIP-1167 Minimal Proxies.
 */
contract Forwarder {
    address public hotWallet;
    address public owner;
    bool private initialized;

    event Flushed(address indexed token, uint256 amount);
    event Deposited(address indexed sender, uint256 amount);

    /**
     * @dev Sets the initial configuration. Replaces constructor for EIP-1167 clones.
     * @param _hotWallet The address where funds will be forwarded.
     * @param _owner The address that manages this forwarder (factory or admin).
     */
    function initialize(address _hotWallet, address _owner) external {
        require(!initialized, "Already initialized");
        require(_hotWallet != address(0), "Invalid hot wallet");
        hotWallet = _hotWallet;
        owner = _owner;
        initialized = true;
    }

    /**
     * @dev Allows the contract to receive BNB. Emits an event.
     */
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @dev Flushes the entire BNB balance of this contract to the hot wallet.
     */
    function flushBNB() external {
        require(msg.sender == owner || msg.sender == hotWallet, "Not authorized");
        uint256 balance = address(this).balance;
        require(balance > 0, "No BNB to flush");

        (bool success, ) = hotWallet.call{value: balance}("");
        require(success, "BNB transfer failed");

        emit Flushed(address(0), balance);
    }

    /**
     * @dev Flushes the entire balance of a specific ERC20 token to the hot wallet.
     * @param _token The address of the ERC20 token to flush.
     */
    function flushToken(address _token) external {
        require(msg.sender == owner || msg.sender == hotWallet, "Not authorized");
        IERC20 token = IERC20(_token);
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No tokens to flush");

        require(token.transfer(hotWallet, balance), "Token transfer failed");

        emit Flushed(_token, balance);
    }
}
