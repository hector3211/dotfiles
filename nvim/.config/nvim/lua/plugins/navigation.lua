return {
	{
		"folke/snacks.nvim",
		priority = 1000,
		lazy = false,
		opts = {
			explorer = { enabled = false },
			input = { enabled = true },
			notifier = { enabled = true },
			picker = { enabled = true },
			scroll = { enabled = false },
		},
		keys = {
			{
				"<leader><space>",
				function()
					Snacks.picker.files()
				end,
				desc = "Find Files",
			},
			{
				"<leader>,",
				function()
					Snacks.picker.buffers()
				end,
				desc = "Switch Buffer",
			},
			{
				"<leader>/",
				function()
					Snacks.picker.grep()
				end,
				desc = "Grep",
			},
			{
				"<leader>:",
				function()
					Snacks.picker.command_history()
				end,
				desc = "Command History",
			},
			{
				"<leader>\\",
				function()
					Snacks.terminal.toggle()
				end,
				desc = "Toggle Terminal",
			},

			{
				"<leader>fb",
				function()
					Snacks.picker.buffers()
				end,
				desc = "Buffers",
			},
			{
				"<leader>fc",
				function()
					Snacks.picker.files({ cwd = vim.fn.stdpath("config") })
				end,
				desc = "Find Config File",
			},
			{
				"<leader>ff",
				function()
					Snacks.picker.files()
				end,
				desc = "Find Files",
			},
			{
				"<leader>fF",
				function()
					Snacks.picker.files({ cwd = vim.uv.cwd() })
				end,
				desc = "Find Files (cwd)",
			},
			{
				"<leader>fg",
				function()
					Snacks.picker.git_files()
				end,
				desc = "Find Files (git)",
			},
			{
				"<leader>fr",
				function()
					Snacks.picker.recent()
				end,
				desc = "Recent",
			},
			{
				"<leader>fR",
				function()
					Snacks.picker.recent({ cwd = vim.uv.cwd() })
				end,
				desc = "Recent (cwd)",
			},

			{
				"<leader>gc",
				function()
					Snacks.picker.git_log()
				end,
				desc = "Commits",
			},
			{
				"<leader>gs",
				function()
					Snacks.picker.git_status()
				end,
				desc = "Status",
			},

			{
				'<leader>s"',
				function()
					Snacks.picker.registers()
				end,
				desc = "Registers",
			},
			{
				"<leader>sa",
				function()
					Snacks.picker.autocmds()
				end,
				desc = "Auto Commands",
			},
			{
				"<leader>sb",
				function()
					Snacks.picker.lines()
				end,
				desc = "Buffer",
			},
			{
				"<leader>sc",
				function()
					Snacks.picker.command_history()
				end,
				desc = "Command History",
			},
			{
				"<leader>sC",
				function()
					Snacks.picker.commands()
				end,
				desc = "Commands",
			},
			{
				"<leader>sd",
				function()
					Snacks.picker.diagnostics_buffer()
				end,
				desc = "Document Diagnostics",
			},
			{
				"<leader>sD",
				function()
					Snacks.picker.diagnostics()
				end,
				desc = "Workspace Diagnostics",
			},
			{
				"<leader>sg",
				function()
					Snacks.picker.grep()
				end,
				desc = "Grep",
			},
			{
				"<leader>sG",
				function()
					Snacks.picker.grep({ cwd = vim.uv.cwd() })
				end,
				desc = "Grep (cwd)",
			},
			{
				"<leader>sh",
				function()
					Snacks.picker.help()
				end,
				desc = "Help Pages",
			},
			{
				"<leader>sH",
				function()
					Snacks.picker.highlights()
				end,
				desc = "Search Highlight Groups",
			},
			{
				"<leader>sj",
				function()
					Snacks.picker.jumps()
				end,
				desc = "Jumplist",
			},
			{
				"<leader>sk",
				function()
					Snacks.picker.keymaps()
				end,
				desc = "Key Maps",
			},
			{
				"<leader>sl",
				function()
					Snacks.picker.loclist()
				end,
				desc = "Location List",
			},
			{
				"<leader>sM",
				function()
					Snacks.picker.man()
				end,
				desc = "Man Pages",
			},
			{
				"<leader>sm",
				function()
					Snacks.picker.marks()
				end,
				desc = "Jump to Mark",
			},
			{
				"<leader>sR",
				function()
					Snacks.picker.resume()
				end,
				desc = "Resume",
			},
			{
				"<leader>sq",
				function()
					Snacks.picker.qflist()
				end,
				desc = "Quickfix List",
			},
			{
				"<leader>sw",
				function()
					Snacks.picker.grep_word()
				end,
				desc = "Word",
			},
			{
				"<leader>sW",
				function()
					Snacks.picker.grep_word({ cwd = vim.uv.cwd() })
				end,
				desc = "Word (cwd)",
			},
			{
				"<leader>sw",
				function()
					Snacks.picker.grep_word()
				end,
				mode = "v",
				desc = "Selection",
			},
			{
				"<leader>sW",
				function()
					Snacks.picker.grep_word({ cwd = vim.uv.cwd() })
				end,
				mode = "v",
				desc = "Selection (cwd)",
			},
			{
				"<leader>ss",
				function()
					Snacks.picker.lsp_symbols()
				end,
				desc = "Goto Symbol",
			},
			{
				"<leader>sS",
				function()
					Snacks.picker.lsp_workspace_symbols()
				end,
				desc = "Goto Symbol (Workspace)",
			},
			{
				"<leader>uC",
				function()
					Snacks.picker.colorschemes()
				end,
				desc = "Colorscheme with Preview",
			},
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
