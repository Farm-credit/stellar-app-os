import re

with open("contracts/carbon-marketplace/src/lib.rs", "r") as f:
    text = f.read()

text = text.replace("MarketplaceError::", "HarvestaError::")

with open("contracts/carbon-marketplace/src/lib.rs", "w") as f:
    f.write(text)
