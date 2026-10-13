/**
 * Approve AccountCore, deposit to the owner's root account, read account id.
 * Kuru test USDC is admin-minted; there is no public faucet.
 *
 * Dry-run (no key, no broadcast):
 *   DEPLOYER_ADDRESS=0x... node packages/sdk/scripts/kuruAccount.mjs
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
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildApproveErc20Request,
  buildAuthorizeAccountSignerRequest,
  buildDepositToOwnerRequest,
} from "@toxicflow-labs/ts-sdk/account";
import { accountCoreAbi } from "@toxicflow-labs/ts-sdk/abi";

const chain = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
};

const usdc = "0xb01DC575a7ef75e58A05D2bde73ab79f8e7dd0Be";
const accountCore = "0xe08573a1Ecc4aa507c9626071fA0c4513caf7906";
const amount = BigInt(process.env.DEPOSIT_AMOUNT ?? "1000000000");
const key = process.env.DEPLOYER_PRIVATE_KEY;
const owner = key
  ? privateKeyToAccount(key).address
  : (process.env.DEPLOYER_ADDRESS ?? zeroAddress);

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

const approve = encode(
  buildApproveErc20Request({ token: usdc, spender: accountCore, amount }),
);
const deposit = encode(
  buildDepositToOwnerRequest({ accountCore, rootOwner: owner, token: usdc, amount }),
);

const rpc = process.env.MONAD_RPC_URL ?? chain.rpcUrls.default.http[0];

function printable(call) {
  return { to: call.to, data: call.data, value: call.value.toString() };
}

if (!process.argv.includes("--broadcast")) {
  console.log(
    JSON.stringify(
      {
        approve: printable(approve),
        deposit: printable(deposit),
      },
      null,
      2,
    ),
  );
  console.log(
    "account id is AccountCore.rootAccountIdOf(owner) after the deposit confirms",
  );
  console.log(
    "TRADE-only signer: read ACCOUNT_PERMISSION_TRADE, then authorizeAccountSigner with that bit",
  );
} else {
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY is required to broadcast");
  const account = privateKeyToAccount(key);
  const transport = http(rpc);
  const wallet = createWalletClient({ account, chain, transport });
  const pub = createPublicClient({ chain, transport });

  for (const call of [approve, deposit]) {
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
    functionName: "rootAccountIdOf",
    args: [account.address],
  });
  console.log("accountId", accountId.toString());
}
