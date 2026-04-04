# dotfiles

Managed with GNU Stow.

## Packages

- `zsh`
- `tmux`
- `wezterm`
- `starship`
- `nvim`
- `opencode`

## Stow

From this directory:

```bash
stow -t "$HOME" zsh tmux wezterm starship nvim opencode
```

## Notes

- `zsh`, `tmux`, and `wezterm` use small top-level shim files so the real configs live under `.config`.
- `opencode/.config/opencode/opencode.json` is intentionally gitignored because it contains local secrets.
- Commit `opencode/.config/opencode/opencode.json.example` instead when sharing config.
