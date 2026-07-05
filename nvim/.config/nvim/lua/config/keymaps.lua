-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here
local keymap = vim.keymap
local opts = { noremap = true, silent = true }

-- Highlight on search, but clear on pressing <Esc> in normal mode
keymap.set("n", "<Esc>", ":nohlsearch<CR>", opts)

-- Removing some default keymaps
keymap.del("n", "[q", opts)
-- keymap.del("n", "<leader>ca", opts)
-- keymap.del("v", "<leader>ca", opts)
-- keymap.del("n", "<leader>cr", opts)

keymap.set("n", "<leader>a", function()
	vim.lsp.buf.code_action()
end, { desc = "Lsp Code Action" })
keymap.set("n", "<leader>r", function()
	vim.lsp.buf.rename()
end, { desc = "Lsp Rename Target" })

-- Cycle buffers
keymap.set("n", "<Tab>", ":bnext<CR>", opts)
keymap.set("n", "<S-Tab>", ":bprevious<CR>", opts)
--Quit buffer
keymap.set("n", "<C-q>", ":bdelete<CR>", opts)
-- move highlighted line up or down
keymap.set("v", "J", ":m '>+1<CR>gv=gv", opts) -- down
keymap.set("v", "K", ":m '<-2<CR>gv=gv", opts) -- up
-- yank/copy maps
-- keymap.set("n", "<leader>y", "''+y") -- for mac users
keymap.set("n", "<leader>y", "+y")
keymap.set("v", "<leader>y", "+y")
keymap.set("n", "<leader>Y", "+Y")

-- Diagnostics
keymap.set("n", "<leader>n", function()
	vim.diagnostic.jump({ count = 1, float = true })
end, { desc = "Lsp: go to next indicator" })
keymap.set("n", "<leader>p", function()
	vim.diagnostic.jump({ count = -1, float = true })
end, { desc = "Lsp: go to previous indicator" })

-- TSC autocommand keybind to run TypeScripts tsc
keymap.set("n", "<leader>tc", ":TSC<cr>", { desc = "[T]ypeScript [C]ompile" })
