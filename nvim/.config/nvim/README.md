# Neovim Config

Personal [LazyVim](https://github.com/LazyVim/LazyVim) setup.

Custom plugins are grouped by purpose:

- `lua/plugins/navigation.lua` configures Snacks and Oil navigation
- `lua/plugins/lsp.lua` contains only custom server behavior
- `lua/plugins/ui.lua` contains colorscheme and interface overrides
- `lua/plugins/disabled.lua` documents intentionally disabled LazyVim plugins

Oil owns the explorer mappings: `<leader>e`, `<leader>E`, `<leader>fe`, and `<leader>fE`.
LazyVim supplies the standard Snacks picker mappings and language tooling defaults.

Intentionally disabled for a slimmer setup: `fzf-lua`, Harpoon, Neo-tree, Snacks Explorer, and Treesitter-related plugins.

Lua formatting uses `stylua`.
