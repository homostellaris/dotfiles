ln -nfs $PWD/config/.gitconfig $HOME/.gitconfig
ln -nfs $PWD/config/.zshrc $HOME/.zshrc
mkdir -p $HOME/.config/direnv/
ln -nfs $PWD/config/direnv.toml $HOME/.config/direnv/direnv.toml
$PWD/scripts/install-gh-cli.sh
# TODO: Install preferred editor
# TODO: Install Work script
# TODO: Some sort of documentation of VS Code settings including snazzy.json
# TODO: Install direnv?
