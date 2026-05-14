// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract PaySplitter {
    address public owner;
    mapping(address => uint256) public balances;

    constructor() {
        owner = msg.sender;
    }

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function distribute(address payable[] memory recipients, uint256[] memory amounts) public {
        require(msg.sender == owner, "only owner");
        require(recipients.length == amounts.length, "length mismatch");
        for (uint i = 0; i < recipients.length; i++) {
            require(address(this).balance >= amounts[i], "insufficient balance");
            recipients[i].transfer(amounts[i]);
        }
    }

    receive() external payable {}
}
