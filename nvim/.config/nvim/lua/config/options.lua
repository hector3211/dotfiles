-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

vim.scriptencoding = "utf-8"
vim.opt.encoding = "utf-8"
vim.opt.fileencoding = "utf-8"
vim.opt.number = true
vim.opt.relativenumber = true
vim.g.loaded = 1
vim.g.loaded_netrwPlugin = 1
-- TABS
vim.opt.smarttab = true
vim.opt.shiftwidth = 4
vim.opt.tabstop = 4
vim.opt.expandtab = true

vim.opt.ai = true -- Auto indent
vim.opt.si = true -- Smart indent
vim.opt.wrap = false -- No Wrap lines
vim.opt.title = true
vim.opt.autoindent = true
vim.opt.smartindent = true
-- Searching highlights
vim.opt.hlsearch = true
vim.opt.incsearch = true

vim.opt.backup = false
vim.opt.showcmd = true
vim.opt.cmdheight = 1
vim.opt.laststatus = 2
vim.opt.scrolloff = 10

-- The Primeagen settings
vim.g.mapleader = " "
vim.opt.colorcolumn = "80"

vim.opt.signcolumn = "yes"
vim.opt.updatetime = 50
