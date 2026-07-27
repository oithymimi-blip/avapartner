// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./Forwarder.sol";

/**
 * @title ForwarderFactory
 * @dev Factory to deploy minimal proxy clones of the Forwarder contract.
 */
contract ForwarderFactory {
    address public implementation;
    address public owner;

    event ForwarderCreated(address indexed forwarderAddress, uint256 indexed userId);

    constructor(address _implementation) {
        require(_implementation != address(0), "Invalid implementation");
        implementation = _implementation;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /**
     * @dev Creates a new Forwarder clone for a specific user.
     * @param _userId The ID of the user (from the backend database) to associate with this address.
     * @param _hotWallet The central wallet where funds will be forwarded.
     * @return clone The address of the new Forwarder clone.
     */
    function createForwarder(uint256 _userId, address _hotWallet) external onlyOwner returns (address clone) {
        clone = Clones.clone(implementation);
        Forwarder(payable(clone)).initialize(_hotWallet, owner);
        
        emit ForwarderCreated(clone, _userId);
    }
}
