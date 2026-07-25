const StellarSdk = require('stellar-sdk');
const fetch = global.fetch || require('node-fetch');

// Simple minting script for Stellar testnet.
// Usage:
//   node mint.js <recipient_public_key> <amount>
// If recipient_public_key is omitted the script will create and fund a new keypair and print the secret.

const HORIZON = 'https://horizon-testnet.stellar.org';
const FRIENDBOT = 'https://friendbot.stellar.org';

const server = new StellarSdk.Server(HORIZON);
StellarSdk.Networks.useTestNetwork();

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function fundAccount(pub) {
    console.log(`Funding ${pub} via friendbot...`);
    const resp = await fetch(`${FRIENDBOT}?addr=${encodeURIComponent(pub)}`);
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Friendbot error: ${resp.status} ${text}`);
    }
    console.log(`Funded ${pub}`);
}

async function loadAccount(pub) {
    for (let i = 0; i < 5; i++) {
        try {
            return await server.loadAccount(pub);
        } catch (e) {
            await sleep(1000);
        }
    }
    return await server.loadAccount(pub);
}

async function main() {
    const args = process.argv.slice(2);
    const recipientPubArg = args[0];
    const amountArg = args[1] || '1';

    // Use ISSUER_SECRET env var if provided, otherwise create a new issuer.
    let issuerKeypair;
    if (process.env.ISSUER_SECRET) {
        issuerKeypair = StellarSdk.Keypair.fromSecret(process.env.ISSUER_SECRET);
        console.log('Using provided issuer from ISSUER_SECRET');
    } else {
        issuerKeypair = StellarSdk.Keypair.random();
        console.log('Generated new issuer account. Keep the secret safe:');
        console.log(issuerKeypair.secret());
    }

    // Recipient
    let recipientKeypair;
    if (recipientPubArg) {
        recipientKeypair = { publicKey: recipientPubArg };
    } else {
        recipientKeypair = StellarSdk.Keypair.random();
        console.log('Generated recipient keypair. Secret (store safely):');
        console.log(recipientKeypair.secret());
    }

    // Asset definition: code and issuer
    const ASSET_CODE = 'CO2KG';
    const asset = new StellarSdk.Asset(ASSET_CODE, issuerKeypair.publicKey());

    // Fund accounts via friendbot if they don't exist
    try {
        await loadAccount(issuerKeypair.publicKey());
    } catch (e) {
        await fundAccount(issuerKeypair.publicKey());
    }

    try {
        await loadAccount(recipientKeypair.publicKey);
    } catch (e) {
        if (recipientKeypair.secret) {
            await fundAccount(recipientKeypair.publicKey());
        } else {
            // recipient is an existing account on testnet; assume funded
            console.log('Recipient account exists or is an external account; skipping friendbot.');
        }
    }

    // Recipient establishes trustline
    if (recipientKeypair.secret) {
        console.log('Creating trustline for recipient...');
        const recipientAccount = await loadAccount(recipientKeypair.publicKey);
        const tx = new StellarSdk.TransactionBuilder(recipientAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: StellarSdk.Networks.TESTNET,
        })
            .addOperation(StellarSdk.Operation.changeTrust({ asset: asset, limit: '1000000000' }))
            .setTimeout(180)
            .build();
        tx.sign(StellarSdk.Keypair.fromSecret(recipientKeypair.secret));
        await server.submitTransaction(tx);
        console.log('Trustline created.');
    } else {
        console.log('Assuming recipient already has trustline or will add it externally.');
    }

    // Issuer sends the asset to recipient
    console.log(`Issuing ${amountArg} ${ASSET_CODE} to ${recipientKeypair.publicKey}...`);
    const issuerAccount = await loadAccount(issuerKeypair.publicKey());
    const payTx = new StellarSdk.TransactionBuilder(issuerAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET,
    })
        .addOperation(
            StellarSdk.Operation.payment({
                destination: recipientKeypair.publicKey,
                asset: asset,
                amount: amountArg,
            })
        )
        .setTimeout(180)
        .build();
    payTx.sign(issuerKeypair);
    const res = await server.submitTransaction(payTx);
    console.log('Issued token:', res.hash);
    console.log('Token details:');
    console.log(`  Asset code: ${ASSET_CODE}`);
    console.log(`  Issuer: ${issuerKeypair.publicKey()}`);
    console.log(`  Recipient: ${recipientKeypair.publicKey}`);
    console.log(`  Amount: ${amountArg}`);
    console.log('\nReminder: On mainnet, you must publish metadata in your domain\'s stellar.toml and provide verification documentation (certificate URL).');
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
