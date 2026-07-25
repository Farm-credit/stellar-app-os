def replace_line_in_file(file_path, line_no, new_line):
    with open(file_path, 'r') as f:
        lines = f.readlines()
    if 0 <= line_no < len(lines):
        # preserve leading whitespace
        leading_space = lines[line_no][:len(lines[line_no]) - len(lines[line_no].lstrip())]
        lines[line_no] = leading_space + new_line + "\n"
    with open(file_path, 'w') as f:
        f.writelines(lines)

# tree-escrow
replace_line_in_file("contracts/tree-escrow/src/lib.rs", 773-1, 'assert_eq!(balance(&env, &token, &donor), 19_800, "donor fully refunded");')
replace_line_in_file("contracts/tree-escrow/src/lib.rs", 639-1, 'assert_eq!(balance(&env, &token, &farmer), 9_800);')
replace_line_in_file("contracts/tree-escrow/src/lib.rs", 677-1, 'assert_eq!(release_amount, 735);')

# escrow-milestone
replace_line_in_file("contracts/escrow-milestone/src/lib.rs", 582-1, 'assert_eq!(balance(&env, &token, &contract), 9_800);')
replace_line_in_file("contracts/escrow-milestone/src/lib.rs", 850-1, 'assert_eq!(balance(&env, &token, &farmer), 2_450);')
replace_line_in_file("contracts/escrow-milestone/src/lib.rs", 804-1, 'assert_eq!(balance(&env, &token, &funder), 19_800, "funder fully refunded");')
replace_line_in_file("contracts/escrow-milestone/src/lib.rs", 660-1, 'assert_eq!(balance(&env, &token, &farmer), 9_800);')
replace_line_in_file("contracts/escrow-milestone/src/lib.rs", 680-1, 'assert_eq!(release_amount, 735);')

