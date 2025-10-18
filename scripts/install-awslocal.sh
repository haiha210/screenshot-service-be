#!/bin/bash

# Script to install awslocal in project's virtual environment
# Virtual environment will be created in ./venv directory

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$PROJECT_DIR/venv"
ACTIVATE_SCRIPT="$VENV_DIR/bin/activate"

echo -e "${BLUE}"
cat << "EOF"
╔═══════════════════════════════════════╗
║   awslocal Installation (Project)     ║
║   Local Virtual Environment           ║
╚═══════════════════════════════════════╝
EOF
echo -e "${NC}"

echo "Project directory: $PROJECT_DIR"
echo ""

# Check if Python3 is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python3 is not installed!${NC}"
    echo "Installing Python3..."
    sudo apt-get update
    sudo apt-get install -y python3 python3-pip python3-venv
fi

echo -e "${GREEN}✓ Python3 found: $(python3 --version)${NC}"

# Create virtual environment
echo -e "\n${GREEN}[1/4] Creating virtual environment in project...${NC}"

if [ -d "$VENV_DIR" ]; then
    echo -e "${YELLOW}Virtual environment already exists at: $VENV_DIR${NC}"
    read -p "Do you want to recreate it? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$VENV_DIR"
        python3 -m venv "$VENV_DIR"
        echo -e "${GREEN}✓ Virtual environment recreated${NC}"
    fi
else
    python3 -m venv "$VENV_DIR"
    echo -e "${GREEN}✓ Virtual environment created at: $VENV_DIR${NC}"
fi

# Activate virtual environment
echo -e "\n${GREEN}[2/4] Activating virtual environment...${NC}"
source "$ACTIVATE_SCRIPT"
echo -e "${GREEN}✓ Virtual environment activated${NC}"

# Upgrade pip
echo -e "\n${GREEN}[3/4] Upgrading pip...${NC}"
pip install --upgrade pip wheel setuptools
echo -e "${GREEN}✓ pip upgraded: $(pip --version)${NC}"

# Install awscli and awscli-local
echo -e "\n${GREEN}[4/4] Installing packages...${NC}"
pip install awscli awscli-local

echo -e "${GREEN}✓ Packages installed:${NC}"
pip list | grep -E "awscli|awscli-local"

# Create activation helper script
HELPER_SCRIPT="$PROJECT_DIR/activate-awslocal.sh"
cat > "$HELPER_SCRIPT" << 'HELPER_EOF'
#!/bin/bash
# Helper script to activate awslocal virtual environment

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$PROJECT_DIR/venv/bin/activate"

echo "awslocal virtual environment activated"
echo ""
echo "Available commands:"
echo "  awslocal --version"
echo "  awslocal s3 ls"
echo "  awslocal sqs list-queues"
echo "  awslocal dynamodb list-tables"
echo ""
echo "To deactivate: deactivate"
HELPER_EOF

chmod +x "$HELPER_SCRIPT"
echo -e "\n${GREEN}✓ Helper script created: $HELPER_SCRIPT${NC}"

# Create .envrc for direnv (optional)
ENVRC_FILE="$PROJECT_DIR/.envrc"
if ! [ -f "$ENVRC_FILE" ]; then
    cat > "$ENVRC_FILE" << 'ENVRC_EOF'
# Automatically activate virtual environment when entering directory
# Requires direnv (https://direnv.net/)
source venv/bin/activate
ENVRC_EOF
    echo -e "${GREEN}✓ .envrc created (for direnv support)${NC}"
fi

# Update .gitignore
GITIGNORE_FILE="$PROJECT_DIR/.gitignore"
if ! grep -q "^venv/$" "$GITIGNORE_FILE" 2>/dev/null; then
    echo -e "\n# Python virtual environment" >> "$GITIGNORE_FILE"
    echo "venv/" >> "$GITIGNORE_FILE"
    echo "/activate-awslocal.sh" >> "$GITIGNORE_FILE"
    echo -e "${GREEN}✓ .gitignore updated${NC}"
fi

# Create VS Code settings (optional)
VSCODE_DIR="$PROJECT_DIR/.vscode"
VSCODE_SETTINGS="$VSCODE_DIR/settings.json"
mkdir -p "$VSCODE_DIR"

if [ ! -f "$VSCODE_SETTINGS" ]; then
    cat > "$VSCODE_SETTINGS" << 'VSCODE_EOF'
{
  "python.defaultInterpreterPath": "${workspaceFolder}/venv/bin/python",
  "python.terminal.activateEnvironment": true
}
VSCODE_EOF
    echo -e "${GREEN}✓ VS Code settings created${NC}"
fi

# Deactivate venv
deactivate

# Summary
echo -e "\n${BLUE}"
cat << "EOF"
╔═══════════════════════════════════════╗
║   Installation Complete!              ║
╚═══════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${GREEN}Virtual environment:${NC}"
echo "  Location: $VENV_DIR"
echo "  Python: $VENV_DIR/bin/python"
echo "  awslocal: $VENV_DIR/bin/awslocal"

echo -e "\n${GREEN}Installed packages:${NC}"
source "$ACTIVATE_SCRIPT"
pip list | grep -E "awscli|awscli-local" | sed 's/^/  /'
deactivate

echo -e "\n${YELLOW}Usage:${NC}"
echo ""
echo "1. Activate virtual environment:"
echo -e "   ${BLUE}source venv/bin/activate${NC}"
echo "   or"
echo -e "   ${BLUE}source activate-awslocal.sh${NC}"
echo "   or"
echo -e "   ${BLUE}. venv/bin/activate${NC}"
echo ""
echo "2. Use awslocal commands:"
echo -e "   ${BLUE}awslocal s3 ls${NC}"
echo -e "   ${BLUE}awslocal sqs list-queues${NC}"
echo -e "   ${BLUE}awslocal dynamodb list-tables${NC}"
echo ""
echo "3. Deactivate when done:"
echo -e "   ${BLUE}deactivate${NC}"

echo -e "\n${GREEN}Quick test:${NC}"
echo -e "   ${BLUE}source venv/bin/activate${NC}"
echo -e "   ${BLUE}awslocal --version${NC}"
echo -e "   ${BLUE}deactivate${NC}"

echo -e "\n${YELLOW}Optional - Install direnv for auto-activation:${NC}"
echo "   sudo apt-get install direnv"
echo "   echo 'eval \"\$(direnv hook zsh)\"' >> ~/.zshrc"
echo "   direnv allow ."

echo -e "\n${GREEN}Makefile integration:${NC}"
echo "Add these targets to your Makefile:"
echo ""
cat << 'MAKEFILE_EOF'
venv: ## Create virtual environment
	python3 -m venv venv
	source venv/bin/activate && pip install --upgrade pip
	source venv/bin/activate && pip install awscli awscli-local

awslocal: venv ## Activate venv and show awslocal help
	@echo "Run: source venv/bin/activate"
MAKEFILE_EOF

echo ""
