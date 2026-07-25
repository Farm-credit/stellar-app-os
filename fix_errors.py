import re

with open("contracts/harvesta-errors/src/lib.rs", "r") as f:
    text = f.read()

# Revert HarvestaError
text = text.replace("    PlantingTimeoutNotReached = 91,\n    TokenAlreadyMinted = 93,\n    TokenNotFound = 94,\n    MetadataMismatch = 95,\n}", "    PlantingTimeoutNotReached = 91,\n}")

# Ensure GovernanceError is there
if "pub enum GovernanceError" not in text:
    text += """
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum GovernanceError {
    NotAdmin = 1,
}
"""

if "pub enum NftError" not in text:
    text += """
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NftError {
    TokenAlreadyMinted = 1,
    TokenNotFound = 2,
    MetadataMismatch = 3,
}
"""

with open("contracts/harvesta-errors/src/lib.rs", "w") as f:
    f.write(text)

with open("contracts/nft-certificate/src/lib.rs", "r") as f:
    nft_text = f.read()

nft_text = nft_text.replace("HarvestaError::TokenAlreadyMinted", "NftError::TokenAlreadyMinted")
nft_text = nft_text.replace("HarvestaError::TokenNotFound", "NftError::TokenNotFound")
nft_text = nft_text.replace("HarvestaError::MetadataMismatch", "NftError::MetadataMismatch")

if "NftError" not in nft_text:
    nft_text = nft_text.replace("use harvesta_errors::HarvestaError;", "use harvesta_errors::{HarvestaError, NftError};")

with open("contracts/nft-certificate/src/lib.rs", "w") as f:
    f.write(nft_text)
