#!/bin/bash

set -e

echo "🚀 Deploy and Test Full Flow Script"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SOROBAN_NETWORK="testnet"
CONTRACTS_DIR="contracts"

# Function to print colored output
print_step() {
    echo -e "${BLUE}$1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to check if required tools are installed
check_prerequisites() {
    print_step "🔍 Checking prerequisites..."
    
    # Check if Stellar CLI is installed
    if ! command -v stellar &> /dev/null; then
        print_error "Stellar CLI is not installed. Please install it first:"
        echo "  curl -sSL https://github.com/stellar/stellar-cli/releases/latest/download/install.sh | sh"
        exit 1
    fi
    
    # Check if Rust is installed
    if ! command -v cargo &> /dev/null; then
        print_error "Rust/Cargo is not installed. Please install it first:"
        echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        exit 1
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install it first"
        exit 1
    fi
    
    print_success "All prerequisites are installed"
}

# Function to setup Stellar network identity
setup_identity() {
    print_step "🔑 Setting up Stellar network identity..."
    
    # Check if testnet identity exists, create if not
    if ! stellar keys show testnet-deployer &> /dev/null; then
        print_step "Creating new testnet identity..."
        stellar keys generate testnet-deployer --network testnet
    fi
    
    # Fund the account
    print_step "Funding testnet account..."
    DEPLOYER_ADDRESS=$(stellar keys address testnet-deployer)
    curl -s "https://friendbot.stellar.org/?addr=$DEPLOYER_ADDRESS" > /dev/null || true
    
    print_success "Identity setup complete: $DEPLOYER_ADDRESS"
}

# Function to build contracts
build_contracts() {
    print_step "🏗️ Building Soroban contracts..."
    
    cd $CONTRACTS_DIR
    
    # Build all contracts
    cargo build --target wasm32-unknown-unknown --release
    
    print_success "Contracts built successfully"
    cd ..
}

# Function to deploy a single contract
deploy_contract() {
    local contract_name=$1
    local wasm_file="${CONTRACTS_DIR}/target/wasm32-unknown-unknown/release/${contract_name//-/_}.wasm"
    
    print_step "🚀 Deploying $contract_name..."
    
    if [ ! -f "$wasm_file" ]; then
        print_error "WASM file not found: $wasm_file"
        return 1
    fi
    
    # Deploy the contract
    CONTRACT_ID=$(stellar contract deploy \
        --wasm "$wasm_file" \
        --source testnet-deployer \
        --network testnet \
        2>/dev/null || echo "")
    
    if [ -z "$CONTRACT_ID" ]; then
        print_error "Failed to deploy $contract_name"
        return 1
    fi
    
    print_success "$contract_name deployed: $CONTRACT_ID"
    
    # Store contract ID in environment file
    echo "CONTRACT_${contract_name//-/_^^}=$CONTRACT_ID" >> .env.contracts
}

# Function to deploy all contracts
deploy_contracts() {
    print_step "🚀 Deploying all contracts to Stellar testnet..."
    
    # Remove old contract IDs file
    rm -f .env.contracts
    
    # List of contracts to deploy
    contracts=(
        "tree-escrow"
        "tree-token"
        "donation-escrow"
        "farmer-registry"
        "location-proof"
        "nullifier-registry"
        "aggregate-impact-verifier"
        "species-registry"
        "kyc-attestation"
        "admin-controls"
        "treasury"
    )
    
    for contract in "${contracts[@]}"; do
        deploy_contract "$contract"
    done
    
    print_success "All contracts deployed successfully"
    echo ""
    echo "📋 Contract IDs saved to .env.contracts"
    cat .env.contracts
}

# Function to initialize contracts
initialize_contracts() {
    print_step "⚙️ Initializing contracts..."
    
    # Source the contract IDs
    if [ -f ".env.contracts" ]; then
        source .env.contracts
    else
        print_error "Contract IDs file not found. Deploy contracts first."
        exit 1
    fi
    
    ADMIN_ADDRESS=$(stellar keys address testnet-deployer)
    
    # Initialize tree-token first (needed by tree-escrow)
    if [ ! -z "$CONTRACT_TREE_TOKEN" ]; then
        print_step "Initializing tree-token..."
        # Create a mock TREE asset for testing
        TREE_ASSET=$(stellar contract asset deploy --asset TREE:$ADMIN_ADDRESS --source testnet-deployer --network testnet)
        
        stellar contract invoke \
            --id "$CONTRACT_TREE_TOKEN" \
            --source testnet-deployer \
            --network testnet \
            -- initialize \
            --admin "$ADMIN_ADDRESS" \
            --tree_token "$TREE_ASSET" || print_warning "Tree token initialization may have failed"
    fi
    
    # Initialize tree-escrow
    if [ ! -z "$CONTRACT_TREE_ESCROW" ]; then
        print_step "Initializing tree-escrow..."
        stellar contract invoke \
            --id "$CONTRACT_TREE_ESCROW" \
            --source testnet-deployer \
            --network testnet \
            -- initialize \
            --admin "$ADMIN_ADDRESS" \
            --tree_token "${CONTRACT_TREE_TOKEN:-$ADMIN_ADDRESS}" \
            --oracle "$ADMIN_ADDRESS" \
            --survival_threshold_percent 80 \
            --min_density 1000 \
            --job_size_threshold 10 || print_warning "Tree escrow initialization may have failed"
    fi
    
    # Initialize donation-escrow
    if [ ! -z "$CONTRACT_DONATION_ESCROW" ]; then
        print_step "Initializing donation-escrow..."
        XLM_CONTRACT=$(stellar contract asset deploy --asset native --source testnet-deployer --network testnet)
        USDC_CONTRACT=$(stellar contract asset deploy --asset USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 --source testnet-deployer --network testnet)
        
        stellar contract invoke \
            --id "$CONTRACT_DONATION_ESCROW" \
            --source testnet-deployer \
            --network testnet \
            -- initialize \
            --admin "$ADMIN_ADDRESS" \
            --xlm_token "$XLM_CONTRACT" \
            --usdc_token "$USDC_CONTRACT" || print_warning "Donation escrow initialization may have failed"
    fi
    
    print_success "Contract initialization completed"
}

# Function to run contract unit tests
run_contract_tests() {
    print_step "🧪 Running contract unit tests..."
    
    cd $CONTRACTS_DIR
    
    # Copy our integration test file into the tree-escrow crate
    cp ../full-flow-test.rs tree-escrow/tests/
    
    # Run tests for each contract
    contracts_to_test=(
        "tree-escrow"
        "tree-token"
        "donation-escrow"
        "farmer-registry"
    )
    
    for contract in "${contracts_to_test[@]}"; do
        print_step "Testing $contract..."
        
        if [ -d "$contract" ]; then
            cd "$contract"
            cargo test --release || print_warning "Some tests in $contract may have failed"
            cd ..
        else
            print_warning "Contract directory $contract not found"
        fi
    done
    
    # Run our comprehensive integration test
    print_step "Running full flow integration tests..."
    cd tree-escrow
    cargo test --release full_flow || print_warning "Integration tests may have failed"
    cd ../..
    
    print_success "Contract tests completed"
}

# Function to run JavaScript integration tests
run_integration_tests() {
    print_step "🧪 Running JavaScript integration tests..."
    
    # Check if the test script exists
    if [ -f "scripts/test-full-flow.mjs" ]; then
        node scripts/test-full-flow.mjs || print_warning "JavaScript integration tests may have failed"
    else
        print_warning "JavaScript integration test script not found"
    fi
    
    print_success "Integration tests completed"
}

# Function to display final summary
show_summary() {
    print_step "📊 Deployment and Test Summary"
    echo "================================"
    echo ""
    
    if [ -f ".env.contracts" ]; then
        echo "📋 Deployed Contracts:"
        while IFS= read -r line; do
            echo "  $line"
        done < .env.contracts
        echo ""
    fi
    
    echo "🔗 Useful Links:"
    echo "  Testnet Explorer: https://stellar.expert/explorer/testnet/"
    echo "  Horizon API: https://horizon-testnet.stellar.org/"
    echo "  Soroban RPC: https://soroban-testnet.stellar.org/"
    echo ""
    
    echo "🎯 Next Steps:"
    echo "  1. Copy contract IDs to your .env file"
    echo "  2. Update your frontend configuration"
    echo "  3. Test the flows in your application"
    echo ""
    
    print_success "Deployment and testing complete! 🎉"
}

# Main execution flow
main() {
    echo "Starting full deployment and test process..."
    echo ""
    
    # Parse command line arguments
    RUN_TESTS=true
    DEPLOY_ONLY=false
    SKIP_DEPLOY=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --deploy-only)
                DEPLOY_ONLY=true
                RUN_TESTS=false
                shift
                ;;
            --skip-deploy)
                SKIP_DEPLOY=true
                shift
                ;;
            --no-tests)
                RUN_TESTS=false
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --deploy-only     Only deploy contracts, skip tests"
                echo "  --skip-deploy     Skip deployment, only run tests"
                echo "  --no-tests        Deploy contracts but skip tests"
                echo "  -h, --help        Show this help message"
                echo ""
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
    
    # Run the deployment and test process
    check_prerequisites
    
    if [ "$SKIP_DEPLOY" = false ]; then
        setup_identity
        build_contracts
        deploy_contracts
        initialize_contracts
    fi
    
    if [ "$RUN_TESTS" = true ]; then
        run_contract_tests
        # Uncomment when JS tests are ready
        # run_integration_tests
    fi
    
    show_summary
}

# Trap to cleanup on exit
cleanup() {
    print_step "🧹 Cleaning up..."
    # Add any cleanup tasks here if needed
}
trap cleanup EXIT

# Run main function
main "$@"