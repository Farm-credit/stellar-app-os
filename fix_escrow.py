import re

with open("contracts/escrow-milestone/src/lib.rs", "r") as f:
    text = f.read()

text = text.replace("HarvestaError::ValueMustBePositive", "HarvestaError::AmountMustBePositive")
text = text.replace("HarvestaError::VerifierAlreadyRegistered", "EscrowMilestoneError::VerifierAlreadyRegistered")
text = text.replace("HarvestaError::NotAVerifier", "EscrowMilestoneError::NotAVerifier")
text = text.replace("HarvestaError::AlreadyVoted", "EscrowMilestoneError::AlreadyVoted")
text = text.replace("HarvestaError::MilestoneReleaseBlocked", "EscrowMilestoneError::MilestoneReleaseBlocked")

if "pub enum EscrowMilestoneError" not in text:
    text += """
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowMilestoneError {
    VerifierAlreadyRegistered = 1,
    NotAVerifier = 2,
    AlreadyVoted = 3,
    MilestoneReleaseBlocked = 4,
}
"""
    if "EscrowMilestoneError" not in text[:200]:
        text = text.replace("use harvesta_errors::HarvestaError;", "use harvesta_errors::HarvestaError;\nuse crate::EscrowMilestoneError;")
        if "use crate::EscrowMilestoneError;" not in text:
            text = "use crate::EscrowMilestoneError;\n" + text

with open("contracts/escrow-milestone/src/lib.rs", "w") as f:
    f.write(text)

