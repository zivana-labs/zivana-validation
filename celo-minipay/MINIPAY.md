# MiniPay SDK & Phone-Number Transfers

How this splitter meets MiniPay, and how phone-number-based stablecoin payments work. MiniPay is
Opera Mini's built-in Celo wallet: it uses **phone numbers as identifiers**, settles in stablecoins,
and pays **gas in the stablecoin** (sub-cent fees), so users never hold CELO.

## 1. Detect MiniPay and connect

MiniPay injects a standard EIP-1193 provider on `window.ethereum` with an `isMiniPay` flag. A dApp
opened inside MiniPay should auto-connect (no connect button) and hide external-wallet options.

```ts
import { createWalletClient, custom } from "viem";
import { celo } from "viem/chains"; // use a Celo Sepolia chain def for testnet

function getMiniPayClient() {
  const eth = (globalThis as any).window?.ethereum;
  if (!eth?.isMiniPay) return null; // not running inside MiniPay
  return createWalletClient({ chain: celo, transport: custom(eth) });
}
```

wagmi equivalent: use the injected connector and auto-connect when `window.ethereum.isMiniPay` is true.

## 2. Pay gas in the stablecoin (feeCurrency)

MiniPay accounts hold no CELO. On Celo you pass `feeCurrency` (the stablecoin token address) so gas is
charged in that token. With viem's Celo transport you can set `feeCurrency` on the transaction; MiniPay
handles this natively for its supported stablecoins (cUSD/USDC/USDT on mainnet).

## 3. Calling this contract from MiniPay

The `CusdPaySplitter` flow is unchanged inside MiniPay — it's the same two ERC-20 steps:

1. `approve(splitter, amount)` on the stablecoin token
2. `deposit(amount)` on the splitter
3. (owner) `distribute(recipients, amounts)`

MiniPay will prompt the user to sign each; gas is deducted in the stablecoin. See REPORT.md §6 for
collapsing approve+deposit via EIP-2612 `permit`.

## 4. Phone-number transfers (SocialConnect)

MiniPay's headline UX is "send to a phone number". Under the hood Celo's **SocialConnect** maps a
phone number to a wallet address via **federated attestations** resolved through **ODIS** (Oblivious
Decentralized Identifier Service, which blinds the phone number for privacy):

1. Sender enters a phone number.
2. The app queries ODIS/SocialConnect for the on-chain address attested to that number.
3. If found → a normal stablecoin `transfer` to that address (this contract's `distribute` is the
   batch version).
4. If not found → MiniPay falls back to an invite/escrow flow so funds are claimable once the
   recipient onboards.

For batch covenant payouts, resolve each participant's phone number to an address first, then pass the
resolved addresses to `distribute(...)`.

## 5. Testnet limitation (important)

MiniPay is a **mainnet-first consumer product**; there is no shipping consumer testnet build. For
VAL-006 evidence:

- **Contract validation** → Celo Sepolia (this repo).
- **MiniPay UX evidence** → either the MiniPay in-app **dApp tester** (Opera Mini → MiniPay → site
  settings → load your test dApp), or **Valora logs** (accepted by the acceptance criteria), or a
  tiny **mainnet** send to demonstrate the real phone-number flow.

## References

- Celo MiniPay docs: https://docs.celo.org/build/build-on-minipay/overview
- SocialConnect: https://docs.celo.org (search "SocialConnect")
- viem Celo support: https://viem.sh
