#!/bin/bash
# Remove o ERP Maragogi Lab deste Mac. Os DADOS ficam guardados em ~/ERP-Maragogi-Lab/dados.
ROTULO="com.maragogilab.erp"
launchctl bootout "gui/$(id -u)/$ROTULO" 2>/dev/null || launchctl unload "$HOME/Library/LaunchAgents/$ROTULO.plist" 2>/dev/null
rm -f "$HOME/Library/LaunchAgents/$ROTULO.plist"
rm -rf "/Applications/ERP Maragogi Lab.app" "$HOME/Applications/ERP Maragogi Lab.app" "$HOME/Desktop/ERP Maragogi Lab.app"
rm -rf "$HOME/ERP-Maragogi-Lab/app" "$HOME/ERP-Maragogi-Lab/node"
echo "ERP removido. Seus dados continuam em $HOME/ERP-Maragogi-Lab/dados."
