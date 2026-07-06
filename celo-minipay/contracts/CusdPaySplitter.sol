// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @dev Minimal ERC-20 surface used by the splitter.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// @title CusdPaySplitter
/// @notice Stablecoin (ERC-20) version of PaySplitter. Owner funds the contract with a
///         stablecoin and distributes it to many recipients in one call — the on-chain half of a
///         Zivana covenant distribution settled on Celo.
/// @dev Token-agnostic: the token is fixed at construction. On Celo Sepolia use USDC
///      (0x01C5C0122039549AD1493B8220cABEdD739BC44E) or Mento USDm
///      (0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b). On Celo mainnet this is cUSD.
///      Classic cUSD is NOT deployed on the Celo Sepolia testnet — see REPORT.md.
contract CusdPaySplitter {
    address public owner;
    IERC20 public immutable token;

    /// @notice Cumulative amount each address has deposited (bookkeeping only).
    mapping(address => uint256) public deposited;

    event Deposited(address indexed from, uint256 amount);
    event Distributed(address indexed to, uint256 amount);

    /// @param _token Address of the ERC-20 stablecoin to split (e.g. USDC/USDm/cUSD).
    constructor(address _token) {
        require(_token != address(0), "token is zero");
        owner = msg.sender;
        token = IERC20(_token);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    /// @notice Pull `amount` of the stablecoin from the caller into the contract.
    /// @dev Caller MUST `approve(address(this), amount)` on the token first (ERC-20 two-step).
    function deposit(uint256 amount) external {
        require(amount > 0, "amount is zero");
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        deposited[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @notice Owner distributes held stablecoin to `recipients` in matching `amounts`.
    function distribute(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        require(recipients.length == amounts.length, "length mismatch");
        for (uint256 i = 0; i < recipients.length; i++) {
            require(token.balanceOf(address(this)) >= amounts[i], "insufficient balance");
            require(token.transfer(recipients[i], amounts[i]), "transfer failed");
            emit Distributed(recipients[i], amounts[i]);
        }
    }

    /// @notice Current stablecoin balance held by the contract.
    function contractBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
