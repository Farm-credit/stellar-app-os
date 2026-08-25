import re

# 1. admin-controls / harvesta-errors
with open("contracts/harvesta-errors/src/lib.rs", "r") as f:
    text = f.read()

gov_err = """pub enum GovernanceError {
    NotAdmin = 1,
    MinimumOneSignerRequired = 2,
    ThresholdMustBePositive = 3,
    ThresholdTooHigh = 4,
    MultisigNotInitialized = 5,
    NotASigner = 6,
    ProposalNotFound = 7,
    ProposalAlreadyExecuted = 8,
    AlreadyApproved = 9,
    SignerAlreadyExists = 10,
    SignerNotFound = 11,
}"""

if "MinimumOneSignerRequired" not in text:
    text = re.sub(r'pub enum GovernanceError \{[^}]*\}', gov_err, text)

with open("contracts/harvesta-errors/src/lib.rs", "w") as f:
    f.write(text)

# 2. tree-registry
with open("contracts/tree-registry/src/lib.rs", "r") as f:
    text = f.read()

# I added a duplicate TreeRegistryError at the end of the file
# Let's remove my added TreeRegistryError
# It looks like:
# #[contracterror]
# #[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
# #[repr(u32)]
# pub enum TreeRegistryError {
#     InvalidStatus = 1,
# }

my_addition = """#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TreeRegistryError {
    InvalidStatus = 1,
}
"""

if text.endswith(my_addition):
    text = text[:-len(my_addition)]

if "use crate::TreeRegistryError;" in text:
    text = text.replace("use crate::TreeRegistryError;\n", "")

with open("contracts/tree-registry/src/lib.rs", "w") as f:
    f.write(text)

