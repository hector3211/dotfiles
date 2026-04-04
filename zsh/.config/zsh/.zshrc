# For zsh Completions
# autoload -U compinit && compinit

# export GSK_RENDERER=default

# zshrc file shortcut
alias zcon="nvim ~/.config/zsh/.zshrc"
# nvim file shortcut
alias ncon="nvim ~/.config/nvim"
alias code="opencode"
# Tmux colors
# alias tmux="TERM=xterm-256color tmux"
# Tmux file shortcut
alias tcon="nvim ~/.config/tmux/tmux.conf"
# starship config
alias scon="nvim ~/.config/starship.toml"
# Vault
alias notes="nvim personal/vault"
#Git
alias ga="git add"
alias gc="git commit"
alias gcl="git clone"
alias gco="git checkout"
alias gp="git push"
alias gpl="git pull"
alias gs="git status"
alias gsw="git switch"
alias gsh="git show --quiet"
alias gd="git diff"
alias gf="git fetch"
alias gb="git branch"
alias gbr="git branch -r"
alias gwt="git worktree"
alias gm="git merge"


export PATH="/usr/local/bin:$PATH"
# Zig
export PATH=/opt/zig-0.14:$PATH

# GOPATH
export GOROOT=/usr/local/go
export GOPATH=$HOME/go 
export PATH=$PATH:$GOROOT/bin:$GOPATH/bin

# Upgrade Go
alias go-upgrade="$HOME/go-upgrade"

# Bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
# Bun Completions
[ -s "/home/drama321/.bun/_bun" ] && source "/home/drama321/.bun/_bun"

# AWS 
# export AWS_CLI_AUTO_PROMPT=on-partial


# NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"

# zsh suggestion
# source ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh

# Automatically start tmux when opening a new terminal
# if command -v tmux &> /dev/null; then
#   # Check if inside tmux, and only start a new session if not
#   if [ -z "$TMUX" ]; then
#     # If no existing tmux sessions, create a new one, otherwise attach to the first one
#     tmux attach-session || tmux new-session
#   fi
# fi
#

# Startship
eval "$(starship init zsh)"

# zoxide
eval "$(zoxide init zsh)"

# Turso
export PATH="$PATH:/home/drama321/.turso"
export PATH="$HOME/.cargo/bin:$PATH"
