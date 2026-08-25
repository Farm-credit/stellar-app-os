import os
import re

files_to_process = [
    'contracts/escrow-milestone/src/lib.rs',
    'contracts/tree-escrow/src/lib.rs'
]

for filepath in files_to_process:
    with open(filepath, 'r') as f:
        content = f.read()
    
    # We want to replace the conflict markers.
    # The format is:
    # <<<<<<< HEAD
    # [HEAD content]
    # =======
    # [escrow-fix content]
    # >>>>>>> escrow-fix
    
    def replacer(match):
        head_content = match.group(1)
        fix_content = match.group(2)
        
        # Take the fix_content as base
        resolved = fix_content
        
        # Apply HEAD's 4-tuple fix over fix_content's 2-tuple:
        resolved = resolved.replace(
            'let (_, amm): (Address, Address) = ',
            'let (_, amm, _xlm, _usdc): (Address, Address, Address, Address) = '
        )
        resolved = resolved.replace(
            'let (admin, amm): (Address, Address) = ',
            'let (admin, amm, _xlm, _usdc): (Address, Address, Address, Address) = '
        )
        
        # In test initialization, HEAD has:
        # let xlm = token.clone();
        # let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
        # client.initialize(&admin, &amm, &xlm, &usdc);
        
        if 'client.initialize(&admin, &amm);' in resolved:
            resolved = resolved.replace('client.initialize(&admin, &amm);',
                'let xlm = token.clone();\n        let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();\n        client.initialize(&admin, &amm, &xlm, &usdc);')
            
        return resolved

    # Non-greedy match for conflict markers
    pattern = re.compile(r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> escrow-fix\n?', re.DOTALL)
    
    new_content = pattern.sub(replacer, content)
    
    # Just in case there are other instances of the 2-tuple not in the conflict region
    new_content = new_content.replace(
        'let (_, amm): (Address, Address) = ',
        'let (_, amm, _xlm, _usdc): (Address, Address, Address, Address) = '
    )
    new_content = new_content.replace(
        'let (admin, amm): (Address, Address) = ',
        'let (admin, amm, _xlm, _usdc): (Address, Address, Address, Address) = '
    )

    with open(filepath, 'w') as f:
        f.write(new_content)
        
print("Resolved conflicts.")
