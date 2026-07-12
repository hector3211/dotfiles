return {
	{
		"folke/snacks.nvim",
		opts = {
			explorer = { enabled = false },
			scroll = { enabled = false },
		},
	},
	{
		"stevearc/oil.nvim",
		dependencies = { "nvim-tree/nvim-web-devicons" },
		lazy = false,
		opts = {
			default_file_explorer = true,
			keymaps = {
				["<S-h>"] = "actions.toggle_hidden",
				["\\"] = "actions.close",
			},
		},
		keys = {
			{
				"<leader>e",
				function()
					require("oil").toggle_float()
				end,
				desc = "Toggle Oil",
			},
			{
				"<leader>E",
				function()
					require("oil").open_float(vim.uv.cwd())
				end,
				desc = "Oil (cwd)",
			},
			{
				"<leader>fe",
				function()
					require("oil").open_float(LazyVim.root())
				end,
				desc = "Oil (root dir)",
			},
			{
				"<leader>fE",
				function()
					require("oil").open_float(vim.uv.cwd())
				end,
				desc = "Oil (cwd)",
			},
		},
	},
}
