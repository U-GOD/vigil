/**
 * Faucet USDC, approve AccountCore, deposit, read account id.
 *
 * Dry-run (no key, no broadcast):
 *   node packages/sdk/scripts/kuruAccount.mjs
 *
 * Broadcast (needs MON for gas):
 *   node packages/sdk/scripts/kuruAccount.mjs --broadcast
 *
 * Calldata comes from @toxicflow-labs/ts-sdk. The plugin wrappers in
 * src/kuru/account.ts are tested to produce the same bytes.
 */
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildApproveErc20Request,
  buildAuthorizeAccountSignerRequest,
  buildDepositRequest,
} from "@toxicflow-labs/ts-sdk/account";
import { accountCoreAbi } from "@toxicflow-labs/ts-sdk/abi";

const chain = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
};

const faucet = "0x25B1416FcD3400bE2D8F50bbe7Cf1101b8B891E9";
const usdc = "0xEe0722ead54f1B4fe97bE399Be43BC0226a6f97E";
const accountCore = "0x6384e9b2Bf3b65e1535403a0A543b5FDA905eE22";
const amount = BigInt(process.env.DEPOSIT_AMOUNT ?? "1000000000");

const faucetAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
];

function encode(request) {
  return {
    to: request.address,
    data: encodeFunctionData({
      abi: request.abi,
      functionName: request.functionName,
      args: request.args,
    }),
    value: request.value ?? 0n,
  };
}

const claim = {
  to: faucet,
  data: encodeFunctionData({ abi: faucetAbi, functionName: "claim" }),
  value: 0n,
};
const approve = encode(
  buildApproveErc20Request({ token: usdc, spender: accountCore, amount }),
);
const deposit = encode(
  buildDepositRequest({ accountCore, token: usdc, amount }),
);

const rpc = process.env.MONAD_RPC_URL ?? chain.rpcUrls.default.http[0];

function printable(call) {
  return { to: call.to, data: call.data, value: call.value.toString() };
}

if (!process.argv.includes("--broadcast")) {
  console.log(
    JSON.stringify(
      {
        claim: printable(claim),
        approve: printable(approve),
        deposit: printable(deposit),
      },
      null,
      2,
    ),
  );
  console.log(
    "account id is AccountCore.userRegistry(deployer) after the deposit confirms",
  );
  console.log(
    "TRADE-only signer: read ACCOUNT_PERMISSION_TRADE, then authorizeAccountSigner with that bit",
  );
} else {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY is required to broadcast");
  const account = privateKeyToAccount(key);
  const transport = http(rpc);
  const wallet = createWalletClient({ account, chain, transport });
  const pub = createPublicClient({ chain, transport });

  for (const call of [claim, approve, deposit]) {
    const hash = await wallet.sendTransaction({
      to: call.to,
      data: call.data,
      value: call.value,
    });
    console.log(hash);
    await pub.waitForTransactionReceipt({ hash });
  }

  const signer = process.env.TRADE_SIGNER;
  if (signer) {
    const permission = await pub.readContract({
      address: accountCore,
      abi: accountCoreAbi,
      functionName: "ACCOUNT_PERMISSION_TRADE",
    });
    const expiry = BigInt(process.env.SIGNER_EXPIRY ?? "0");
    const auth = encode(
      buildAuthorizeAccountSignerRequest({
        accountCore,
        account: account.address,
        signer,
        permissions: Number(permission),
        expiry,
      }),
    );
    const hash = await wallet.sendTransaction({
      to: auth.to,
      data: auth.data,
      value: auth.value,
    });
    console.log(hash);
    await pub.waitForTransactionReceipt({ hash });
  }

  const accountId = await pub.readContract({
    address: accountCore,
    abi: accountCoreAbi,
    functionName: "userRegistry",
    args: [account.address],
  });
  console.log("accountId", accountId.toString());
}
