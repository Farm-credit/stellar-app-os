import re

with open("contracts/tree-token/src/lib.rs", "r") as f:
    text = f.read()

text = text.replace("TreeTokenError::NonceAlreadyUsed", "HarvestaError::NonceAlreadyUsed")

my_addition = """#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TreeTokenError {
    NonceAlreadyUsed = 1,
}
"""

if text.endswith(my_addition):
    text = text[:-len(my_addition)]

with open("contracts/tree-token/src/lib.rs", "w") as f:
    f.write(text)

with open("contracts/harvesta-errors/src/lib.rs", "r") as f:
    text = f.read()

if "NonceAlreadyUsed" not in text:
    text = text.replace("}\n\n#[contracterror]\n#[derive", "    NonceAlreadyUsed = 93,\n}\n\n#[contracterror]\n#[derive")

with open("contracts/harvesta-errors/src/lib.rs", "w") as f:
    f.write(text)
