return {
	"stevearc/oil.nvim",
	-- keys = {
	-- 	{
	-- 		"\\",
	-- 		function()
	-- 			require("oil").open_float()
	-- 		end,
	-- 		silent = true,
	-- 	},
	-- },
	opts = {
		keymaps = {
			["<S-h>"] = "actions.toggle_hidden",
			["\\"] = "actions.close",
		},
	},
	-- Optional dependencies
	dependencies = { "nvim-tree/nvim-web-devicons" },
}
