local wezterm = require("wezterm")
local config = wezterm.config_builder()

config.color_scheme = "Tokyo Night Storm"
config.font_size = 20
config.line_height = 1.3

-- config.font = wezterm.font("Hack Nerd Font Mono", { weight = "Regular", italic = false })
config.font = wezterm.font("JetBrainsMono Nerd Font", { weight = "Regular", italic = false })
config.tab_max_width = 13
config.window_decorations = "NONE"
config.max_fps = 120
config.animation_fps = 120
config.scrollback_lines = 10000

config.window_padding = {
	left = 5,
	right = 5,
	top = 2,
	bottom = 0,
}

config.hide_tab_bar_if_only_one_tab = true
config.tab_bar_at_bottom = true
config.use_fancy_tab_bar = false
config.tab_and_split_indices_are_zero_based = true

-- The filled in variant of the < symbol
local SOLID_LEFT_ARROW = wezterm.nerdfonts.pl_right_hard_divider

-- The filled in variant of the > symbol
local SOLID_RIGHT_ARROW = wezterm.nerdfonts.pl_left_hard_divider

-- This function returns the suggested title for a tab.
-- It prefers the title that was set via `tab:set_title()`
-- or `wezterm cli set-tab-title`, but falls back to the
-- title of the active pane in that tab.
function tab_title(tab_info)
	local title = tab_info.tab_title
	-- if the tab title is explicitly set, take that
	if title and #title > 0 then
		return title
	end
	-- Otherwise, use the title from the active pane
	-- in that tab
	return tab_info.active_pane.title
end

wezterm.on("format-tab-title", function(tab, tabs, panes, config, hover, max_width)
	local edge_background = "#1f2335"
	local background = "#24283b"
	local foreground = "#808080"

	if tab.is_active then
		-- background = "#4fd6be"
		-- foreground = "#1f2335"
		background = "#1f2335"
		foreground = "#4fd6be"
	elseif hover then
		background = "#292e42"
		foreground = "#545c7e"
	end

	local edge_foreground = background

	local index = tostring(tab.tab_index)
	local title = tab_title(tab)

	-- ensure that the titles fit in the available space,
	-- and that we have room for the edges.
	-- title = wezterm.truncate_right(title, max_width - 2)
	title = wezterm.truncate_right(title, max_width - 2)

	padding_title = " " .. index .. ": " .. title .. " "

	return {
		-- { Background = { Color = edge_foreground } },
		-- { Foreground = { Color = edge_background } },
		-- { Text = SOLID_RIGHT_ARROW },
		{ Background = { Color = background } },
		{ Foreground = { Color = foreground } },
		{ Text = padding_title },
		-- { Background = { Color = edge_background } },
		-- { Foreground = { Color = edge_foreground } },
		-- { Text = SOLID_RIGHT_ARROW },
	}
end)
return config
