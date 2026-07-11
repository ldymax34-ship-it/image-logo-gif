#!/bin/zsh
cd "$(dirname "$0")"
/usr/bin/env node scripts/start.mjs
exit $?
