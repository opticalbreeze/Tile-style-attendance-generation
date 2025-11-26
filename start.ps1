# スクリプトのディレクトリに移動
Set-Location $PSScriptRoot

# 仮想環境をアクティベート
& ".\venv\Scripts\Activate.ps1"

# アプリケーションを起動
python app.py

