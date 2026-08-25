import re

with open("contracts/tree-registry/src/lib.rs", "r") as f:
    text = f.read()

text = text.replace("HarvestaError::NotAuthorized", "HarvestaError::Unauthorized")
text = text.replace("HarvestaError::TreeNotFound", "HarvestaError::TreeNotRegistered")

if "pub enum TreeRegistryError" not in text:
    text += """
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TreeRegistryError {
    InvalidStatus = 1,
}
"""
    text = text.replace("HarvestaError::InvalidStatus", "TreeRegistryError::InvalidStatus")
    if "TreeRegistryError" not in text[:200]:
        text = text.replace("use harvesta_errors::HarvestaError;", "use harvesta_errors::HarvestaError;\nuse crate::TreeRegistryError;")

with open("contracts/tree-registry/src/lib.rs", "w") as f:
    f.write(text)
