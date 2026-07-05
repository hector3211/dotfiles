# Neovim Config

Personal [LazyVim](https://github.com/LazyVim/LazyVim) setup.

Navigation plugins live in `lua/plugins/navigation.lua`:

- `folke/snacks.nvim` for picker, input, notifications, and terminal
- `stevearc/oil.nvim` for file editing/navigation

Oil owns the explorer mappings: `<leader>e`, `<leader>E`, `<leader>fe`, and `<leader>fE`.

Intentionally disabled for a slimmer setup: `fzf-lua`, Harpoon, Neo-tree, Snacks Explorer, and Treesitter-related plugins.

Lua formatting uses `stylua`.
