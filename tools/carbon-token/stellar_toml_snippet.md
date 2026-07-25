Example `stellar.toml` snippet to list the token under `[[CURRENCIES]]`.

Replace the `issuer` value with your issuer public key and set `desc`/`conditions` to point to verification documentation.

[[CURRENCIES]]
code = "CO2KG"
issuer = "G...ISSUERPUB..."
display_decimals = 0
name = "Verified CO2 Offset (kg)"
desc = "Each token represents 1 kg of verified CO2 offset. Verification: https://example.org/certs/CO2-offset-123"
conditions = "Transferable; see verification URL for certificate"
status = "active"
image = "https://example.org/logo.png"
