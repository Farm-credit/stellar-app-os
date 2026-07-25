import re

# 1. nft-certificate
with open("contracts/nft-certificate/src/lib.rs", "r") as f:
    text = f.read()

if "NftError" not in text[:200]:
    if "use harvesta_errors::HarvestaError;" in text:
        text = text.replace("use harvesta_errors::HarvestaError;", "use harvesta_errors::{HarvestaError, NftError};")
    else:
        text = text.replace("use harvesta_errors", "use harvesta_errors::{NftError, HarvestaError};\nuse harvesta_errors")
        if "use harvesta_errors" not in text:
            text = "use harvesta_errors::NftError;\n" + text

with open("contracts/nft-certificate/src/lib.rs", "w") as f:
    f.write(text)

# 2. tree-registry
with open("contracts/tree-registry/src/lib.rs", "r") as f:
    text = f.read()

text = text.replace("HarvestaError::NotFound", "HarvestaError::TreeNotRegistered")
text = text.replace("HarvestaError::NotAuthorized", "HarvestaError::Unauthorized")
text = text.replace("HarvestaError::InvalidStatus", "TreeRegistryError::InvalidStatus")

if "pub enum TreeRegistryError" not in text:
    text += """
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TreeRegistryError {
    InvalidStatus = 1,
}
"""

with open("contracts/tree-registry/src/lib.rs", "w") as f:
    f.write(text)

# 3. tree-token
with open("contracts/tree-token/src/lib.rs", "r") as f:
    text = f.read()

if "use soroban_sdk::xdr::ToXdr;" not in text:
    text = text.replace("use soroban_sdk::{", "use soroban_sdk::xdr::ToXdr;\nuse soroban_sdk::{")

text = text.replace("HarvestaError::NonceAlreadyUsed", "TreeTokenError::NonceAlreadyUsed")

if "pub enum TreeTokenError" not in text:
    text += """
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TreeTokenError {
    NonceAlreadyUsed = 1,
}
"""

with open("contracts/tree-token/src/lib.rs", "w") as f:
    f.write(text)

