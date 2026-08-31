with open('contracts/tree-escrow/src/lib.rs', 'r') as f:
    content = f.read()

content = content.replace(
    "client.initialize(&Address::generate(&env), &tree_token, &Address::generate(&env));",
    "client.initialize(&Address::generate(&env), &tree_token, &Address::generate(&env), &Address::generate(&env), &Address::generate(&env));"
)

with open('contracts/tree-escrow/src/lib.rs', 'w') as f:
    f.write(content)

try:
    with open('contracts/escrow-milestone/src/lib.rs', 'r') as f:
        content_ms = f.read()
    
    content_ms = content_ms.replace(
        "client.initialize(&admin, &amm);",
        "client.initialize(&admin, &amm, &Address::generate(&env), &Address::generate(&env));"
    )
    with open('contracts/escrow-milestone/src/lib.rs', 'w') as f:
        f.write(content_ms)
except:
    pass
