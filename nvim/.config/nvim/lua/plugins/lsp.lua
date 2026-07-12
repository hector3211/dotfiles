return {
	{
		"neovim/nvim-lspconfig",
		opts = {
			inlay_hints = { enabled = false },
			servers = {
				gopls = {},
				cssls = {},
				tailwindcss = {},
				vtsls = {},
				html = {},
				yamlls = {
					settings = {
						yaml = {
							keyOrdering = false,
							customTags = {
								"!Ref scalar",
								"!Sub scalar",
								"!GetAtt scalar",
								"!Join sequence",
								"!Select sequence",
								"!Split sequence",
								"!If sequence",
								"!Equals sequence",
								"!And sequence",
								"!Or sequence",
								"!Not sequence",
								"!FindInMap sequence",
								"!ImportValue scalar",
								"!Condition scalar",
							},
						},
					},
				},
				lua_ls = {
					settings = {
						Lua = {
							diagnostics = {
								disable = { "incomplete-signature-doc", "trailing-space" },
								unusedLocalExclude = { "_*" },
							},
							format = { enable = false },
						},
					},
				},
			},
		},
	},
}
