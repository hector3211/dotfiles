source "$HOME/.config/zsh/.zshrc"

# bun completions
[ -s "/home/drama321/.bun/_bun" ] && source "/home/drama321/.bun/_bun"

# nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
