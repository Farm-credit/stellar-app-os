with open('contracts/escrow-milestone/src/lib.rs', 'r') as f:
    content = f.read()

content = content.replace(
    "client.initialize(&Address::generate(&env), &Address::generate(&env));",
    "client.initialize(&Address::generate(&env), &Address::generate(&env), &Address::generate(&env), &Address::generate(&env));"
)

with open('contracts/escrow-milestone/src/lib.rs', 'w') as f:
    f.write(content)
