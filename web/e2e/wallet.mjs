/**
 * A test wallet for end-to-end runs: injects an EIP-1193 provider into the page and announces it
 * the EIP-6963 way, so Reown AppKit lists it like any browser wallet. Requests are forwarded to
 * Node, where viem signs with a real key and talks to Arc mainnet.
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";

export async function installWallet(page, privateKey, { name = "Test Wallet" } = {}) {
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({ account, chain: arc, transport: http() });
  const publicClient = createPublicClient({ chain: arc, transport: http() });

  await page.exposeFunction("__walletRpc", async ({ method, params = [] }) => {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return `0x${arc.id.toString(16)}`;
      case "net_version":
        return String(arc.id);
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
        return null;
      case "personal_sign": {
        const [message] = params; // hex message
        return wallet.signMessage({ message: { raw: message } });
      }
      case "eth_sendTransaction": {
        const [tx] = params;
        return wallet.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : undefined,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
        });
      }
      default:
        return publicClient.request({ method, params });
    }
  });

  await page.addInitScript(
    ({ address, name }) => {
      const listeners = {};
      const provider = {
        isMetaMask: true,
        request: (args) => window.__walletRpc({ method: args.method, params: args.params ?? [] }),
        on: (event, handler) => ((listeners[event] ??= []).push(handler), provider),
        removeListener: () => provider,
        selectedAddress: address,
      };
      window.ethereum = provider;

      const info = {
        uuid: "11111111-2222-3333-4444-555555555555",
        name,
        rdns: "dev.payeer.testwallet",
        icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
      };
      const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { address: account.address, name },
  );

  return account;
}
