return {
	-- tools
	{
		{ "mason-org/mason.nvim" },
		{
			"mason-org/mason-lspconfig.nvim",
			automatic_enable = {
				"stylua",
				"luacheck",
				"shellcheck",
				"shfmt",
				"tailwindcss-language-server",
				"vtsls",
				"css-lsp",
				"gopls",
			},
		},
	},
	-- lsp servers
	{
		"neovim/nvim-lspconfig",
		opts = {
			inlay_hints = { enabled = false },
			---@type lspconfig.options
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
					-- enabled = false,
					single_file_support = true,
					settings = {
						Lua = {
							workspace = {
								checkThirdParty = false,
							},
							completion = {
								workspaceWord = true,
								callSnippet = "Both",
							},
							misc = {
								parameters = {
									-- "--log-level=trace",
								},
							},
							hint = {
								enable = true,
								setType = false,
								paramType = true,
								paramName = "Disable",
								semicolon = "Disable",
								arrayIndex = "Disable",
							},
							doc = {
								privateName = { "^_" },
							},
							type = {
								castNumberToInteger = true,
							},
							diagnostics = {
								disable = { "incomplete-signature-doc", "trailing-space" },
								-- enable = false,
								groupSeverity = {
									strong = "Warning",
									strict = "Warning",
								},
								groupFileStatus = {
									["ambiguity"] = "Opened",
									["await"] = "Opened",
									["codestyle"] = "None",
									["duplicate"] = "Opened",
									["global"] = "Opened",
									["luadoc"] = "Opened",
									["redefined"] = "Opened",
									["strict"] = "Opened",
									["strong"] = "Opened",
									["type-check"] = "Opened",
									["unbalanced"] = "Opened",
									["unused"] = "Opened",
								},
								unusedLocalExclude = { "_*" },
							},
							format = {
								enable = false,
								defaultConfig = {
									indent_style = "space",
									indent_size = "2",
									continuation_indent_size = "2",
								},
							},
						},
					},
				},
			},
			setup = {},
		},
	},
}
