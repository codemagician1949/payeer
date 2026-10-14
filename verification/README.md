# Verifying the contracts on explorer.arc.io

Everything needed to verify the four deployed contracts is in this folder. It has to be done
through the explorer's web form rather than `forge verify-contract`: explorer.arc.io sits behind
a Cloudflare managed challenge, which answers any API call — from foundry or curl alike — with a
JavaScript challenge page instead of JSON. A browser passes that challenge; a CLI cannot.

Go to the contract's page on [explorer.arc.io](https://explorer.arc.io), then
**Contract → Verify & Publish → Solidity (Standard JSON Input)**.

## Settings, the same for all four

| | |
|---|---|
| Compiler | `v0.8.28` |
| Optimization | Enabled, **200** runs |
| License | MIT |

## What to upload

### Payeer implementation — `0x97F5F01F1DC69cf96fd86Ef667cD0A6B80C7CD0F`
`payeer-impl.json` · contract name `Payeer` · no constructor arguments

### Pacts implementation — `0x13118d23439A823718Df202B37A0b1DeD931a108`
`pacts-impl.json` · contract name `Pacts` · no constructor arguments

### Payeer proxy — `0xa2D77721d840f5205Cede13523135605c5244FFA`
`erc1967proxy.json` · contract name `ERC1967Proxy` · constructor arguments from
`payeer-proxy-ctor-args.txt`

### Pacts proxy — `0x263d7d3eEEC65F24D815c119881624Fed6C9d032`
`erc1967proxy.json` · contract name `ERC1967Proxy` · constructor arguments from
`pacts-proxy-ctor-args.txt`

## Order, and what you can skip

Verify the **implementations first**. Blockscout recognises the ERC-1967 storage slot, so once an
implementation is verified it usually links the proxy to it on its own and shows the real
read/write methods on the proxy's page — which is the thing anyone actually wants. The proxy
entries above are there if that linking doesn't happen; they are stock OpenZeppelin and prove
nothing about Payeer's own code.

The constructor arguments are the implementation address plus the encoded `initialize` call, which
is how deploy and initialisation happened in one transaction. They were derived from the addresses
in `contracts/broadcast/Deploy.s.sol/5042/run-latest.json` and their selectors (`0x485cc955` for
Payeer, `0xc0c53b8b` for Pacts) match that record.

## Regenerating any of this

```bash
cd contracts
forge verify-contract <address> src/Payeer.sol:Payeer --show-standard-json-input > out.json
```
